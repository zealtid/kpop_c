/**
 * 关注选择：首次引导与「管理关注」共用（ME05 / ME07）。
 * 引导页沿用已有 1–3 上限；管理页不新加硬顶（与当前我的页 / PUT /me/follows 一致）。
 */

function normalizeQuery(q) {
  return String(q || "").trim().toLowerCase();
}

function groupSearchText(group) {
  if (!group) return "";
  return [group.nameZh, group.nameEn, group.nameKo, group.aliases, group.slug]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterGroups(groups, query) {
  const q = normalizeQuery(query);
  const list = groups || [];
  if (!q) return list;
  return list.filter((g) => groupSearchText(g).indexOf(q) !== -1);
}

function selectedIds(groups) {
  return (groups || []).filter((g) => g.selected).map((g) => g.id);
}

function toggleGroup(groups, id, opts) {
  const maxCount = opts && opts.maxCount ? opts.maxCount : 0;
  const selectedCount = selectedIds(groups).length;
  let blocked = false;
  const next = (groups || []).map((g) => {
    if (g.id !== id) return g;
    if (g.selected) return { ...g, selected: false };
    if (maxCount && selectedCount >= maxCount) {
      blocked = true;
      return g;
    }
    return { ...g, selected: true };
  });
  return { groups: next, blocked };
}

function clearSelected(groups) {
  return (groups || []).map((g) => ({ ...g, selected: false }));
}

function sameIdSet(a, b) {
  const left = (a || []).slice().sort();
  const right = (b || []).slice().sort();
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function canComplete(groups, opts) {
  const n = selectedIds(groups).length;
  const minCount = opts && opts.minCount != null ? opts.minCount : 0;
  const maxCount = opts && opts.maxCount ? opts.maxCount : 0;
  if (n < minCount) return false;
  if (maxCount && n > maxCount) return false;
  return true;
}

function countLabel(selectedCount, maxCount) {
  if (maxCount) return `已选 ${selectedCount}/${maxCount}`;
  return `已选 ${selectedCount}`;
}

function groupInitial(group) {
  const name = (group && (group.nameZh || group.nameEn || group.slug)) || "?";
  return String(name).slice(0, 1);
}

function followSummary(groups, previewLimit) {
  const followed = groups || [];
  const limit = previewLimit || 5;
  const preview = followed.slice(0, limit).map((g) => ({
    id: g.id,
    nameZh: g.nameZh,
    logoColor: g.logoColor,
    initial: groupInitial(g),
  }));
  return {
    count: followed.length,
    preview,
    label: `已关注 ${followed.length} 个团体`,
  };
}

function privacyOptionClass(current, value) {
  return current === value ? "on" : "";
}

module.exports = {
  normalizeQuery,
  groupSearchText,
  filterGroups,
  selectedIds,
  toggleGroup,
  clearSelected,
  sameIdSet,
  canComplete,
  countLabel,
  groupInitial,
  followSummary,
  privacyOptionClass,
};
