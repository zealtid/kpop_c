import type { ShareSummary } from "./shareSummary.js";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function heading(summary: ShareSummary): { title: string; subtitle: string; note: string } {
  if (summary.kind === "group" && summary.group) {
    return {
      title: summary.group.nameZh,
      subtitle: `${summary.group.publishedReleaseCount} 个已发行 · ${summary.group.publishedTemplateCount} 张已发布小卡`,
      note: summary.group.scopeNote || "",
    };
  }
  if (summary.kind === "release" && summary.release) {
    return {
      title: summary.release.titleZh || summary.release.title,
      subtitle: `${summary.release.groupNameZh} · ${summary.release.publishedTemplateCount} 张已发布小卡`,
      note: "",
    };
  }
  if (summary.kind === "template" && summary.template) {
    const member = summary.template.memberNameZh || summary.template.memberNameEn || "";
    return {
      title: `${member} ${summary.template.version}`.trim(),
      subtitle: `${summary.template.groupNameZh} · ${summary.template.releaseTitle}`,
      note: summary.template.code,
    };
  }
  return { title: "星卡", subtitle: "小卡图鉴", note: "" };
}

/** Self-contained phone-first landing so QR (`/share/landing?g=`) is useful without H5. */
export function renderShareLandingHtml(summary: ShareSummary, opts?: { catalogUrl?: string | null }) {
  const h = heading(summary);
  const miniPath = summary.mini.path;
  const scheme = summary.cta.urlScheme || "";
  const urlLink = summary.cta.urlLink || "";
  const canJump = !!(scheme || urlLink);
  const missing = (summary.cta.missing || []).join("、");
  const catalogLink = opts?.catalogUrl
    ? `<a class="ghost" href="${escapeHtml(opts.catalogUrl)}">在微信中浏览图鉴</a>`
    : "";
  const releases =
    summary.group?.releases
      ?.map(
        (r) =>
          `<li><strong>${escapeHtml(r.titleZh || r.title)}</strong><span>${escapeHtml(r.releasedOn || "")}</span></li>`,
      )
      .join("") || "";
  const releaseList = releases ? `<ul class="list">${releases}</ul>` : "";
  const img =
    summary.template?.mainImageUrl
      ? `<img class="card" alt="" src="${escapeHtml(summary.template.mainImageUrl)}"/>`
      : "";
  const groupLogo = summary.group?.logoUrl
    ? `<img class="logo" alt="" src="${escapeHtml(summary.group.logoUrl)}"/>`
    : summary.group
      ? `<span class="logo letter" style="background:${escapeHtml(summary.group.logoColor || "#6b5cff")}">${escapeHtml((summary.group.nameZh || "?").slice(0, 1))}</span>`
      : "";
  const titleBlock = groupLogo
    ? `<div class="ident">${groupLogo}<h1>${escapeHtml(h.title)}</h1></div>`
    : `<h1>${escapeHtml(h.title)}</h1>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <title>${escapeHtml(h.title)} · 星卡</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: -apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans SC",sans-serif;
      background:#F4F5F9; color:#1A1B1F; }
    .wrap { max-width: 430px; margin: 0 auto; padding: 28px 20px 48px; }
    .brand { color:#6B5CFF; font-weight:700; font-size:14px; letter-spacing:.04em; }
    h1 { font-size: 26px; line-height:1.25; margin: 10px 0 8px; }
    .ident { display:flex; align-items:center; gap:12px; margin: 10px 0 8px; }
    .ident h1 { margin:0; }
    .logo { width:48px; height:48px; border-radius:12px; object-fit:cover; background:#e8e6f2; flex-shrink:0; }
    .logo.letter { display:inline-flex; align-items:center; justify-content:center; color:#fff; font-weight:700; }
    .sub { color:#667085; font-size:15px; margin:0 0 12px; }
    .note { color:#F79009; font-size:13px; margin:0 0 20px; }
    .card { width:100%; border-radius:12px; display:block; margin: 0 0 16px; background:#fff; }
    .list { list-style:none; padding:0; margin:0 0 20px; }
    .list li { background:#fff; border-radius:10px; padding:12px 14px; margin:0 0 8px;
      display:flex; justify-content:space-between; gap:12px; font-size:15px; }
    .list span { color:#667085; font-size:13px; }
    .cta { display:block; text-align:center; background:#6B5CFF; color:#fff; text-decoration:none;
      border:0; width:100%; border-radius:12px; padding:14px 16px; font-size:16px; font-weight:600; }
    .ghost { display:block; text-align:center; margin-top:12px; color:#6B5CFF; text-decoration:none; font-size:14px; }
    .fallback { margin-top:20px; background:#fff; border-radius:12px; padding:14px 16px; font-size:13px; color:#667085; }
    .path { word-break:break-all; color:#1A1B1F; margin-top:6px; user-select:all; -webkit-user-select:all; }
    .hint { margin-top:16px; font-size:13px; color:#667085; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">星卡 · 小卡图鉴</div>
    ${titleBlock}
    <p class="sub">${escapeHtml(h.subtitle)}</p>
    ${h.note ? `<p class="note">${escapeHtml(h.note)}</p>` : ""}
    ${img}
    ${releaseList}
    <a class="cta" id="openMini" ${urlLink ? `href="${escapeHtml(urlLink)}"` : 'href="#"'}>${escapeHtml(summary.cta.title)}</a>
    ${catalogLink}
    <div class="fallback">
      ${canJump ? "若未自动跳转：" : missing ? `当前无法自动打开小程序（缺少 ${escapeHtml(missing)}）。` : "当前未配置 URL Link / URL Scheme，无法自动跳转。"}
      长按下方路径复制，微信搜索「星卡」后粘贴；或扫描分享图上的小程序码。
      <div class="path" id="miniPath">${escapeHtml(miniPath)}</div>
      <a class="ghost" href="#" id="copyPath">复制小程序路径</a>
      <p class="hint" id="schemeMiss" style="display:${canJump ? "none" : "block"}">${canJump ? "若未自动跳转，请用上方复制/长按路径，或扫描分享图二维码。" : "配置 WX_SECRET 后 API 会签发打开链接；在此之前请复制路径或扫码。"}</p>
    </div>
    <p class="hint">${escapeHtml(summary.cta.hint)}</p>
  </div>
  <script>
    var scheme = ${JSON.stringify(scheme)};
    var urlLink = ${JSON.stringify(urlLink)};
    var path = ${JSON.stringify(miniPath)};
    function copyFallback() {
      var el = document.createElement("textarea");
      el.value = path;
      el.setAttribute("readonly", "true");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.focus();
      el.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(el);
    }
    function showMiss() {
      var n = document.getElementById("schemeMiss");
      if (n) n.style.display = "block";
    }
    document.getElementById("openMini").onclick = function (e) {
      var wxMini = window.wx && window.wx.miniProgram;
      if (wxMini && wxMini.navigateTo) {
        if (e) e.preventDefault();
        wxMini.navigateTo({ url: path.indexOf("/") === 0 ? path : "/" + path });
        return;
      }
      var target = urlLink || scheme;
      if (target) {
        if (urlLink) return;
        if (e) e.preventDefault();
        var a = document.createElement("a");
        a.href = target;
        a.rel = "noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { try { window.location.href = target; } catch (err) {} }, 80);
        setTimeout(showMiss, 1600);
        return;
      }
      if (e) e.preventDefault();
      document.getElementById("copyPath").click();
    };
    if (urlLink && /MicroMessenger/i.test(navigator.userAgent)) {
      setTimeout(function () {
        try { window.location.href = urlLink; } catch (err) {}
      }, 400);
    }
    document.getElementById("copyPath").onclick = function (e) {
      e.preventDefault();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(path).catch(copyFallback);
      } else {
        copyFallback();
      }
      showMiss();
      alert("已复制小程序路径，请打开微信搜索「星卡」后粘贴");
    };
  </script>
</body>
</html>`;
}
