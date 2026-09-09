const api = require("../../utils/api");
const analytics = require("../../utils/analytics");

Page({
  data: {
    groups: [],
    copy: "进度 = 已拥有不重复模板数 / 范围内已发布模板数（含特典，不含已废弃）",
  },
  onShow() {
    analytics.tabView("卡册");
    this.load();
  },
  load() {
    api
      .request({ url: "/collection/overview" })
      .then((data) => {
        const groups = (data.groups || []).map((g) => ({
          ...g,
          pct: g.progress.publishedCount
            ? Math.round((g.progress.ownedDistinct / g.progress.publishedCount) * 100)
            : 0,
        }));
        this.setData({ groups, copy: data.copy || this.data.copy });
      })
      .catch((err) => {
        if (err.status === 401) {
          getApp().login();
        }
      });
  },
  openGroup(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/cardbook-group/index?id=${id}` });
  },
});
