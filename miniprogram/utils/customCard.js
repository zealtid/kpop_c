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

function mapCatalogRelease(row) {
  if (!row) return null;
  const title = row.title || "";
  const titleZh = row.titleZh || row.title_zh || "";
  return {
    id: String(row.id),
    groupId: String(row.groupId || row.group_id || ""),
    title,
    titleZh,
    aliases: row.aliases || "",
    releasedOn: row.releasedOn || row.released_on || "",
    kind: row.kind || "",
    label: titleZh || title,
  };
}

function releaseSearchHay(rel) {
  return [rel.title, rel.titleZh, rel.aliases, rel.label].filter(Boolean).join(" ").toLowerCase();
}

function filterReleases(releases, q) {
  const query = String(q || "").trim().toLowerCase();
  if (!query) return releases || [];
  return (releases || []).filter((r) => releaseSearchHay(r).includes(query));
}

function nextReleaseIdOnGroupChange(prevReleaseId, nextReleases) {
  if (!prevReleaseId) return "";
  const ok = (nextReleases || []).some((r) => String(r.id) === String(prevReleaseId));
  return ok ? String(prevReleaseId) : "";
}

function hasCustomMeta(card) {
  if (!card) return false;
  return !!(card.releaseId || card.releaseTitle || card.releaseTitleZh || card.benefitName || card.versionLabel);
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

/**
 * 删除私人自定义卡：wx.showModal 确认后调用 DELETE /collection/custom-cards/:id。
 * 取消时 { cancelled: true }；成功时 { cancelled: false, data }。
 */
function confirmDeleteCustomCard(id, request) {
  return new Promise((resolve, reject) => {
    if (!id) {
      reject({ status: 400, message: "缺少卡片" });
      return;
    }
    wx.showModal({
      title: "删除自定义卡",
      content: "删除后不可恢复",
      success(res) {
        if (!res.confirm) {
          resolve({ cancelled: true });
          return;
        }
        request({ url: `/collection/custom-cards/${id}`, method: "DELETE" })
          .then((data) => {
            wx.showToast({ title: "已删除" });
            resolve({ cancelled: false, data });
          })
          .catch(reject);
      },
      fail(err) {
        reject(err);
      },
    });
  });
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
  mapCatalogRelease,
  filterReleases,
  nextReleaseIdOnGroupChange,
  hasCustomMeta,
  openFullscreen,
  takePreviewSrc,
  clearPreviewSrc,
  confirmDeleteCustomCard,
};
