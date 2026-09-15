const customCard = require("../../utils/customCard");

Page({
  data: {
    src: "",
    scale: 1,
  },
  onLoad() {
    const src = customCard.takePreviewSrc();
    if (!src) {
      wx.showToast({ title: "没有可预览的图片", icon: "none" });
      setTimeout(() => wx.navigateBack(), 240);
      return;
    }
    this.setData({ src });
  },
  onUnload() {
    customCard.clearPreviewSrc();
  },
  close() {
    wx.navigateBack();
  },
  noop() {},
});
