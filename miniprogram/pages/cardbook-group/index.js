const api = require("../../utils/api");

Page({
  data: {
    id: "",
    group: {},
    progress: {},
    copy: "",
    pct: 0,
    tab: 0,
    owned: [],
    wanted: [],
    duplicates: [],
    list: [],
  },
  onLoad(q) {
    this.setData({ id: q.id });
  },
  onShow() {
    this.load();
  },
  load() {
    api.request({ url: `/collection/groups/${this.data.id}` }).then((data) => {
      const mapUrl = (c) => ({ ...c, mainImageUrl: api.mediaUrl(c.mainImageUrl) });
      const owned = (data.owned || []).map(mapUrl);
      const wanted = (data.wanted || []).map(mapUrl);
      const duplicates = (data.duplicates || []).map(mapUrl);
      const pct = data.progress.publishedCount
        ? Math.round((data.progress.ownedDistinct / data.progress.publishedCount) * 100)
        : 0;
      this.setData({
        group: data.group,
        progress: data.progress,
        copy: data.copy,
        pct,
        owned,
        wanted,
        duplicates,
      });
      this.applyTab();
    });
  },
  setTab(e) {
    this.setData({ tab: Number(e.currentTarget.dataset.i) });
    this.applyTab();
  },
  applyTab() {
    const lists = [this.data.owned, this.data.wanted, this.data.duplicates];
    this.setData({ list: lists[this.data.tab] || [] });
  },
  unown(e) {
    const id = e.currentTarget.dataset.id;
    api
      .request({ url: `/collection/cards/${id}`, method: "DELETE" })
      .then(() => this.load())
      .catch(api.handleWriteError);
  },
  unwant(e) {
    const id = e.currentTarget.dataset.id;
    api
      .request({ url: `/collection/wants/${id}`, method: "DELETE" })
      .then(() => this.load())
      .catch(api.handleWriteError);
  },
  share() {
    wx.showLoading({ title: "生成长图" });
    api
      .request({ url: "/share/image", method: "POST", data: { groupId: this.data.id } })
      .then((data) => {
        wx.hideLoading();
        wx.navigateTo({
          url: `/pages/share-preview/index?url=${encodeURIComponent(data.url)}&n=${data.cardCount}`,
        });
      })
      .catch((err) => {
        wx.hideLoading();
        api.handleWriteError(err);
      });
  },
});
