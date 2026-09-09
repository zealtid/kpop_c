const api = require("../../utils/api");
const analytics = require("../../utils/analytics");

Page({
  data: { user: {}, groups: [], needsLogin: false },
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
      .then(([user, catalog, follows]) => {
        const followed = new Set((follows.groups || []).map((g) => g.id));
        this.setData({
          needsLogin: false,
          user,
          groups: (catalog.groups || []).map((g) => ({ ...g, followed: followed.has(g.id) })),
        });
      })
      .catch((err) => {
        if (!api.isUnauthorized(err)) return;
        this.setData({ needsLogin: true, user: {}, groups: [] });
        const app = getApp();
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
    if (app && typeof app.login === "function") app.login();
  },
  goFeedback() {
    wx.navigateTo({ url: "/pages/feedback/index" });
  },
  goAbout() {
    wx.navigateTo({ url: "/pages/about/index" });
  },
});
