const channelPick = require("../../utils/channelPick");

const SHEET_HITS = 48;

Component({
  properties: {
    show: { type: Boolean, value: false },
    options: { type: Array, value: [] },
    value: { type: String, value: "" },
    label: { type: String, value: "" },
    custom: { type: String, value: "" },
  },
  data: {
    query: "",
    hits: [],
    otherOn: false,
    customText: "",
  },
  observers: {
    "show, options, value, custom": function (show, options, value, custom) {
      if (!show) return;
      const otherOn = channelPick.isOther(value);
      this.setData({
        otherOn,
        customText: custom || "",
        hits: channelPick.filterOptions(options || [], this.data.query, SHEET_HITS),
      });
    },
  },
  methods: {
    noop() {},
    onClose() {
      this.triggerEvent("close");
    },
    onQuery(e) {
      const query = (e.detail && e.detail.value) || "";
      this.setData({
        query,
        hits: channelPick.filterOptions(this.properties.options || [], query, SHEET_HITS),
      });
    },
    onPick(e) {
      const value = e.currentTarget.dataset.value || "";
      const label = e.currentTarget.dataset.label || "";
      const other = channelPick.isOther(value);
      this.setData({ otherOn: other });
      this.triggerEvent("pick", { value, label, other });
      if (!other) this.triggerEvent("close");
    },
    onCustom(e) {
      const custom = (e.detail && e.detail.value) || "";
      this.setData({ customText: custom });
      this.triggerEvent("custom", { custom });
    },
  },
});
