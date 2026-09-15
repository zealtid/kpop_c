const api = require("../../utils/api");
const analytics = require("../../utils/analytics");
const followPicker = require("../../utils/followPicker");

Page({
  data: { groups: [], q: "", pageLoading: true },

  onLoad() {
    this.loadGroups({ silent: false });
  },

  onShow() {
    analytics.tabView("图鉴");
    // 再次进入 Tab 只做静默刷新，不把列表清空成「加载中」
    if (this._groupsLoaded) {
      this.loadGroups({ silent: true });
    }
  },

  onPullDownRefresh() {
    this.loadGroups({ silent: true, fromPull: true });
  },

  loadGroups(opts) {
    const silent = !!(opts && opts.silent);
    const fromPull = !!(opts && opts.fromPull);
    if (!silent) {
      this.setData({ pageLoading: true });
    }
    return api
      .request({ url: "/catalog/groups", auth: false })
      .then((d) => {
        this._groupsLoaded = true;
        this.setData({
          groups: (d.groups || []).map((g) => followPicker.withLogo(g, api.mediaUrl)),
          pageLoading: false,
        });
      })
      .catch(() => {
        this._groupsLoaded = true;
        this.setData({ pageLoading: false });
      })
      .then(() => {
        if (fromPull && typeof wx.stopPullDownRefresh === "function") {
          wx.stopPullDownRefresh();
        }
      });
  },

  onSearch(e) {
    const q = e.detail.value || "";
    wx.navigateTo({ url: `/pages/catalog-search/index?q=${encodeURIComponent(q)}` });
  },
  openGroup(e) {
    wx.navigateTo({ url: `/pages/catalog-group/index?id=${e.currentTarget.dataset.id}` });
  },
  goSubmit() {
    wx.navigateTo({ url: "/pages/catalog-submit/index" });
  },
  goGrid() {
    wx.navigateTo({ url: "/pages/catalog-grid/index" });
  },
});
