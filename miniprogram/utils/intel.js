/**
 * M2-b 情报 Tab 展示辅助：信任级过滤、上海时区文案、门票倒计时、外链复制/打开。
 * 时间优先用 API 的 startAtShanghai（+08:00），不依赖设备时区。
 */

const DISPLAY_TZ = "Asia/Shanghai";
const SHANGHAI_OFFSET_MS = 8 * 3600 * 1000;

const TRUST_LABELS = { L1: "L1", L2: "L2" };
const TRUST_HINTS = { L1: "高可信", L2: "需核对" };
const CATEGORY_LABELS = {
  official: "官方",
  news: "资讯",
  album: "专辑",
  concert: "演出",
  other: "其他",
};
const KIND_LABELS = {
  ticket_sale: "门票开售",
  live: "直播",
  comeback: "回归",
  fansign: "签售",
  broadcast: "播出",
  other: "其他",
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseInstant(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function shanghaiClock(isoShanghai, fallbackUtc) {
  const s = String(isoShanghai || "");
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (m) return `${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  const d = parseInstant(fallbackUtc);
  if (!d) return "";
  const t = new Date(d.getTime() + SHANGHAI_OFFSET_MS);
  return `${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())} ${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
}

function shanghaiDateKey(isoShanghai, fallbackUtc) {
  const s = String(isoShanghai || "");
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = parseInstant(fallbackUtc);
  if (!d) return "";
  const t = new Date(d.getTime() + SHANGHAI_OFFSET_MS);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

function timeRangeLabel(ev) {
  const start = shanghaiClock(ev.startAtShanghai, ev.startAt);
  if (!start) return "";
  if (!ev.endAtShanghai && !ev.endAt) return start;
  const end = shanghaiClock(ev.endAtShanghai, ev.endAt);
  if (!end) return start;
  const sd = shanghaiDateKey(ev.startAtShanghai, ev.startAt);
  const ed = shanghaiDateKey(ev.endAtShanghai, ev.endAt);
  if (sd === ed) return `${start}–${end.slice(-5)}`;
  return `${start}–${end}`;
}

function publishedLabel(item) {
  return shanghaiClock(null, item.publishedAt);
}

function visibleTrust(level) {
  return level === "L1" || level === "L2";
}

/** L3 / hidden 主时间线不可见（API 已过滤，客户端再挡一层）。 */
function isFeedVisible(item) {
  if (!item) return false;
  if (item.status && item.status !== "published") return false;
  return visibleTrust(item.trustLevel);
}

function isScheduleVisible(ev) {
  if (!ev) return false;
  if (ev.status && ev.status !== "published") return false;
  return visibleTrust(ev.trustLevel);
}

function visibleFeeds(items) {
  return (items || []).filter(isFeedVisible);
}

function visibleSchedules(events) {
  return (events || []).filter(isScheduleVisible);
}

function matchesGroup(item, groupId) {
  if (!groupId) return true;
  if (item.groupId && item.groupId === groupId) return true;
  const ids = item.groupIds || [];
  if (ids.indexOf(groupId) >= 0) return true;
  const groups = item.groups || [];
  return groups.some((g) => g && g.id === groupId);
}

function filterByGroup(items, groupId) {
  return (items || []).filter((item) => matchesGroup(item, groupId));
}

function groupLabelFrom(groups, fallback) {
  if (fallback && fallback.nameZh) return fallback.nameZh;
  if (fallback && fallback.nameEn) return fallback.nameEn;
  const names = (groups || [])
    .map((g) => (g && (g.nameZh || g.nameEn)) || "")
    .filter(Boolean);
  return names.join(" · ");
}

function decorateFeed(item) {
  const source = item.sourceNote || item.source || "";
  return {
    ...item,
    source,
    sourceBadge: source || CATEGORY_LABELS[item.category] || "来源",
    trustLabel: TRUST_LABELS[item.trustLevel] || item.trustLevel || "",
    trustHint: TRUST_HINTS[item.trustLevel] || "",
    categoryLabel: CATEGORY_LABELS[item.category] || item.category || "",
    translatedMark: item.isMachineTranslated ? "机翻" : "",
    groupLabel: groupLabelFrom(item.groups),
    publishedLabel: publishedLabel(item),
    outboundUrl: item.canonicalUrl || item.url || "",
  };
}

function ticketCountdown(startValue, nowMs) {
  const start = parseInstant(startValue);
  if (!start) return { text: "", overdue: false, live: false };
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  const diff = start.getTime() - now;
  if (diff <= 0) return { text: "已开售", overdue: true, live: false };
  const sec = Math.floor(diff / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  let text;
  if (d > 0) text = `${d}天${h}小时`;
  else if (h > 0) text = `${h}小时${pad2(m)}分`;
  else text = `${m}分${pad2(s)}秒`;
  return { text, overdue: false, live: true };
}

function applyCountdown(ev, nowMs) {
  if (!ev || !ev.isTicketSale) {
    return ev;
  }
  const cd = ticketCountdown(ev.startAtShanghai || ev.startAt, nowMs);
  return {
    ...ev,
    countdownText: cd.text,
    countdownLive: cd.live,
    countdownOverdue: cd.overdue,
  };
}

function decorateSchedule(ev, nowMs) {
  const kind = ev.kind || "other";
  const decorated = {
    ...ev,
    kindLabel: KIND_LABELS[kind] || kind,
    groupLabel: groupLabelFrom(null, ev.group),
    startLabel: shanghaiClock(ev.startAtShanghai, ev.startAt),
    timeRange: timeRangeLabel(ev),
    isTicketSale: kind === "ticket_sale",
    outboundUrl: ev.sourceUrl || "",
    trustLabel: TRUST_LABELS[ev.trustLevel] || ev.trustLevel || "",
    dateKey: shanghaiDateKey(ev.startAtShanghai, ev.startAt),
    timezone: ev.timezone || DISPLAY_TZ,
  };
  return applyCountdown(decorated, nowMs);
}

function groupEventsByDate(events) {
  const map = [];
  const index = {};
  (events || []).forEach((ev) => {
    const key = ev.dateKey || shanghaiDateKey(ev.startAtShanghai, ev.startAt) || "其他";
    if (index[key] == null) {
      index[key] = map.length;
      map.push({ date: key, label: key, items: [] });
    }
    map[index[key]].items.push(ev);
  });
  return map;
}

function followChips(groups, selectedGroupId) {
  const chips = [{ id: "", name: "全部", on: !selectedGroupId }];
  (groups || []).forEach((g) => {
    chips.push({
      id: g.id,
      name: g.nameZh || g.nameEn || g.slug || "组合",
      on: selectedGroupId === g.id,
    });
  });
  return chips;
}

function copyOutbound(url) {
  const u = String(url || "").trim();
  if (!u) {
    wx.showToast({ title: "暂无原文链接", icon: "none" });
    return;
  }
  wx.setClipboardData({
    data: u,
    success() {
      wx.showToast({ title: "链接已复制，可在浏览器打开", icon: "none" });
    },
  });
}

/**
 * 「系统打开」：有 wx.openUrl 则走系统浏览器；否则回退复制。
 * 不内嵌网页，也不依赖业务域名。
 */
function openOutbound(url) {
  const u = String(url || "").trim();
  if (!u) {
    wx.showToast({ title: "暂无原文链接", icon: "none" });
    return;
  }
  if (typeof wx.openUrl === "function") {
    wx.openUrl({
      url: u,
      fail() {
        copyOutbound(u);
      },
    });
    return;
  }
  copyOutbound(u);
}

function hasLiveCountdown(list) {
  return (list || []).some((x) => x && x.countdownLive);
}

module.exports = {
  DISPLAY_TZ,
  TRUST_LABELS,
  CATEGORY_LABELS,
  KIND_LABELS,
  shanghaiClock,
  shanghaiDateKey,
  timeRangeLabel,
  isFeedVisible,
  isScheduleVisible,
  visibleFeeds,
  visibleSchedules,
  filterByGroup,
  decorateFeed,
  decorateSchedule,
  ticketCountdown,
  applyCountdown,
  groupEventsByDate,
  followChips,
  copyOutbound,
  openOutbound,
  hasLiveCountdown,
};
