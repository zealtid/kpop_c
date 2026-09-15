/**
 * Notion #16 — 主栈跳转封装。
 * WebView 走系统 push；Skyline 才吃 routeConfig 时长。低端/减动效时把时长压到 0。
 */
const PAGE_BG = "#F4F5F9";
const NAV_BG = "#FFFFFF";
const TAP_LOCK_MS = 360;
const LOW_END_BENCHMARK = 10;
const SKYLINE_MS = 220;
const SKYLINE_BACK_MS = 180;

let lastKey = "";
let lastAt = 0;

function readSystemInfo() {
  try {
    if (typeof wx !== "undefined" && typeof wx.getSystemInfoSync === "function") {
      return wx.getSystemInfoSync() || {};
    }
  } catch (err) {
    return {};
  }
  return {};
}

function prefersReducedMotion(info) {
  const sys = info || readSystemInfo();
  const level = Number(sys.benchmarkLevel);
  if (level > 0 && level < LOW_END_BENCHMARK) return true;
  return false;
}

function isSkyline(info) {
  const sys = info || readSystemInfo();
  if (sys.renderer === "skyline") return true;
  if (sys.host && sys.host.renderer === "skyline") return true;
  return false;
}

function routeExtras() {
  const info = readSystemInfo();
  if (!isSkyline(info)) return {};
  const reduced = prefersReducedMotion(info);
  return {
    routeConfig: {
      transitionDuration: reduced ? 0 : SKYLINE_MS,
      reverseTransitionDuration: reduced ? 0 : SKYLINE_BACK_MS,
    },
  };
}

function shouldSkip(kind, url) {
  const key = kind + ":" + (url || "");
  const t = Date.now();
  if (key === lastKey && t - lastAt < TAP_LOCK_MS) return true;
  lastKey = key;
  lastAt = t;
  return false;
}

function resetTapLock() {
  lastKey = "";
  lastAt = 0;
}

function callWx(method, options, withRoute) {
  if (typeof wx === "undefined" || typeof wx[method] !== "function") return;
  const extras = withRoute ? routeExtras() : {};
  wx[method](Object.assign({}, extras, options || {}));
}

function navigateTo(opts) {
  const options = opts || {};
  if (shouldSkip("navigateTo", options.url)) return;
  callWx("navigateTo", options, true);
}

function redirectTo(opts) {
  const options = opts || {};
  if (shouldSkip("redirectTo", options.url)) return;
  callWx("redirectTo", options, true);
}

function navigateBack(opts) {
  callWx("navigateBack", opts || {}, false);
}

function switchTab(opts) {
  callWx("switchTab", opts || {}, false);
}

module.exports = {
  PAGE_BG,
  NAV_BG,
  TAP_LOCK_MS,
  navigateTo,
  redirectTo,
  navigateBack,
  switchTab,
  prefersReducedMotion,
  isSkyline,
  resetTapLock,
};
