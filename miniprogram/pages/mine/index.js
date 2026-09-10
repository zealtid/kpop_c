const api = require("../../utils/api");
const analytics = require("../../utils/analytics");
const session = require("../../utils/session");
const displayName = require("../../utils/displayName");
const followPicker = require("../../utils/followPicker");

function resolveAvatarSrc(user) {
  const raw = user && (user.avatarUrl || user.avatar_url);
  if (!raw) return "";
  return api.mediaUrl(String(raw).trim());
}

function isTransientAvatarUrl(url) {
  if (!url) return true;
  const raw = String(url).trim();
  if (!raw) return true;
  return /^wxfile:\/\//i.test(raw) || /^https?:\/\/tmp\b/i.test(raw);
}

function readLocalFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success(res) {
        resolve(res.data);
      },
      fail() {
        reject({ message: "读取图片失败" });
      },
    });
  });
}

Page({
  data: {
    user: {},
    displayName: displayName.UNSET_PLACEHOLDER,
    nicknameUnset: true,
    avatarSrc: "",
    hasAvatar: false,
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
    const avatarSrc = resolveAvatarSrc(user);
    this.setData({
      needsLogin: false,
      loginFailed: false,
      loginBtnLabel: session.loginButtonLabel(false),
      user: user || {},
      displayName: displayName.displayNickname(user && user.nickname),
      nicknameUnset,
      avatarSrc,
      hasAvatar: !!avatarSrc,
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
          avatarSrc: "",
          hasAvatar: false,
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

  // 微信昵称填充（input type=nickname）回写；已有展示名只读，不走手改。
  onWxNicknameFill(e) {
    if (this.data.needsLogin || !this.data.nicknameUnset) return;
    const nickname = displayName.normalizeNickname(e.detail && e.detail.value);
    if (!nickname || displayName.isUnsetNickname(nickname)) return;
    this.patchNickname(nickname);
  },

  onNicknameReview(e) {
    const detail = e.detail || {};
    if (detail.pass === false) {
      wx.showToast({ title: "昵称未通过审核", icon: "none" });
    }
  },

  patchNickname(nickname) {
    api
      .request({ url: "/me", method: "PATCH", data: { nickname } })
      .then((user) => {
        session.persistUser(user);
        const app = getApp();
        if (app && app.globalData) app.globalData.user = user;
        this.applyProfile(user, { groups: this.data.follows });
        wx.showToast({ title: "已更新", icon: "none" });
      })
      .catch(api.handleWriteError);
  },

  // 微信头像：临时路径仅预览，先 POST /me/avatar 再 PATCH 持久 URL。
  onChooseAvatar(e) {
    if (this.data.needsLogin) return;
    const tempPath = e && e.detail && e.detail.avatarUrl;
    if (!tempPath || typeof tempPath !== "string") return;
    const next = tempPath.trim();
    if (!next) return;
    const prevSrc = this.data.avatarSrc;
    const prevHas = this.data.hasAvatar;
    this.setData({ avatarSrc: next, hasAvatar: true });
    this.persistChosenAvatar(next, prevSrc, prevHas);
  },

  persistChosenAvatar(tempPath, prevSrc, prevHas) {
    readLocalFileBase64(tempPath)
      .then((imageBase64) =>
        api.request({
          url: "/me/avatar",
          method: "POST",
          data: { imageBase64, mimeType: "image/jpeg" },
        }),
      )
      .then((uploaded) => {
        const avatarUrl = uploaded && uploaded.avatarUrl;
        if (!avatarUrl || isTransientAvatarUrl(avatarUrl)) {
          throw { message: "上传失败" };
        }
        return api.request({ url: "/me", method: "PATCH", data: { avatarUrl } });
      })
      .then((user) => {
        session.persistUser(user);
        const app = getApp();
        if (app && app.globalData) app.globalData.user = user;
        this.applyProfile(user, { groups: this.data.follows });
        wx.showToast({ title: "已更新", icon: "none" });
      })
      .catch((err) => {
        this.setData({ avatarSrc: prevSrc || "", hasAvatar: !!prevHas });
        api.handleWriteError(err);
      });
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
