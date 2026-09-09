const api = require("../../utils/api");
const intel = require("../../utils/intel");

function hasToken() {
  const app = getApp();
  return !!((app && app.globalData && app.globalData.token) || wx.getStorageSync("token"));
}

Page({
  data: {
    groupId: "",
    follows: [],
    chips: [],
    todayEvents: [],
    visibleToday: [],
    events: [],
    sections: [],
    emptyFollows: false,
    timezone: "Asia/Shanghai",
    dateShanghai: "",
    loading: false,
  },

  onLoad(q) {
    this.setData({ groupId: (q && q.groupId) || "" });
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

  loadPublic() {
    const gid = this.data.groupId;
    const todayUrl = gid ? `/schedule/today?groupId=${encodeURIComponent(gid)}` : "/schedule/today";
    const listUrl = gid ? `/schedule?groupId=${encodeURIComponent(gid)}` : "/schedule";
    Promise.all([
      api.request({ url: todayUrl, auth: false }),
      api.request({ url: listUrl, auth: false }),
    ])
      .then((results) => {
        const today = results[0];
        const list = results[1];
        const todayEvents = intel.visibleSchedules(today.events).map((e) => intel.decorateSchedule(e));
        const events = intel.visibleSchedules(list.events).map((e) => intel.decorateSchedule(e));
        this.setData({
          loading: false,
          follows: [],
          chips: [],
          todayEvents,
          events,
          emptyFollows: false,
          timezone: today.timezone || list.timezone || "Asia/Shanghai",
          dateShanghai: today.dateShanghai || "",
        });
        this.applyFilter();
        this.startCountdown();
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" });
      });
  },

  load() {
    const gid = this.data.groupId;
    const todayUrl = gid ? `/schedule/today?groupId=${encodeURIComponent(gid)}` : "/schedule/today";
    const listUrl = gid ? `/schedule?groupId=${encodeURIComponent(gid)}` : "/schedule";
    const authed = hasToken();

    const reqs = [
      api.request({ url: todayUrl, auth: authed }),
      api.request({ url: listUrl, auth: authed }),
    ];
    if (authed) reqs.push(api.request({ url: "/me/follows" }));

    this.setData({ loading: true });
    Promise.all(reqs)
      .then((results) => {
        const today = results[0];
        const list = results[1];
        const follows = results[2];
        const groups = (follows && follows.groups) || [];
        const emptyFollows = authed && !gid && groups.length === 0;
        const todayEvents = intel.visibleSchedules(today.events).map((e) => intel.decorateSchedule(e));
        const events = intel.visibleSchedules(list.events).map((e) => intel.decorateSchedule(e));
        this.setData({
          loading: false,
          follows: groups,
          chips: intel.followChips(groups, this.data.groupId),
          todayEvents,
          events,
          emptyFollows,
          timezone: today.timezone || list.timezone || "Asia/Shanghai",
          dateShanghai: today.dateShanghai || "",
        });
        this.applyFilter();
        this.startCountdown();
      })
      .catch((err) => {
        if (api.isUnauthorized(err)) {
          const app = getApp();
          if (app && (app._loginPromise || (app.globalData && app.globalData.loginState === "pending"))) {
            return;
          }
          this.loadPublic();
          return;
        }
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" });
      });
  },

  applyFilter() {
    const gid = this.data.groupId;
    const visibleToday = intel.filterByGroup(this.data.todayEvents, gid);
    const visibleList = intel.filterByGroup(this.data.events, gid);
    this.setData({
      chips: intel.followChips(this.data.follows, gid),
      visibleToday,
      sections: intel.groupEventsByDate(visibleList),
    });
  },

  selectGroup(e) {
    const id = e.currentTarget.dataset.id || "";
    this.setData({ groupId: id });
    this.load();
  },

  openSchedule(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/schedule-detail/index?id=${id}` });
  },

  goMine() {
    wx.switchTab({ url: "/pages/mine/index" });
  },

  startCountdown() {
    this.stopCountdown();
    if (!intel.hasLiveCountdown(this.data.todayEvents) && !intel.hasLiveCountdown(this.data.events)) {
      return;
    }
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
    const now = Date.now();
    this.setData({
      todayEvents: (this.data.todayEvents || []).map((e) => intel.applyCountdown(e, now)),
      events: (this.data.events || []).map((e) => intel.applyCountdown(e, now)),
    });
    this.applyFilter();
  },
});
