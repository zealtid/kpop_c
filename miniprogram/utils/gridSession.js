/**
 * 宫格入册会话：整页图 + 切分框。切分失败走 UGC-1 单卡预填。
 */

let session = null;

function begin(opts) {
  const boxesIn = opts.boxes || [];
  session = {
    src: opts.src || "",
    origW: Number(opts.origW) || 0,
    origH: Number(opts.origH) || 0,
    cells: Number(opts.cells) || boxesIn.length || 0,
    boxes: boxesIn.map((b, i) => ({
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      index: b.index == null ? i : b.index,
      rotation: b.rotation || 0,
      memberId: b.memberId || "",
      suggestedMemberName: b.suggestedMemberName || b.memberName || "",
      slotLabel: b.slotLabel || `卡${i + 1}`,
      channelValue: b.channelValue || "",
      channelCustom: b.channelCustom || "",
      channelLabel: b.channelLabel || "",
      channelOther: !!b.channelOther,
      deleted: !!b.deleted,
    })),
    library: opts.library || "doubao",
    method: opts.method || "",
    confidence: opts.confidence || 0,
    fromServer: !!opts.fromServer,
    engine: opts.engine || (opts.fromServer ? "vlm" : "jsfeat"),
    detectedCount: Number(opts.detectedCount) || boxesIn.length || 0,
    truncated: !!opts.truncated,
    suggestedVersionLabel: opts.suggestedVersionLabel || "",
    groupId: opts.groupId || "",
    releaseId: opts.releaseId || "",
    versionLabel: opts.versionLabel || opts.suggestedVersionLabel || "",
  };
  return session;
}

function get() {
  return session;
}

function setBoxes(boxes) {
  if (!session) return;
  session.boxes = boxes;
}

function setMeta(patch) {
  if (!session) return;
  Object.assign(session, patch || {});
}

function activeCards() {
  if (!session) return [];
  return (session.boxes || []).filter((b) => !b.deleted);
}

function cancel() {
  session = null;
}

function ugc1Prefill(src, extra) {
  const payload = {
    frontPath: src || (session && session.src) || "",
    frontPreview: src || (session && session.src) || "",
    groupId: (extra && extra.groupId) || (session && session.groupId) || "",
    releaseId: (extra && extra.releaseId) || (session && session.releaseId) || "",
    versionLabel: (extra && extra.versionLabel) || (session && session.versionLabel) || "",
  };
  return payload;
}

function degradeToUgc1(wxLike, src, extra) {
  const prefill = ugc1Prefill(src, extra);
  if (wxLike && typeof wxLike.setStorageSync === "function") {
    wxLike.setStorageSync("ugc_submit_prefill", prefill);
  }
  if (wxLike && typeof wxLike.redirectTo === "function") {
    wxLike.redirectTo({ url: "/pages/catalog-submit/index" });
  } else if (wxLike && typeof wxLike.navigateTo === "function") {
    wxLike.navigateTo({ url: "/pages/catalog-submit/index" });
  }
  return prefill;
}

function maxSubmit(engine) {
  return engine === "jsfeat" ? MAX_SUBMIT_MANUAL : MAX_SUBMIT;
}

function matchMemberId(name, members) {
  const q = String(name || "").trim().toLowerCase();
  if (!q || !members || !members.length) return "";
  const found = members.find((m) => {
    const en = String(m.nameEn || "").trim().toLowerCase();
    const zh = String(m.nameZh || "").trim().toLowerCase();
    return en === q || zh === q || (en && q.indexOf(en) >= 0) || (zh && q.indexOf(zh) >= 0);
  });
  return found ? String(found.id) : "";
}

const MAX_DETECT = 64;
const MAX_SUBMIT = 64;
const MAX_SUBMIT_MANUAL = 9;
const TRUNCATE_TOAST = `一次最多处理 ${MAX_DETECT} 张，请删减`;

module.exports = {
  begin,
  get,
  setBoxes,
  setMeta,
  activeCards,
  cancel,
  ugc1Prefill,
  degradeToUgc1,
  matchMemberId,
  maxSubmit,
  MAX_DETECT,
  MAX_SUBMIT,
  MAX_SUBMIT_MANUAL,
  TRUNCATE_TOAST,
};
