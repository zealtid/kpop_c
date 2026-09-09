const api = require("../../utils/api");
const cardCondition = require("../../utils/cardCondition");
const customCard = require("../../utils/customCard");

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
    custom: [],
    customLabel: "",
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
      const mapUrl = (c) => ({
        ...c,
        mainImageUrl: api.mediaUrl(c.mainImageUrl),
        conditionLabel: c.condition ? cardCondition.conditionLabel(c.condition) : "",
      });
      const owned = (data.owned || []).map(mapUrl);
      const wanted = (data.wanted || []).map(mapUrl);
      const duplicates = (data.duplicates || []).map(mapUrl);
      const custom = (data.custom || []).map((c) => customCard.decorateCustomCard(c, api.mediaUrl));
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
        custom,
        customLabel: data.customLabel || customCard.customCountLabel(custom.length),
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
  openCard(e) {
    if (this.data.tab === 1) return;
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/card-detail/index?id=${id}` });
  },
  openCustom(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/custom-card/index?id=${id}` });
  },
  openPreview(e) {
    const id = e.currentTarget.dataset.id;
    const card = (this.data.custom || []).find((c) => c.id === id);
    if (!card || !customCard.canOpenFullscreen(card.moderationStatus)) return;
    customCard.openFullscreen(card.mainImageUrl);
  },
  removeCustom(e) {
    const id = e.currentTarget.dataset.id;
    customCard
      .confirmDeleteCustomCard(id, api.request)
      .then((result) => {
        if (result.cancelled) return;
        this.load();
      })
      .catch(api.handleWriteError);
  },
  addCustom() {
    const gid = (this.data.group && this.data.group.id) || "";
    wx.navigateTo({
      url: gid ? `/pages/custom-card-add/index?groupId=${gid}` : "/pages/custom-card-add/index",
    });
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
