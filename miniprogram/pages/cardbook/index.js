const api = require("../../utils/api");
const analytics = require("../../utils/analytics");
const onboarding = require("../../utils/followOnboarding");
const session = require("../../utils/session");
const customCard = require("../../utils/customCard");
const groupCover = require("../../utils/groupCover");

Page({
  data: {
    groups: [],
    followCount: 0,
    customCards: [],
    customCount: 0,
    customLabel: customCard.CUSTOM_BADGE,
    emptyFollows: false,
    needsLogin: false,
    loginFailed: false,
    loginBtnLabel: "登录",
  },
  onShow() {
    analytics.tabView("收藏");
    this.load();
  },
  load() {
    Promise.all([
      api.request({ url: "/collection/overview" }),
      api.request({ url: "/me/follows" }),
    ])
      .then((results) => {
        const data = results[0];
        const follows = results[1];
        const followed = (follows && follows.groups) || [];
        const emptyFollows = followed.length === 0;
        if (emptyFollows) {
          onboarding.maybePromptAfterLogin();
        }
        const followedIds = new Set(followed.map((g) => g.id));
        const followedSlugs = new Set(followed.map((g) => g.slug));
        const groups = emptyFollows
          ? []
          : (data.groups || [])
              .filter((g) => followedIds.has(g.id) || followedSlugs.has(g.slug))
              .map((g) => {
                const next = groupCover.decorateFollowedGroup(g, api.mediaUrl);
                next.customBadge = g.customCount ? customCard.CUSTOM_BADGE : "";
                next.customLabel = g.customCount ? customCard.customCountLabel(g.customCount) : "";
                return next;
              });
        const customCards = (data.customCards || []).map((c) =>
          customCard.decorateCustomCard(c, api.mediaUrl),
        );
        this.setData({
          needsLogin: false,
          loginFailed: false,
          loginBtnLabel: session.loginButtonLabel(false),
          groups,
          followCount: groups.length,
          emptyFollows,
          customCards,
          customCount: data.customCount || customCards.length,
          customLabel: data.customLabel || customCard.customCountLabel(data.customCount || customCards.length),
        });
      })
      .catch((err) => {
        if (!api.isUnauthorized(err)) return;
        const app = getApp();
        const loginFailed = !!(app && app.globalData && app.globalData.loginState === "fail");
        this.setData({
          needsLogin: true,
          loginFailed,
          loginBtnLabel: session.loginButtonLabel(loginFailed),
          groups: [],
          followCount: 0,
          emptyFollows: false,
          customCards: [],
          customCount: 0,
        });
        // 冷启动登录进行中：成功后 refreshCardbook 会再 load，避免 401 重试死循环
        if (app && (app._loginPromise || (app.globalData && app.globalData.loginState === "pending"))) {
          return;
        }
      });
  },
  focusGroups() {
    wx.pageScrollTo({ selector: "#group-list", duration: 280 });
  },
  openGroup(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/cardbook-group/index?id=${id}` });
  },
  openCustom(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/custom-card/index?id=${id}` });
  },
  openPreview(e) {
    const id = e.currentTarget.dataset.id;
    const card = (this.data.customCards || []).find((c) => c.id === id);
    if (!card || !customCard.canOpenFullscreen(card.moderationStatus)) return;
    customCard.openFullscreen(card.mainImageUrl);
  },
  removeCustom(e) {
    const id = e.currentTarget.dataset.id;
    customCard
      .confirmDeleteCustomCard(id, api.request)
      .then((result) => {
        if (result.cancelled) return;
        this.load();
      })
      .catch(api.handleWriteError);
  },
  addFromCatalog() {
    if (this.data.needsLogin) {
      this.doLogin();
      return;
    }
    wx.navigateTo({ url: "/pages/catalog-grid/index" });
  },
  goFollowPicker() {
    onboarding.openOnboarding({ force: true });
  },
  goCatalog() {
    wx.switchTab({ url: "/pages/catalog/index" });
  },
  doLogin() {
    const app = getApp();
    if (!app || typeof app.login !== "function") return;
    app.login().then((ok) => {
      if (!ok) {
        this.setData({
          needsLogin: true,
          loginFailed: true,
          loginBtnLabel: session.loginButtonLabel(true),
        });
      }
    });
  },
});
