/**
 * 宫格入册会话：整页图 + 切分框。切分失败走 UGC-1 单卡预填。
 */

let session = null;

function begin(opts) {
  session = {
    src: opts.src || "",
    origW: Number(opts.origW) || 0,
    origH: Number(opts.origH) || 0,
    cells: Number(opts.cells) === 9 ? 9 : 4,
    boxes: (opts.boxes || []).map((b, i) => ({
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      index: b.index == null ? i : b.index,
      rotation: b.rotation || 0,
      memberId: b.memberId || "",
      slotLabel: b.slotLabel || `宫格${i + 1}`,
      channelValue: b.channelValue || "",
      channelCustom: b.channelCustom || "",
      channelLabel: b.channelLabel || "",
      channelOther: !!b.channelOther,
      deleted: false,
    })),
    library: opts.library || "jsfeat",
    method: opts.method || "",
    confidence: opts.confidence || 0,
    fromServer: !!opts.fromServer,
    groupId: opts.groupId || "",
    releaseId: opts.releaseId || "",
    versionLabel: opts.versionLabel || "",
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

module.exports = {
  begin,
  get,
  setBoxes,
  setMeta,
  activeCards,
  cancel,
  ugc1Prefill,
  degradeToUgc1,
};
