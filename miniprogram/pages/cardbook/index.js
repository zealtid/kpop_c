const api = require("../../utils/api");
const analytics = require("../../utils/analytics");
const onboarding = require("../../utils/followOnboarding");
const session = require("../../utils/session");

Page({
  data: {
    groups: [],
    emptyFollows: false,
    needsLogin: false,
    loginFailed: false,
    loginBtnLabel: "登录",
    copy: "进度 = 已拥有不重复模板数 / 范围内已发布模板数（含特典，不含已废弃）",
  },
  onShow() {
    analytics.tabView("卡册");
    this.load();
  },
  load() {
    Promise.all([
      api.request({ url: "/collection/overview" }),
      api.request({ url: "/me/follows" }),
    ])
      .then(([data, follows]) => {
        const followed = (follows && follows.groups) || [];
        const emptyFollows = followed.length === 0;
        if (emptyFollows) {
          onboarding.maybePromptAfterLogin();
        }
        const followedIds = new Set(followed.map((g) => g.id));
        const followedSlugs = new Set(followed.map((g) => g.slug));
        const groups = emptyFollows
          ? []
          : (data.groups || [])
              .filter((g) => followedIds.has(g.id) || followedSlugs.has(g.slug))
              .map((g) => ({
                ...g,
                pct: g.progress && g.progress.publishedCount
                  ? Math.round((g.progress.ownedDistinct / g.progress.publishedCount) * 100)
                  : 0,
              }));
        this.setData({
          needsLogin: false,
          loginFailed: false,
          loginBtnLabel: session.loginButtonLabel(false),
          groups,
          emptyFollows,
          copy: data.copy || this.data.copy,
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
          groups: [],
          emptyFollows: false,
        });
        // 冷启动登录进行中：成功后 refreshCardbook 会再 load，避免 401 重试死循环
        if (app && (app._loginPromise || (app.globalData && app.globalData.loginState === "pending"))) {
          return;
        }
      });
  },
  openGroup(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/cardbook-group/index?id=${id}` });
  },
  goFollowPicker() {
    onboarding.openOnboarding({ force: true });
  },
  goCatalog() {
    wx.switchTab({ url: "/pages/catalog/index" });
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
});
