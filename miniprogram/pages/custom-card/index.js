const api = require("../../utils/api");
const cardCondition = require("../../utils/cardCondition");
const customCard = require("../../utils/customCard");

Page({
  data: {
    id: "",
    card: {},
    quantity: 1,
    condition: "",
    title: "",
    note: "",
    conditions: cardCondition.CONDITIONS,
    saving: false,
    missing: false,
    canPreview: false,
  },
  onLoad(q) {
    this.setData({ id: q.id || "" });
  },
  onShow() {
    this.load();
  },
  load() {
    if (!this.data.id) return;
    api
      .request({ url: `/collection/custom-cards/${this.data.id}` })
      .then((card) => {
        const decorated = customCard.decorateCustomCard(card, api.mediaUrl);
        this.setData({
          missing: false,
          card: decorated,
          quantity: cardCondition.clampQuantity(card.quantity),
          condition: card.condition || "",
          title: card.title || "",
          note: card.note || card.notes || "",
          canPreview: customCard.canOpenFullscreen(decorated.moderationStatus),
        });
      })
      .catch((err) => {
        if (err && err.status === 404) {
          this.setData({ missing: true, card: {} });
          wx.showToast({ title: "自定义卡不存在", icon: "none" });
          return;
        }
        api.handleWriteError(err);
      });
  },
  onTitle(e) {
    this.setData({ title: e.detail.value || "" });
  },
  onNote(e) {
    this.setData({ note: e.detail.value || "" });
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
  openPreview() {
    if (!this.data.canPreview) return;
    customCard.openFullscreen(this.data.card.mainImageUrl);
  },
  save() {
    if (this.data.saving || this.data.missing || !this.data.id) return;
    this.setData({ saving: true });
    api
      .request({
        url: `/collection/custom-cards/${this.data.id}`,
        method: "PATCH",
        data: {
          quantity: this.data.quantity,
          condition: this.data.condition || null,
          title: this.data.title,
          note: this.data.note,
        },
      })
      .then(() => {
        this.setData({ saving: false });
        wx.showToast({ title: "已保存" });
        this.load();
      })
      .catch((err) => {
        this.setData({ saving: false });
        api.handleWriteError(err);
      });
  },
  remove() {
    const id = this.data.id;
    wx.showModal({
      title: "删除自定义卡",
      content: "删除后不可恢复",
      success: (res) => {
        if (!res.confirm) return;
        api
          .request({ url: `/collection/custom-cards/${id}`, method: "DELETE" })
          .then(() => {
            wx.showToast({ title: "已删除" });
            setTimeout(() => wx.navigateBack(), 400);
          })
          .catch(api.handleWriteError);
      },
    });
  },
});
