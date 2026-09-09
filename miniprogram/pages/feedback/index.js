const api = require("../../utils/api");

Page({
  data: { text: "" },
  onInput(e) {
    this.setData({ text: e.detail.value });
  },
  submit() {
    const text = (this.data.text || "").trim();
    if (!text) {
      wx.showToast({ title: "请填写文字", icon: "none" });
      return;
    }
    api
      .request({ url: "/feedback/missing", method: "POST", data: { text } })
      .then(() => {
        wx.showToast({ title: "已提交" });
        this.setData({ text: "" });
      })
      .catch((err) => wx.showToast({ title: err.message || "失败", icon: "none" }));
  },
});
