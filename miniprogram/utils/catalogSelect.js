/**
 * Catalog album grid: nested release templates → select + batch own payload.
 */

function mapTemplatesForGrid(templates, mediaUrl) {
  return (templates || []).map((x) => ({
    ...x,
    mainImageUrl: mediaUrl ? mediaUrl(x.mainImageUrl) : x.mainImageUrl,
    on: false,
  }));
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

function toBatchOwnItems(selected) {
  return (selected || []).map((templateId) => ({ templateId, quantity: 1 }));
}

module.exports = {
  mapTemplatesForGrid,
  collectSelectedIds,
  toggleSelected,
  toBatchOwnItems,
};
