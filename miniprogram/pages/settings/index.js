const api = require("../../utils/api");
const session = require("../../utils/session");
const followPicker = require("../../utils/followPicker");

Page({
  data: {
    user: {},
    privacy: "private",
    privateOn: true,
    publicOn: false,
    needsLogin: false,
    loginFailed: false,
    loginBtnLabel: "登录",
  },

  onShow() {
    this.load();
  },

  applyUser(user) {
    const privacy = user && user.privacy === "public" ? "public" : "private";
    this.setData({
      needsLogin: false,
      loginFailed: false,
      loginBtnLabel: session.loginButtonLabel(false),
      user: user || {},
      privacy,
      privateOn: followPicker.privacyOptionClass(privacy, "private") === "on",
      publicOn: followPicker.privacyOptionClass(privacy, "public") === "on",
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

  setPrivacy(e) {
    const next = e.currentTarget.dataset.v;
    if (next !== "private" && next !== "public") return;
    if (next === this.data.privacy) return;
    api
      .request({ url: "/me", method: "PATCH", data: { privacy: next } })
      .then((user) => {
        session.persistUser(user);
        const app = getApp();
        if (app && app.globalData) app.globalData.user = user;
        this.applyUser(user);
      })
      .catch(api.handleWriteError);
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
