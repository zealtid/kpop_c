const api = require("../../utils/api");

const STATUS = {
  pending_review: "待审",
  approved: "已通过",
  rejected: "已驳回",
};

Page({
  data: { item: {} },
  onLoad(q) {
    api.request({ url: `/me/catalog-submissions/${q.id}` }).then((s) => {
      this.setData({
        item: {
          ...s,
          statusLabel: STATUS[s.status] || s.status,
          imageFront: api.mediaUrl(s.imageFront),
          imageBack: s.imageBack ? api.mediaUrl(s.imageBack) : "",
        },
      });
    });
  },
});
