const api = require("../../utils/api");
const session = require("../../utils/session");
const phoneBind = require("../../utils/phoneBind");

Page({
  data: {
    user: {},
    needsLogin: false,
    loginFailed: false,
    loginBtnLabel: "登录",
    phoneBindUiEnabled: phoneBind.PHONE_BIND_UI_ENABLED,
    phoneMasked: "",
    phoneBound: false,
  },

  onShow() {
    this.load();
  },

  applyUser(user) {
    const phone = phoneBind.phoneFields(user);
    this.setData({
      needsLogin: false,
      loginFailed: false,
      loginBtnLabel: session.loginButtonLabel(false),
      user: user || {},
      phoneMasked: phone.phoneMasked,
      phoneBound: phone.phoneBound,
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
          phoneMasked: "",
          phoneBound: false,
        });
      });
  },

  onGetPhoneNumber(e) {
    if (!phoneBind.PHONE_BIND_UI_ENABLED || this.data.needsLogin) return;
    const wasBound = this.data.phoneBound;
    phoneBind
      .bindWithWeChatDetail(e.detail || {})
      .then((user) => {
        session.persistUser(user);
        const app = getApp();
        if (app && app.globalData) app.globalData.user = user;
        this.applyUser(user);
        wx.showToast({ title: wasBound ? "已换绑" : "已绑定", icon: "none" });
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
