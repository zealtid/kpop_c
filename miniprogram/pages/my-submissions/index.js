const api = require("../../utils/api");

const STATUS = {
  pending_review: "待审",
  approved: "已通过",
  rejected: "已驳回",
};

Page({
  data: { items: [], empty: false, pageLoading: true },
  onShow() {
    this.setData({ pageLoading: true });
    if (typeof wx.showLoading === "function") wx.showLoading({ title: "加载中", mask: true });
    api
      .request({ url: "/me/catalog-submissions" })
      .then((d) => {
        const items = (d.submissions || []).map((s) => ({
          ...s,
          statusLabel: STATUS[s.status] || s.status,
          imageFront: api.mediaUrl(s.imageFrontThumb || s.imageFront),
        }));
        this.setData({ items, empty: items.length === 0, pageLoading: false });
        if (typeof wx.hideLoading === "function") wx.hideLoading();
      })
      .catch((err) => {
        this.setData({ pageLoading: false });
        if (typeof wx.hideLoading === "function") wx.hideLoading();
        api.handleWriteError(err);
      });
  },
  open(e) {
    wx.navigateTo({ url: `/pages/my-submissions/detail?id=${e.currentTarget.dataset.id}` });
  },
});
