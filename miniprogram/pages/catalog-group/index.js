const api = require("../../utils/api");
const catalogSelect = require("../../utils/catalogSelect");
const releaseDate = require("../../utils/releaseDate");
const followPicker = require("../../utils/followPicker");

Page({
  data: { id: "", group: {}, releases: [], selected: [], pageLoading: true, selectMode: false },
  onLoad(q) {
    this.setData({ id: q.id });
    this.load();
  },
  load() {
    this.setData({ pageLoading: true });
    if (typeof wx.showLoading === "function") wx.showLoading({ title: "加载中", mask: true });
    const done = () => {
      this.setData({ pageLoading: false });
      if (typeof wx.hideLoading === "function") wx.hideLoading();
    };
    api
      .request({ url: `/catalog/groups/${this.data.id}`, auth: false })
      .then((d) => {
        this.setData({ group: followPicker.withLogo(d.group || {}, api.mediaUrl) });
        const releases = d.releases || [];
        return Promise.all(
          releases.map((r) =>
            api.request({ url: `/catalog/releases/${r.id}/templates`, auth: false }).then((t) =>
              releaseDate.decorateRelease({
                ...r,
                templates: catalogSelect.mapTemplatesForGrid(t.templates, (url) => api.mediaUrl(url)),
              }),
            ),
          ),
        ).then((full) =>
          this.setData({
            releases: catalogSelect.withAlbumExpanded(full, this.data.releases),
            selected: [],
          }),
        );
      })
      .catch(api.handleWriteError)
      .then(done, done);
  },
  toggleRelease(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ releases: catalogSelect.toggleAlbumExpanded(this.data.releases, id) });
  },
  onSearch(e) {
    const q = e.detail.value || "";
    wx.navigateTo({
      url: `/pages/catalog-search/index?q=${encodeURIComponent(q + " " + (this.data.group.nameEn || ""))}`,
    });
  },
  enterSelect() {
    this.setData({ selectMode: true });
  },
  exitSelect() {
    const next = catalogSelect.clearSelected(this.data.releases);
    this.setData({ ...next, selectMode: false });
  },
  onTileTap(e) {
    if (this.data.selectMode) {
      this.toggle(e);
      return;
    }
    this.openCard(e);
  },
  openCard(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/card-detail/index?id=${id}&from=catalog` });
  },
  toggle(e) {
    const next = catalogSelect.toggleSelected(this.data.releases, e.currentTarget.dataset.id);
    this.setData(next);
  },
  batchOwn() {
    const items = catalogSelect.toBatchOwnItems(this.data.selected);
    if (!items.length) {
      wx.showToast({ title: "先点选卡片", icon: "none" });
      return;
    }
    api
      .request({ url: "/collection/cards/batch", method: "POST", data: { items } })
      .then(() => {
        wx.showToast({ title: `已拥有 ${items.length} 张` });
      })
      .catch(api.handleWriteError);
  },
  ownOne(e) {
    api
      .request({
        url: "/collection/cards",
        method: "POST",
        data: { items: [{ templateId: e.currentTarget.dataset.id, quantity: 1 }] },
      })
      .then(() => wx.showToast({ title: "已标记拥有" }))
      .catch(api.handleWriteError);
  },
  wantOne(e) {
    api
      .request({
        url: "/collection/wants",
        method: "POST",
        data: { templateId: e.currentTarget.dataset.id },
      })
      .then((data) => {
        if (api.isOwnWantMutex(data)) {
          wx.showToast({ title: data.message || "已拥有，无法加入想要", icon: "none" });
          return;
        }
        wx.showToast({ title: "已加入想要" });
      })
      .catch(api.handleWriteError);
  },
});
