const followPicker = require("../../utils/followPicker");

Component({
  properties: {
    groups: { type: Array, value: [] },
    mode: { type: String, value: "manage" },
    maxCount: { type: Number, value: 0 },
    minCount: { type: Number, value: 0 },
    completeText: { type: String, value: "完成" },
    showSkip: { type: Boolean, value: false },
    showSearch: { type: Boolean, value: true },
    showClear: { type: Boolean, value: true },
    saving: { type: Boolean, value: false },
    hint: { type: String, value: "" },
  },
  data: {
    query: "",
    visibleGroups: [],
    selectedCount: 0,
    canComplete: false,
    label: "已选 0",
  },
  observers: {
    "groups, maxCount, minCount": function () {
      this.syncView();
    },
  },
  methods: {
    syncView() {
      const groups = this.properties.groups || [];
      const selectedCount = followPicker.selectedIds(groups).length;
      const canComplete = followPicker.canComplete(groups, {
        minCount: this.properties.minCount,
        maxCount: this.properties.maxCount,
      });
      this.setData({
        visibleGroups: followPicker.filterGroups(groups, this.data.query),
        selectedCount,
        canComplete,
        label: followPicker.countLabel(selectedCount, this.properties.maxCount),
      });
    },
    onQuery(e) {
      const query = (e.detail && e.detail.value) || "";
      this.setData({ query });
      this.syncView();
    },
    toggle(e) {
      const id = e.currentTarget.dataset.id;
      this.triggerEvent("toggle", { id });
    },
    clear() {
      this.triggerEvent("clear");
    },
    complete() {
      if (this.properties.saving) return;
      this.triggerEvent("complete");
    },
    skip() {
      if (this.properties.saving) return;
      this.triggerEvent("skip");
    },
  },
});
