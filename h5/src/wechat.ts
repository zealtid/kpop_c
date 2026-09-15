/** 非微信浏览器只展示落地摘要 + 打开小程序引导，不出现登录或写路径。 */
export function isWeChatBrowser() {
  if (typeof navigator === "undefined") return false;
  if (import.meta.env.DEV) {
    try {
      if (localStorage.getItem("xingka_force_wechat") === "1") return true;
      if (new URLSearchParams(location.search).get("wx") === "1") return true;
    } catch {
      /* ignore */
    }
  }
  if (import.meta.env.VITE_FORCE_WECHAT === "1") return true;
  return /MicroMessenger/i.test(navigator.userAgent);
}

export function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => copyTextFallback(text));
  }
  return copyTextFallback(text);
}

function copyTextFallback(text: string) {
  return new Promise<void>((resolve, reject) => {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "true");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      if (ok) resolve();
      else reject(new Error("copy failed"));
    } catch (err) {
      reject(err);
    }
  });
}

/** Prefer <a> click; iOS WeChat often ignores location.href for weixin:// schemes. */
export function tryOpenUrlScheme(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => {
    try {
      window.location.href = url;
    } catch {
      /* stay on page; caller shows copy/scan fallback */
    }
  }, 80);
}

type WxConfig = {
  config: (opts: {
    debug?: boolean;
    appId: string;
    timestamp: number;
    nonceStr: string;
    signature: string;
    jsApiList?: string[];
    openTagList?: string[];
  }) => void;
  ready: (cb: () => void) => void;
  error: (cb: (err: unknown) => void) => void;
  miniProgram?: { navigateTo?: (o: { url: string }) => void };
};

function wxSdk(): WxConfig | undefined {
  return (window as unknown as { wx?: WxConfig }).wx;
}

export function tryOpenMiniPath(path: string) {
  const mini = wxSdk()?.miniProgram;
  if (!mini || typeof mini.navigateTo !== "function") return false;
  const url = path.startsWith("/") ? path : `/${path}`;
  mini.navigateTo({ url });
  return true;
}

let jssdkPromise: Promise<boolean> | null = null;

function loadJweixin(): Promise<boolean> {
  if (wxSdk()?.config) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector("script[data-xingka-jweixin]");
    if (existing) {
      existing.addEventListener("load", () => resolve(!!wxSdk()?.config));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const el = document.createElement("script");
    el.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
    el.async = true;
    el.dataset.xingkaJweixin = "1";
    el.onload = () => resolve(!!wxSdk()?.config);
    el.onerror = () => resolve(false);
    document.head.appendChild(el);
  });
}

/** Official Account JS-SDK + wx-open-launch-weapp. Needs WX_WEB_APPID/SECRET + WX_MINI_GH_ID. */
export async function setupWxOpenLaunch() {
  if (!isWeChatBrowser()) return false;
  if (jssdkPromise) return jssdkPromise;
  jssdkPromise = (async () => {
    const loaded = await loadJweixin();
    if (!loaded) return false;
    const { api } = await import("./api");
    const pageUrl = window.location.href.split("#")[0];
    const res = await api<{
      configured?: boolean;
      appId?: string;
      timestamp?: number;
      nonceStr?: string;
      signature?: string;
    }>(`/h5/jssdk-config?url=${encodeURIComponent(pageUrl)}`);
    if (res.status !== 200 || !res.body?.configured || !res.body.appId || !res.body.signature) return false;
    return await new Promise<boolean>((resolve) => {
      const wx = wxSdk();
      if (!wx) {
        resolve(false);
        return;
      }
      wx.config({
        appId: res.body.appId!,
        timestamp: res.body.timestamp!,
        nonceStr: res.body.nonceStr!,
        signature: res.body.signature!,
        jsApiList: ["checkJsApi"],
        openTagList: ["wx-open-launch-weapp"],
      });
      wx.ready(() => resolve(true));
      wx.error(() => resolve(false));
      window.setTimeout(() => resolve(false), 4000);
    });
  })();
  return jssdkPromise;
}
