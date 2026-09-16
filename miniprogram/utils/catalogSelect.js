/**
 * Catalog album grid: nested release templates → select + batch own payload.
 */

const BENEFIT_PREFIX = "特典";

function versionChipLabel(t) {
  const version = String((t && (t.version || t.versionLabel)) || "").trim();
  if (t && t.isBenefit) {
    if (!version) return BENEFIT_PREFIX;
    if (version.indexOf(BENEFIT_PREFIX) === 0) return version;
    return `${BENEFIT_PREFIX}-${version}`;
  }
  return version;
}

function mapTemplatesForGrid(templates, mediaUrl) {
  return (templates || []).map((x) => ({
    ...x,
    mainImageUrl: mediaUrl ? mediaUrl(x.mainImageUrl) : x.mainImageUrl,
    versionChip: versionChipLabel(x),
    on: false,
  }));
}

function withAlbumExpanded(releases, prev) {
  const prevMap = {};
  for (const r of prev || []) {
    if (r && r.id != null) prevMap[r.id] = !!r.expanded;
  }
  return (releases || []).map((r, i) => ({
    ...r,
    expanded: Object.prototype.hasOwnProperty.call(prevMap, r.id) ? prevMap[r.id] : i === 0,
  }));
}

function toggleAlbumExpanded(releases, releaseId) {
  return (releases || []).map((r) => (r.id === releaseId ? { ...r, expanded: !r.expanded } : r));
}

function collectSelectedIds(releases) {
  const selected = [];
  for (const r of releases || []) {
    for (const t of r.templates || []) {
      if (t.on) selected.push(t.id);
    }
  }
  return selected;
}

function toggleSelected(releases, templateId) {
  const next = (releases || []).map((r) => ({
    ...r,
    templates: (r.templates || []).map((t) => (t.id === templateId ? { ...t, on: !t.on } : t)),
  }));
  return { releases: next, selected: collectSelectedIds(next) };
}

function clearSelected(releases) {
  const next = (releases || []).map((r) => ({
    ...r,
    templates: (r.templates || []).map((t) => ({ ...t, on: false })),
  }));
  return { releases: next, selected: [] };
}

function toBatchOwnItems(selected) {
  return (selected || []).map((templateId) => ({ templateId, quantity: 1 }));
}

module.exports = {
  versionChipLabel,
  mapTemplatesForGrid,
  withAlbumExpanded,
  toggleAlbumExpanded,
  collectSelectedIds,
  toggleSelected,
  clearSelected,
  toBatchOwnItems,
};
