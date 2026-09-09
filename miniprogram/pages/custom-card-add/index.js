const api = require("../../utils/api");
const cardCondition = require("../../utils/cardCondition");
const customCard = require("../../utils/customCard");

Page({
  data: {
    preview: "",
    title: "",
    note: "",
    quantity: 1,
    condition: "",
    conditions: cardCondition.CONDITIONS,
    groups: [],
    groupId: "",
    saving: false,
  },
  onLoad(q) {
    if (q && q.groupId) this.setData({ groupId: q.groupId });
  },
  onShow() {
    this.loadGroups();
  },
  loadGroups() {
    api
      .request({ url: "/catalog/groups", auth: false })
      .then((data) => this.setData({ groups: data.groups || [] }))
      .catch(() => {});
  },
  pickImage() {
    const choose = typeof wx.chooseMedia === "function" ? wx.chooseMedia : null;
    const done = (filePath) => {
      this._filePath = filePath;
      this.setData({ preview: filePath });
    };
    if (choose) {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["compressed"],
        success: (res) => {
          const f = res.tempFiles && res.tempFiles[0];
          if (f && f.tempFilePath) done(f.tempFilePath);
        },
      });
      return;
    }
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const p = res.tempFilePaths && res.tempFilePaths[0];
        if (p) done(p);
      },
    });
  },
  onTitle(e) {
    this.setData({ title: e.detail.value || "" });
  },
  onNote(e) {
    this.setData({ note: e.detail.value || "" });
  },
  pickGroup(e) {
    this.setData({ groupId: e.currentTarget.dataset.id || "" });
  },
  pickCondition(e) {
    this.setData({ condition: e.currentTarget.dataset.value || "" });
  },
  decQty() {
    this.setData({ quantity: cardCondition.clampQuantity(this.data.quantity - 1) });
  },
  incQty() {
    this.setData({ quantity: cardCondition.clampQuantity(this.data.quantity + 1) });
  },
  save() {
    if (this.data.saving) return;
    const filePath = this._filePath;
    if (!filePath) {
      wx.showToast({ title: "请先选择照片", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success: (res) => {
        api
          .request({
            url: "/collection/custom-cards",
            method: "POST",
            data: {
              imageFrontBase64: res.data,
              mimeType: "image/jpeg",
              title: this.data.title,
              note: this.data.note,
              quantity: this.data.quantity,
              condition: this.data.condition || null,
              groupId: this.data.groupId || null,
            },
          })
          .then(() => {
            this.setData({ saving: false });
            wx.showToast({ title: `已加入${customCard.CUSTOM_BADGE}` });
            setTimeout(() => wx.navigateBack(), 400);
          })
          .catch((err) => {
            this.setData({ saving: false });
            api.handleWriteError(err);
          });
      },
      fail: () => {
        this.setData({ saving: false });
        wx.showToast({ title: "读取图片失败", icon: "none" });
      },
    });
  },
});
