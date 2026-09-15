const api = require("../../utils/api");
const cardCondition = require("../../utils/cardCondition");

Page({
  data: {
    id: "",
    card: {},
    quantity: 1,
    condition: "",
    notes: "",
    conditions: cardCondition.CONDITIONS,
    saving: false,
    missing: false,
    showingBack: false,
    catalogMode: false,
  },
  onLoad(q) {
    this.setData({
      id: q.id || "",
      catalogMode: q.from === "catalog",
    });
  },
  onShow() {
    this.load();
  },
  load() {
    if (!this.data.id) return;
    if (this.data.catalogMode) {
      this.loadCatalog();
      return;
    }
    api
      .request({ url: `/collection/cards/${this.data.id}` })
      .then((card) => {
        this.setData({
          missing: false,
          card: {
            ...card,
            mainImageUrl: api.mediaUrl(card.mainImageUrl),
            imageBack: card.imageBack ? api.mediaUrl(card.imageBack) : "",
          },
          quantity: cardCondition.clampQuantity(card.quantity),
          condition: card.condition || "",
          notes: card.notes || "",
        });
      })
      .catch((err) => {
        if (err && err.status === 404) {
          this.setData({ missing: true, card: {} });
          wx.showToast({ title: "尚未拥有该卡", icon: "none" });
          return;
        }
        api.handleWriteError(err);
      });
  },
  loadCatalog() {
    api
      .request({ url: `/catalog/templates/${this.data.id}`, auth: false })
      .then((d) => {
        const card = d.template || d;
        this.setData({
          missing: false,
          card: {
            ...card,
            mainImageUrl: api.mediaUrl(card.mainImageUrl),
            imageBack: card.imageBack ? api.mediaUrl(card.imageBack) : "",
          },
        });
      })
      .catch((err) => {
        if (err && err.status === 404) {
          this.setData({ missing: true, card: {} });
          wx.showToast({ title: "卡片不存在", icon: "none" });
          return;
        }
        api.handleWriteError(err);
      });
  },
  ownOne() {
    if (!this.data.id) return;
    api
      .request({
        url: "/collection/cards",
        method: "POST",
        data: { items: [{ templateId: this.data.id, quantity: 1 }] },
      })
      .then(() => wx.showToast({ title: "已标记拥有" }))
      .catch(api.handleWriteError);
  },
  wantOne() {
    if (!this.data.id) return;
    api
      .request({
        url: "/collection/wants",
        method: "POST",
        data: { templateId: this.data.id },
      })
      .then((data) => {
        if (api.isOwnWantMutex(data)) {
          wx.showToast({ title: data.message || "已拥有，无法加入想要", icon: "none" });
          return;
        }
        wx.showToast({ title: "已加入想要" });
      })
      .catch(api.handleWriteError);
  },
  decQty() {
    this.setData({ quantity: cardCondition.clampQuantity(this.data.quantity - 1) });
  },
  incQty() {
    this.setData({ quantity: cardCondition.clampQuantity(this.data.quantity + 1) });
  },
  pickCondition(e) {
    this.setData({ condition: e.currentTarget.dataset.value || "" });
  },
  onNotes(e) {
    this.setData({ notes: e.detail.value || "" });
  },
  save() {
    if (this.data.saving || this.data.missing || !this.data.id) return;
    this.setData({ saving: true });
    const data = cardCondition.toPatchBody({
      quantity: this.data.quantity,
      condition: this.data.condition,
      notes: this.data.notes,
    });
    api
      .request({
        url: `/collection/cards/${this.data.id}`,
        method: "PATCH",
        data,
      })
      .then((saved) => {
        this.setData({
          saving: false,
          quantity: cardCondition.clampQuantity(saved.quantity),
          condition: saved.condition || "",
          notes: saved.notes || "",
        });
        wx.showToast({ title: "已保存" });
      })
      .catch((err) => {
        this.setData({ saving: false });
        api.handleWriteError(err);
      });
  },
  flip() {
    this.setData({ showingBack: !this.data.showingBack });
  },
  report() {
    if (!this.data.id) return;
    wx.showModal({
      title: "举报",
      editable: true,
      placeholderText: "请说明原因",
      success: (res) => {
        if (!res.confirm) return;
        api
          .request({
            url: `/catalog/templates/${this.data.id}/report`,
            method: "POST",
            data: { text: res.content || "用户举报" },
          })
          .then(() => wx.showToast({ title: "已提交" }))
          .catch(api.handleWriteError);
      },
    });
  },
});
