const api = require("../../utils/api");
const analytics = require("../../utils/analytics");
const followPicker = require("../../utils/followPicker");
const nav = require("../../utils/navigate");

Page({
  data: { groups: [], q: "", pageLoading: true },
  onShow() {
    analytics.tabView("图鉴");
    this.setData({ pageLoading: true });
    api
      .request({ url: "/catalog/groups", auth: false })
      .then((d) =>
        this.setData({
          groups: (d.groups || []).map((g) => followPicker.withLogo(g, api.mediaUrl)),
          pageLoading: false,
        }),
      )
      .catch(() => this.setData({ pageLoading: false }));
  },
  onSearch(e) {
    const q = e.detail.value || "";
    nav.navigateTo({ url: `/pages/catalog-search/index?q=${encodeURIComponent(q)}` });
  },
  openGroup(e) {
    nav.navigateTo({ url: `/pages/catalog-group/index?id=${e.currentTarget.dataset.id}` });
  },
  goSubmit() {
    nav.navigateTo({ url: "/pages/catalog-submit/index" });
  },
  goGrid() {
    nav.navigateTo({ url: "/pages/catalog-grid/index" });
  },
});
