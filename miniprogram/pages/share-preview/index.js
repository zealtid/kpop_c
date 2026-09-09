const { API_BASE } = require("../../utils/config");
const analytics = require("../../utils/analytics");

Page({
  data: { url: "", n: 0 },
  onLoad(q) {
    let url = decodeURIComponent(q.url || "");
    if (url && url.startsWith("/")) url = API_BASE + url;
    this.setData({ url, n: Number(q.n || 0) });
  },
  save() {
    const url = this.data.url;
    wx.downloadFile({
      url,
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            analytics.track("share_cardbook_save", { via: "album", n: this.data.n });
            wx.showToast({ title: "已保存到相册" });
          },
          fail: () => wx.showToast({ title: "请授权相册", icon: "none" }),
        });
      },
      fail: () => wx.showToast({ title: "下载失败", icon: "none" }),
    });
  },
});
