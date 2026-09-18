const api = require("../../utils/api");
const catalogSelect = require("../../utils/catalogSelect");
const releaseDate = require("../../utils/releaseDate");

Page({
  data: {
    id: "",
    release: {},
    templates: [],
    pageLoading: true,
    empty: false,
    loaded: false,
  },
  onLoad(q) {
    this.setData({ id: q.id || "" });
    this.load();
  },
  load() {
    if (!this.data.id) return;
    this.setData({ pageLoading: true });
    if (typeof wx.showLoading === "function") wx.showLoading({ title: "加载中", mask: true });
    const done = () => {
      this.setData({ pageLoading: false, loaded: true });
      if (typeof wx.hideLoading === "function") wx.hideLoading();
    };
    Promise.all([
      api.request({ url: `/catalog/releases/${this.data.id}`, auth: false }),
      api.request({ url: `/catalog/releases/${this.data.id}/templates`, auth: false }),
    ])
      .then(([rel, tpls]) => {
        const templates = catalogSelect.mapTemplatesForGrid(tpls.templates || [], (url) => api.mediaUrl(url));
        this.setData({
          release: releaseDate.decorateRelease(rel.release || {}),
          templates,
          empty: templates.length === 0,
        });
      })
      .catch((err) => {
        this.setData({ empty: true, templates: [] });
        if (err && err.status !== 404) api.handleWriteError(err);
      })
      .then(done, done);
  },
  openCard(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/card-detail/index?id=${id}&from=catalog` });
  },
});
