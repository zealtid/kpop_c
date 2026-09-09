const api = require("../../utils/api");
const intel = require("../../utils/intel");

Page({
  data: {
    id: "",
    item: {},
    missing: false,
    loading: false,
  },

  onLoad(q) {
    this.setData({ id: (q && q.id) || "" });
  },

  onShow() {
    this.load();
  },

  load() {
    if (!this.data.id) {
      this.setData({ missing: true, item: {} });
      return;
    }
    this.setData({ loading: true });
    api
      .request({ url: `/feed/${this.data.id}` })
      .then((raw) => {
        if (!intel.isFeedVisible(raw)) {
          this.setData({ loading: false, missing: true, item: {} });
          return;
        }
        this.setData({
          loading: false,
          missing: false,
          item: intel.decorateFeed(raw),
        });
      })
      .catch((err) => {
        this.setData({ loading: false, missing: true, item: {} });
        if (err && err.status === 404) {
          wx.showToast({ title: "情报不存在", icon: "none" });
          return;
        }
        wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" });
      });
  },

  copyLink() {
    intel.copyOutbound(this.data.item && this.data.item.outboundUrl);
  },

  openLink() {
    intel.openOutbound(this.data.item && this.data.item.outboundUrl);
  },
});
