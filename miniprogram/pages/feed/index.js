const analytics = require("../../utils/analytics");

Page({
  onShow() {
    analytics.tabView("情报");
  },
  goCardbook() {
    wx.switchTab({ url: "/pages/cardbook/index" });
  },
});
