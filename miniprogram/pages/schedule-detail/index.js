const api = require("../../utils/api");
const intel = require("../../utils/intel");

Page({
  data: {
    id: "",
    event: {},
    missing: false,
    loading: false,
  },

  onLoad(q) {
    this.setData({ id: (q && q.id) || "" });
  },

  onShow() {
    this.load();
  },

  onHide() {
    this.stopCountdown();
  },

  onUnload() {
    this.stopCountdown();
  },

  load() {
    if (!this.data.id) {
      this.setData({ missing: true, event: {} });
      return;
    }
    this.setData({ loading: true });
    api
      .request({ url: `/schedule/${this.data.id}` })
      .then((raw) => {
        if (!intel.isScheduleVisible(raw)) {
          this.setData({ loading: false, missing: true, event: {} });
          this.stopCountdown();
          return;
        }
        const event = intel.decorateSchedule(raw);
        this.setData({ loading: false, missing: false, event });
        this.startCountdown();
      })
      .catch((err) => {
        this.setData({ loading: false, missing: true, event: {} });
        this.stopCountdown();
        if (err && err.status === 404) {
          wx.showToast({ title: "日程不存在", icon: "none" });
          return;
        }
        wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" });
      });
  },

  copyLink() {
    intel.copyOutbound(this.data.event && this.data.event.outboundUrl);
  },

  openLink() {
    intel.openOutbound(this.data.event && this.data.event.outboundUrl);
  },

  startCountdown() {
    this.stopCountdown();
    if (!this.data.event || !this.data.event.countdownLive) return;
    this._timer = setInterval(() => this.tickCountdown(), 1000);
    if (this._timer && typeof this._timer.unref === "function") this._timer.unref();
  },

  stopCountdown() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  tickCountdown() {
    const event = intel.applyCountdown(this.data.event, Date.now());
    this.setData({ event });
    if (!event.countdownLive) this.stopCountdown();
  },
});
