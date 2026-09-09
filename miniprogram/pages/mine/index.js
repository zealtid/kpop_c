const api = require("../../utils/api");
const analytics = require("../../utils/analytics");
const session = require("../../utils/session");

Page({
  data: { user: {}, groups: [], needsLogin: false, loginFailed: false, loginBtnLabel: "登录" },
  onShow() {
    analytics.tabView("我的");
    this.load();
  },
  load() {
    Promise.all([
      api.request({ url: "/me" }),
      api.request({ url: "/catalog/groups", auth: false }),
      api.request({ url: "/me/follows" }),
    ])
      .then((results) => {
        const user = results[0];
        const catalog = results[1];
        const follows = results[2];
        const followed = new Set((follows.groups || []).map((g) => g.id));
        this.setData({
          needsLogin: false,
          loginFailed: false,
          loginBtnLabel: session.loginButtonLabel(false),
          user,
          groups: (catalog.groups || []).map((g) => ({ ...g, followed: followed.has(g.id) })),
        });
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
          groups: [],
        });
        // 冷启动登录进行中：成功后 refreshMine 会再 load，避免 401 重试死循环
        if (app && (app._loginPromise || (app.globalData && app.globalData.loginState === "pending"))) {
          return;
        }
      });
  },
  setPrivacy(e) {
    api
      .request({ url: "/me", method: "PATCH", data: { privacy: e.currentTarget.dataset.v } })
      .then((user) => {
        this.setData({ user });
      })
      .catch(api.handleWriteError);
  },
  toggleFollow(e) {
    const id = e.currentTarget.dataset.id;
    const groups = this.data.groups.map((g) => (g.id === id ? { ...g, followed: !g.followed } : g));
    const groupIds = groups.filter((g) => g.followed).map((g) => g.id);
    api
      .request({ url: "/me/follows", method: "PUT", data: { groupIds } })
      .then(() => {
        this.setData({ groups });
      })
      .catch(api.handleWriteError);
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
      }
    });
  },
  goFeedback() {
    wx.navigateTo({ url: "/pages/feedback/index" });
  },
  goAbout() {
    wx.navigateTo({ url: "/pages/about/index" });
  },
});
