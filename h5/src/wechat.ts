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
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error("clipboard unavailable"));
}
