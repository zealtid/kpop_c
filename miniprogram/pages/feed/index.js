const api = require("../../utils/api");
const analytics = require("../../utils/analytics");
const intel = require("../../utils/intel");

function hasToken() {
  const app = getApp();
  return !!((app && app.globalData && app.globalData.token) || wx.getStorageSync("token"));
}

Page({
  data: {
    mode: "guest",
    follows: [],
    chips: [],
    selectedGroupId: "",
    items: [],
    visibleItems: [],
    todayEvents: [],
    visibleToday: [],
    emptyFollows: false,
    showingFeatured: false,
    timeline: "",
    loading: false,
  },

  onShow() {
    analytics.tabView("情报");
    this.load();
  },

  onHide() {
    this.stopCountdown();
  },

  onUnload() {
    this.stopCountdown();
  },

  load() {
    if (!hasToken()) {
      this.loadGuest();
      return;
    }
    this.loadFollowed();
  },

  loadGuest() {
    this.setData({ loading: true, mode: "guest", emptyFollows: false, showingFeatured: true });
    Promise.all([
      api.request({ url: "/feed", auth: false }),
      api.request({ url: "/schedule/today", auth: false }),
    ])
      .then(([feed, today]) => {
        const items = intel.visibleFeeds(feed.items).map(intel.decorateFeed);
        const todayEvents = intel.visibleSchedules(today.events).map((e) => intel.decorateSchedule(e));
        this.setData({
          loading: false,
          mode: "guest",
          follows: [],
          chips: [],
          selectedGroupId: "",
          items,
          todayEvents,
          timeline: feed.timeline || "featured",
          emptyFollows: false,
          showingFeatured: true,
        });
        this.applyFilter();
        this.startCountdown();
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" });
      });
  },

  loadFollowed() {
    this.setData({ loading: true });
    Promise.all([
      api.request({ url: "/me/follows" }),
      api.request({ url: "/feed" }),
      api.request({ url: "/schedule/today" }),
    ])
      .then(([follows, feed, today]) => {
        const groups = (follows && follows.groups) || [];
        if (!groups.length) {
          this.setData({
            loading: false,
            mode: "empty-follows",
            follows: [],
            chips: [],
            selectedGroupId: "",
            items: [],
            visibleItems: [],
            todayEvents: [],
            visibleToday: [],
            emptyFollows: true,
            showingFeatured: false,
            timeline: (feed && feed.timeline) || "followed",
          });
          this.stopCountdown();
          return;
        }
        const items = intel.visibleFeeds(feed.items).map(intel.decorateFeed);
        const todayEvents = intel.visibleSchedules(today.events).map((e) => intel.decorateSchedule(e));
        this.setData({
          loading: false,
          mode: "followed",
          follows: groups,
          chips: intel.followChips(groups, this.data.selectedGroupId),
          items,
          todayEvents,
          timeline: feed.timeline || "followed",
          emptyFollows: false,
          showingFeatured: false,
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
          this.loadGuest();
          return;
        }
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" });
      });
  },

  loadFeatured() {
    this.setData({ loading: true, showingFeatured: true });
    api
      .request({ url: "/feed/featured", auth: false })
      .then((feed) => {
        const items = intel.visibleFeeds(feed.items).map(intel.decorateFeed);
        this.setData({
          loading: false,
          mode: "featured",
          items,
          timeline: "featured",
          showingFeatured: true,
          emptyFollows: true,
        });
        this.applyFilter();
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" });
      });
  },

  applyFilter() {
    const gid = this.data.selectedGroupId;
    this.setData({
      chips: intel.followChips(this.data.follows, gid),
      visibleItems: intel.filterByGroup(this.data.items, gid),
      visibleToday: intel.filterByGroup(this.data.todayEvents, gid),
    });
  },

  selectGroup(e) {
    const id = e.currentTarget.dataset.id || "";
    this.setData({ selectedGroupId: id });
    this.applyFilter();
  },

  openFeed(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/feed-detail/index?id=${id}` });
  },

  openSchedule(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/schedule-detail/index?id=${id}` });
  },

  openScheduleList() {
    const gid = this.data.selectedGroupId;
    const q = gid ? `?groupId=${gid}` : "";
    wx.navigateTo({ url: `/pages/schedule/index${q}` });
  },

  goMine() {
    wx.switchTab({ url: "/pages/mine/index" });
  },

  copyLink(e) {
    intel.copyOutbound(e.currentTarget.dataset.url);
  },

  startCountdown() {
    this.stopCountdown();
    if (!intel.hasLiveCountdown(this.data.todayEvents) && !intel.hasLiveCountdown(this.data.visibleToday)) {
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
    const todayEvents = (this.data.todayEvents || []).map((e) => intel.applyCountdown(e, now));
    this.setData({ todayEvents });
    this.applyFilter();
  },
});
