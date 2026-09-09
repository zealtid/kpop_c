const api = require("../../utils/api");
const analytics = require("../../utils/analytics");

Page({
  data: { user: {}, groups: [] },
  onShow() {
    analytics.tabView("我的");
    this.load();
  },
  load() {
    Promise.all([
      api.request({ url: "/me" }),
      api.request({ url: "/catalog/groups", auth: false }),
      api.request({ url: "/me/follows" }),
    ]).then(([user, catalog, follows]) => {
      const followed = new Set((follows.groups || []).map((g) => g.id));
      this.setData({
        user,
        groups: (catalog.groups || []).map((g) => ({ ...g, followed: followed.has(g.id) })),
      });
    });
  },
  setPrivacy(e) {
    api.request({ url: "/me", method: "PATCH", data: { privacy: e.currentTarget.dataset.v } }).then((user) => {
      this.setData({ user });
    });
  },
  toggleFollow(e) {
    const id = e.currentTarget.dataset.id;
    const groups = this.data.groups.map((g) => (g.id === id ? { ...g, followed: !g.followed } : g));
    const groupIds = groups.filter((g) => g.followed).map((g) => g.id);
    api.request({ url: "/me/follows", method: "PUT", data: { groupIds } }).then(() => {
      this.setData({ groups });
    });
  },
  goFeedback() {
    wx.navigateTo({ url: "/pages/feedback/index" });
  },
  goAbout() {
    wx.navigateTo({ url: "/pages/about/index" });
  },
});
