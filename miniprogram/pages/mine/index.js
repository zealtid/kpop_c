const api = require("../../utils/api");
const analytics = require("../../utils/analytics");
const session = require("../../utils/session");
const displayName = require("../../utils/displayName");
const followPicker = require("../../utils/followPicker");

Page({
  data: {
    user: {},
    displayName: displayName.UNSET_PLACEHOLDER,
    nicknameUnset: true,
    draftNickname: "",
    editingNickname: false,
    nicknameFocus: false,
    follows: [],
    followCount: 0,
    followLabel: "",
    followPreview: [],
    needsLogin: false,
    loginFailed: false,
    loginBtnLabel: "登录",
  },

  onShow() {
    analytics.tabView("我的");
    this.load();
  },

  applyProfile(user, follows) {
    const followed = (follows && follows.groups) || this.data.follows || [];
    const summary = followPicker.followSummary(followed, 5);
    const nicknameUnset = displayName.isUnsetNickname(user && user.nickname);
    this.setData({
      needsLogin: false,
      loginFailed: false,
      loginBtnLabel: session.loginButtonLabel(false),
      user: user || {},
      displayName: displayName.displayNickname(user && user.nickname),
      nicknameUnset,
      draftNickname: nicknameUnset ? "" : displayName.trimNickname(user.nickname),
      follows: followed,
      followCount: summary.count,
      followLabel: summary.label,
      followPreview: summary.preview,
    });
  },

  load() {
    Promise.all([
      api.request({ url: "/me" }),
      api.request({ url: "/me/follows" }),
    ])
      .then((results) => {
        this.applyProfile(results[0], results[1]);
      })
      .catch((err) => {
        if (!api.isUnauthorized(err)) return;
        const app = getApp();
        const loginFailed = !!(app && app.globalData && app.globalData.loginState === "fail");
        this.setData({
          needsLogin: true,
          loginFailed,
          loginBtnLabel: session.loginButtonLabel(loginFailed),
          user: {},
          displayName: displayName.UNSET_PLACEHOLDER,
          nicknameUnset: true,
          draftNickname: "",
          editingNickname: false,
          follows: [],
          followCount: 0,
          followLabel: "",
          followPreview: [],
        });
        if (app && (app._loginPromise || (app.globalData && app.globalData.loginState === "pending"))) {
          return;
        }
      });
  },

  openNicknameEditor() {
    if (this.data.needsLogin) return;
    this.setData({
      editingNickname: true,
      nicknameFocus: true,
    });
  },

  onNicknameInput(e) {
    this.setData({ draftNickname: displayName.normalizeDraft(e.detail && e.detail.value) });
  },

  onNicknameBlur(e) {
    const value = displayName.normalizeDraft(e.detail && e.detail.value);
    this.setData({ draftNickname: value, nicknameFocus: false });
    if (this._pendingWxSync && value) {
      this._pendingWxSync = false;
      this.patchNickname(value);
    }
  },

  onNicknameReview(e) {
    const detail = e.detail || {};
    if (detail.pass === false) {
      wx.showToast({ title: "昵称未通过审核", icon: "none" });
    }
  },

  requestWxNicknameSync() {
    const run = () => {
      this._pendingWxSync = true;
      this.setData({ editingNickname: true, nicknameFocus: true });
    };
    if (!displayName.shouldConfirmWxSync(this.data.user && this.data.user.nickname)) {
      run();
      return;
    }
    wx.showModal({
      title: "同步微信昵称",
      content: "将用微信昵称覆盖当前展示名，确定？",
      success: (res) => {
        if (res.confirm) run();
      },
    });
  },

  saveNickname() {
    const nickname = displayName.normalizeDraft(this.data.draftNickname);
    if (!nickname || displayName.isUnsetNickname(nickname)) {
      wx.showToast({ title: "请填写昵称", icon: "none" });
      return;
    }
    this.patchNickname(nickname);
  },

  patchNickname(nickname) {
    api
      .request({ url: "/me", method: "PATCH", data: { nickname } })
      .then((user) => {
        session.persistUser(user);
        const app = getApp();
        if (app && app.globalData) app.globalData.user = user;
        this.applyProfile(user, { groups: this.data.follows });
        this.setData({ editingNickname: false, nicknameFocus: false });
        wx.showToast({ title: "已更新", icon: "none" });
      })
      .catch(api.handleWriteError);
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

  goFollowManage() {
    wx.navigateTo({ url: "/pages/follow-manage/index" });
  },

  goSettings() {
    wx.navigateTo({ url: "/pages/settings/index" });
  },

  goFeedback() {
    wx.navigateTo({ url: "/pages/feedback/index" });
  },

  goAbout() {
    wx.navigateTo({ url: "/pages/about/index" });
  },
});
