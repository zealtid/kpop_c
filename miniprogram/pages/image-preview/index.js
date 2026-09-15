const customCard = require("../../utils/customCard");
const nav = require("../../utils/navigate");

Page({
  data: {
    src: "",
    scale: 1,
  },
  onLoad() {
    const src = customCard.takePreviewSrc();
    if (!src) {
      wx.showToast({ title: "没有可预览的图片", icon: "none" });
      setTimeout(() => nav.navigateBack(), 240);
      return;
    }
    this.setData({ src });
  },
  onUnload() {
    customCard.clearPreviewSrc();
  },
  close() {
    nav.navigateBack();
  },
  noop() {},
});
