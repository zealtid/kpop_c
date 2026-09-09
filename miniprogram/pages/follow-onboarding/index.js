const api = require("../../utils/api");
const analytics = require("../../utils/analytics");
const onboarding = require("../../utils/followOnboarding");

Page({
  data: {
    groups: [],
    selectedCount: 0,
    canComplete: false,
    saving: false,
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
      const followed = new Set(((follows && follows.groups) || []).map((g) => g.id));
      const groups = ((catalog && catalog.groups) || []).map((g) => ({
        ...g,
        selected: followed.has(g.id),
      }));
      this.applySelection(groups);
    });
  },

  applySelection(groups) {
    const selectedCount = groups.filter((g) => g.selected).length;
    this.setData({
      groups,
      selectedCount,
      canComplete: selectedCount >= 1 && selectedCount <= onboarding.MAX_FOLLOW_GROUPS,
    });
  },

  toggle(e) {
    const id = e.currentTarget.dataset.id;
    const groups = this.data.groups.map((g) => {
      if (g.id !== id) return g;
      if (g.selected) return { ...g, selected: false };
      if (this.data.selectedCount >= onboarding.MAX_FOLLOW_GROUPS) {
        wx.showToast({ title: "最多选择 3 个组合", icon: "none" });
        return g;
      }
      return { ...g, selected: true };
    });
    this.applySelection(groups);
  },

  selectedIds() {
    return this.data.groups.filter((g) => g.selected).map((g) => g.id);
  },

  complete() {
    if (this.data.saving) return;
    const groupIds = this.selectedIds();
    if (groupIds.length < 1) {
      wx.showToast({ title: "请至少选择 1 个组合，或点跳过", icon: "none" });
      return;
    }
    if (groupIds.length > onboarding.MAX_FOLLOW_GROUPS) {
      wx.showToast({ title: "最多选择 3 个组合", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    api
      .request({ url: "/me/follows", method: "PUT", data: { groupIds } })
      .then(() => {
        analytics.track("follow_set", { groupIds, n: groupIds.length, source: "onboarding" });
        onboarding.markDone();
        onboarding.goCardbook();
      })
      .catch((err) => {
        this.setData({ saving: false });
        api.handleWriteError(err);
      });
  },

  skip() {
    if (this.data.saving) return;
    analytics.track("follow_set", { skipped: true, n: 0, source: "onboarding" });
    onboarding.markDone();
    onboarding.goCardbook();
  },
});
