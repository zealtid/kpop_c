/**
 * 私人拍照加卡展示口径（M1.5 / PC03–PC06）
 */

const CUSTOM_BADGE = "自定义";

function customCountLabel(n) {
  const count = Number(n) || 0;
  if (count <= 0) return CUSTOM_BADGE;
  return `${CUSTOM_BADGE} ${count} 张`;
}

function moderationBadge(status) {
  if (status === "pending") return "审核中";
  if (status === "rejected") return "未通过";
  return "";
}

function inNormalCollection(status) {
  return status === "pending" || status === "approved";
}

function inShareImage(status) {
  return status === "pending" || status === "approved";
}

function decorateCustomCard(card, mediaUrl) {
  const status = (card && card.moderationStatus) || "pending";
  const image = (card && (card.mainImageUrl || card.imageFront)) || "";
  return {
    ...card,
    kind: "custom",
    custom: true,
    badge: CUSTOM_BADGE,
    moderationLabel: moderationBadge(status),
    mainImageUrl: typeof mediaUrl === "function" ? mediaUrl(image) : image,
  };
}

/** 常规收藏大图：pending/approved 可开；rejected 没有该入口 */
function canOpenFullscreen(status) {
  return inNormalCollection(status);
}

function mapCatalogMember(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    groupId: String(row.groupId || row.group_id || ""),
    nameZh: row.nameZh || row.name_zh || "",
    nameEn: row.nameEn || row.name_en || "",
    color: row.color || "#8a8494",
  };
}

function nextMemberIdOnGroupChange(prevMemberId, nextMembers) {
  if (!prevMemberId) return "";
  const ok = (nextMembers || []).some((m) => String(m.id) === String(prevMemberId));
  return ok ? String(prevMemberId) : "";
}

let previewSrc = "";

function openFullscreen(src) {
  if (!src) return false;
  previewSrc = src;
  if (typeof wx !== "undefined" && typeof wx.navigateTo === "function") {
    wx.navigateTo({ url: "/pages/image-preview/index" });
  }
  return true;
}

function takePreviewSrc() {
  return previewSrc || "";
}

function clearPreviewSrc() {
  previewSrc = "";
}

module.exports = {
  CUSTOM_BADGE,
  customCountLabel,
  moderationBadge,
  inNormalCollection,
  inShareImage,
  decorateCustomCard,
  canOpenFullscreen,
  mapCatalogMember,
  nextMemberIdOnGroupChange,
  openFullscreen,
  takePreviewSrc,
  clearPreviewSrc,
};
