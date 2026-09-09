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

module.exports = {
  CUSTOM_BADGE,
  customCountLabel,
  moderationBadge,
  inNormalCollection,
  inShareImage,
  decorateCustomCard,
};
