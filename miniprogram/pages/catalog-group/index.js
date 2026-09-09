const api = require("../../utils/api");

Page({
  data: { id: "", group: {}, releases: [] },
  onLoad(q) {
    this.setData({ id: q.id });
    this.load();
  },
  load() {
    api.request({ url: `/catalog/groups/${this.data.id}`, auth: false }).then((d) => {
      this.setData({ group: d.group });
      const releases = d.releases || [];
      Promise.all(
        releases.map((r) =>
          api.request({ url: `/catalog/releases/${r.id}/templates`, auth: false }).then((t) => ({
            ...r,
            templates: (t.templates || []).map((x) => ({
              ...x,
              mainImageUrl: api.mediaUrl(x.mainImageUrl),
            })),
          })),
        ),
      ).then((full) => this.setData({ releases: full }));
    });
  },
  onSearch(e) {
    const q = e.detail.value || "";
    wx.navigateTo({
      url: `/pages/catalog-search/index?q=${encodeURIComponent(q + " " + (this.data.group.nameEn || ""))}`,
    });
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
