/**
 * 收藏列表封面：主视觉必须是用户小卡主图，禁止用团图标充门面。
 */
function resolveListVisual(group, mediaUrl) {
  const g = group || {};
  const cover = g.cover || {};
  const rawCover = cover.mainImageUrl || "";
  const coverSrc = rawCover && typeof mediaUrl === "function" ? mediaUrl(rawCover) : rawCover;
  const logoRaw = g.iconUrl || g.logoUrl || "";
  const logoSrc = logoRaw && typeof mediaUrl === "function" ? mediaUrl(logoRaw) : logoRaw;
  const initial = String(g.nameZh || g.nameEn || "?").slice(0, 1);
  return {
    coverSrc: coverSrc || "",
    coverSource: cover.source || "none",
    hasCover: !!coverSrc,
    logoSrc: logoSrc || "",
    initial,
    logoColor: g.logoColor || "#EBEDF3",
  };
}

function decorateFollowedGroup(group, mediaUrl) {
  const g = group || {};
  const visual = resolveListVisual(g, mediaUrl);
  const published = g.progress && g.progress.publishedCount ? g.progress.publishedCount : 0;
  const owned = g.progress && g.progress.ownedDistinct ? g.progress.ownedDistinct : 0;
  return {
    ...g,
    ...visual,
    pct: published ? Math.round((owned / published) * 100) : 0,
  };
}

module.exports = {
  resolveListVisual,
  decorateFollowedGroup,
};
