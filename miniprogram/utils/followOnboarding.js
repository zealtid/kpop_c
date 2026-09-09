const api = require("./api");

const STORAGE_KEY = "follow_onboarding_done";
const ONBOARDING_ROUTE = "pages/follow-onboarding/index";
const ONBOARDING_URL = "/pages/follow-onboarding/index";
const CARDBOOK_ROUTE = "pages/cardbook/index";
const MAX_FOLLOW_GROUPS = 3;

let opening = false;
let promptInFlight = null;

function isDone() {
  return !!wx.getStorageSync(STORAGE_KEY);
}

function markDone() {
  wx.setStorageSync(STORAGE_KEY, true);
}

function currentRoute() {
  const pages = getCurrentPages();
  if (!pages.length) return "";
  const top = pages[pages.length - 1];
  return (top && top.route) || "";
}

function isOnboardingPage() {
  return currentRoute() === ONBOARDING_ROUTE;
}

function waitForPages(cb, attempt) {
  if (getCurrentPages().length || attempt >= 40) {
    cb();
    return;
  }
  setTimeout(() => waitForPages(cb, (attempt || 0) + 1), 50);
}

/** 打开关注选择页。force 用于卡册空状态再次进入（即使已跳过）。 */
function openOnboarding({ force = false } = {}) {
  if (isOnboardingPage()) return;
  if (opening) return;
  opening = true;
  const url = force ? `${ONBOARDING_URL}?reprompt=1` : ONBOARDING_URL;
  waitForPages(() => {
    if (isOnboardingPage()) {
      opening = false;
      return;
    }
    wx.navigateTo({
      url,
      complete() {
        opening = false;
      },
    });
  });
}

/**
 * 首次登录且本地未完成引导、关注为空时，跳到选择页。
 * 已有关注或已完成/跳过：不强制打断。
 */
function maybePromptAfterLogin() {
  if (isDone()) return Promise.resolve();
  if (promptInFlight) return promptInFlight;
  promptInFlight = api
    .request({ url: "/me/follows" })
    .then((data) => {
      const groups = (data && data.groups) || [];
      if (groups.length > 0) {
        markDone();
        return;
      }
      const route = currentRoute();
      if (route && route !== CARDBOOK_ROUTE && route !== ONBOARDING_ROUTE) {
        return;
      }
      openOnboarding();
    })
    .catch(() => {})
    .then(() => {
      promptInFlight = null;
    });
  return promptInFlight;
}

function goCardbook() {
  wx.switchTab({ url: "/pages/cardbook/index" });
}

module.exports = {
  STORAGE_KEY,
  MAX_FOLLOW_GROUPS,
  isDone,
  markDone,
  openOnboarding,
  maybePromptAfterLogin,
  goCardbook,
};
