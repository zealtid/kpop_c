const api = require("../../utils/api");
const analytics = require("../../utils/analytics");

Page({
  data: { groups: [], q: "" },
  onShow() {
    analytics.tabView("图鉴");
    api.request({ url: "/catalog/groups", auth: false }).then((d) => this.setData({ groups: d.groups }));
  },
  onSearch(e) {
    const q = e.detail.value || "";
    wx.navigateTo({ url: `/pages/catalog-search/index?q=${encodeURIComponent(q)}` });
  },
  openGroup(e) {
    wx.navigateTo({ url: `/pages/catalog-group/index?id=${e.currentTarget.dataset.id}` });
  },
});
