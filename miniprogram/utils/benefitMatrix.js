/**
 * 图鉴发行页版本×特典矩阵（刀 B）。只读 confirmed 对照，不造假图。
 */

const EMPTY_COPY = "暂无特典对照，请稍后再看";
const PENDING_LABEL = "图鉴待补";
const INCOMPLETE_COPY = "特典信息来自运营对照表，可能不完整";
const READY_COPY = "已凑齐全部特典";
const DEFAULT_VERSION = "standard";

function versionKey(value) {
  return String(value || "").trim().toLowerCase();
}

function rowMatchesVersion(row, version) {
  return versionKey(row && row.versionLabel) === versionKey(version);
}

function rowsForVersion(rows, version) {
  return (rows || []).filter((row) => rowMatchesVersion(row, version));
}

function initialVersion(versions, rows) {
  const list = versions && versions.length ? versions : [DEFAULT_VERSION];
  const hit = list.find((v) => rowsForVersion(rows, v).length > 0);
  return hit || list[0];
}

function decorateSlot(slot, mediaUrl) {
  const navigable = !!(slot && slot.navigable && slot.templateStatus === "published");
  const raw = navigable && slot && slot.imageUrl ? String(slot.imageUrl) : "";
  const imageUrl = raw && typeof mediaUrl === "function" ? mediaUrl(raw) : raw;
  return Object.assign({}, slot, {
    navigable,
    imageUrl: imageUrl || "",
    pending: !navigable,
    pendingLabel: PENDING_LABEL,
  });
}

function decorateRows(rows, mediaUrl) {
  return (rows || []).map((row) =>
    Object.assign({}, row, {
      slots: (row.slots || []).map((slot) => decorateSlot(slot, mediaUrl)),
    }),
  );
}

function footnote(completeness) {
  if (completeness && completeness.ready && completeness.copy === READY_COPY) {
    return READY_COPY;
  }
  const copy = completeness && completeness.copy ? String(completeness.copy) : "";
  if (!completeness || !completeness.ready) {
    return copy && copy !== READY_COPY ? copy : INCOMPLETE_COPY;
  }
  return copy || INCOMPLETE_COPY;
}

function isNavigableFlag(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function searchQueryForSlot(slot) {
  if (!slot) return "";
  return slot.templateName || slot.label || "";
}

function hasFakeImage(slot) {
  if (!slot) return false;
  if (slot.pending || !slot.navigable) return !!slot.imageUrl;
  return false;
}

module.exports = {
  EMPTY_COPY,
  PENDING_LABEL,
  INCOMPLETE_COPY,
  READY_COPY,
  DEFAULT_VERSION,
  versionKey,
  rowMatchesVersion,
  rowsForVersion,
  initialVersion,
  decorateSlot,
  decorateRows,
  footnote,
  isNavigableFlag,
  searchQueryForSlot,
  hasFakeImage,
};
