const api = require("../../utils/api");
const session = require("../../utils/session");

Page({
  data: {
    user: {},
    needsLogin: false,
    loginFailed: false,
    loginBtnLabel: "登录",
  },

  onShow() {
    this.load();
  },

  applyUser(user) {
    this.setData({
      needsLogin: false,
      loginFailed: false,
      loginBtnLabel: session.loginButtonLabel(false),
      user: user || {},
    });
  },

  load() {
    api
      .request({ url: "/me" })
      .then((user) => {
        this.applyUser(user);
      })
      .catch((err) => {
        if (!api.isUnauthorized(err)) return;
        const app = getApp();
        const loginFailed = !!(app && app.globalData && app.globalData.loginState === "fail");
        this.setData({
          needsLogin: true,
          loginFailed,
          loginBtnLabel: session.loginButtonLabel(loginFailed),
          user: {},
        });
      });
  },

  goFollowManage() {
    wx.navigateTo({ url: "/pages/follow-manage/index" });
  },

  doLogin() {
    const app = getApp();
    if (!app || typeof app.login !== "function") return;
    app.login().then((ok) => {
      if (!ok) {
        this.setData({
          needsLogin: true,
          loginFailed: true,
          loginBtnLabel: session.loginButtonLabel(true),
        });
        return;
      }
      this.load();
    });
  },
});
