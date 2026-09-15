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

export function tryOpenMiniPath(path: string) {
  const wxObj = (window as unknown as { wx?: { miniProgram?: { navigateTo?: (o: { url: string }) => void } } }).wx;
  const mini = wxObj?.miniProgram;
  if (!mini || typeof mini.navigateTo !== "function") return false;
  const url = path.startsWith("/") ? path : `/${path}`;
  mini.navigateTo({ url });
  return true;
}
