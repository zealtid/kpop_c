const api = require("../../utils/api");
const analytics = require("../../utils/analytics");
const followPicker = require("../../utils/followPicker");

Page({
  data: {
    groups: [],
    initialIds: [],
    saving: false,
    hint: "搜索并勾选关注的组合。未改动可点完成或返回。",
  },

  onLoad() {
    this.load();
  },

  load() {
    Promise.all([
      api.request({ url: "/catalog/groups", auth: false }),
      api.request({ url: "/me/follows" }).catch(() => ({ groups: [] })),
    ]).then((results) => {
      const catalog = results[0];
      const follows = results[1];
      const followed = ((follows && follows.groups) || []).map((g) => g.id);
      const groups = ((catalog && catalog.groups) || []).map((g) => ({
        ...g,
        selected: followed.indexOf(g.id) !== -1,
      }));
      this.setData({
        groups,
        initialIds: followed.slice(),
      });
    });
  },

  onToggle(e) {
    const id = e.detail && e.detail.id;
    const result = followPicker.toggleGroup(this.data.groups, id, { maxCount: 0 });
    this.setData({ groups: result.groups });
  },

  onClear() {
    this.setData({ groups: followPicker.clearSelected(this.data.groups) });
  },

  complete() {
    if (this.data.saving) return;
    const groupIds = followPicker.selectedIds(this.data.groups);
    if (followPicker.sameIdSet(groupIds, this.data.initialIds)) {
      wx.navigateBack();
      return;
    }
    this.setData({ saving: true });
    api
      .request({ url: "/me/follows", method: "PUT", data: { groupIds } })
      .then(() => {
        analytics.track("follow_set", { groupIds, n: groupIds.length, source: "manage" });
        wx.navigateBack();
      })
      .catch((err) => {
        this.setData({ saving: false });
        api.handleWriteError(err);
      });
  },
});
