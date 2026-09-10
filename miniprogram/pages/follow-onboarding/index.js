const api = require("../../utils/api");
const analytics = require("../../utils/analytics");
const onboarding = require("../../utils/followOnboarding");
const followPicker = require("../../utils/followPicker");

Page({
  data: {
    groups: [],
    selectedCount: 0,
    canComplete: false,
    saving: false,
    maxCount: onboarding.MAX_FOLLOW_GROUPS,
    minCount: 1,
    hint: "选择 1–3 个组合，卡册会展示他们的收集进度。也可以先跳过，之后再选。",
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
    const selectedCount = followPicker.selectedIds(groups).length;
    this.setData({
      groups,
      selectedCount,
      canComplete: followPicker.canComplete(groups, {
        minCount: 1,
        maxCount: onboarding.MAX_FOLLOW_GROUPS,
      }),
    });
  },

  onToggle(e) {
    const id = e.detail && e.detail.id;
    const result = followPicker.toggleGroup(this.data.groups, id, {
      maxCount: onboarding.MAX_FOLLOW_GROUPS,
    });
    if (result.blocked) {
      wx.showToast({ title: "最多选择 3 个组合", icon: "none" });
      return;
    }
    this.applySelection(result.groups);
  },

  onClear() {
    this.applySelection(followPicker.clearSelected(this.data.groups));
  },

  selectedIds() {
    return followPicker.selectedIds(this.data.groups);
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
