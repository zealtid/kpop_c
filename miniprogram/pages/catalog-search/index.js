const api = require("../../utils/api");

Page({
  data: { q: "", templates: [], selected: [], empty: false },
  onLoad(q) {
    this.setData({ q: decodeURIComponent(q.q || "") });
    this.search();
  },
  onSearch(e) {
    this.setData({ q: e.detail.value || "" });
    this.search();
  },
  search() {
    const q = this.data.q;
    api.request({ url: `/catalog/search?q=${encodeURIComponent(q)}` }).then((d) => {
      const templates = (d.templates || []).map((t) => ({
        ...t,
        mainImageUrl: api.mediaUrl(t.mainImageUrl),
        on: false,
      }));
      this.setData({ templates, empty: !!d.empty, selected: [] });
    });
  },
  toggle(e) {
    const id = e.currentTarget.dataset.id;
    const templates = this.data.templates.map((t) => (t.id === id ? { ...t, on: !t.on } : t));
    this.setData({
      templates,
      selected: templates.filter((t) => t.on).map((t) => t.id),
    });
  },
  batchOwn() {
    const items = this.data.selected.map((templateId) => ({ templateId, quantity: 1 }));
    if (!items.length) {
      wx.showToast({ title: "先点选卡片", icon: "none" });
      return;
    }
    api.request({ url: "/collection/cards/batch", method: "POST", data: { items } }).then(() => {
      wx.showToast({ title: `已拥有 ${items.length} 张` });
    });
  },
  ownOne(e) {
    const id = e.currentTarget.dataset.id;
    api
      .request({
        url: "/collection/cards",
        method: "POST",
        data: { items: [{ templateId: id, quantity: 1 }] },
      })
      .then(() => wx.showToast({ title: "已标记拥有" }));
  },
  wantOne(e) {
    const id = e.currentTarget.dataset.id;
    api
      .request({ url: "/collection/wants", method: "POST", data: { templateId: id } })
      .then(() => wx.showToast({ title: "已加入想要" }))
      .catch((err) => {
        if (err.code === "OWN_WANT_MUTEX") {
          wx.showToast({ title: "已拥有，无法加入想要", icon: "none" });
          return;
        }
        wx.showToast({ title: err.message || "失败", icon: "none" });
      });
  },
});
