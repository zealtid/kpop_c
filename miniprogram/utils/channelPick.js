/**
 * 投稿特典：词典可搜索；无匹配可「其他/手填」（OQ-A）。对照表已软下线。
 */

const OTHER_VALUE = "__other__";
const OTHER_LABEL = "其他/手填";
const MAX_HITS = 24;

function mapChannels(channels) {
  return (channels || [])
    .map((c) => ({
      value: String(c.code || "").trim(),
      label: String(c.nameZh || c.name_zh || c.code || "").trim(),
      aliases: Array.isArray(c.aliases) ? c.aliases.map((a) => String(a)) : [],
      kind: "channel",
    }))
    .filter((c) => c.value);
}

function mapBenefitRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const value = String(row.channelCode || "").trim();
    const channelName = String(row.channelNameZh || "").trim();
    const benefit = String(row.benefitNameZh || "").trim();
    const label = [channelName || value, benefit].filter(Boolean).join(" · ");
    const key = `${value}|${label}`;
    if (!value || !label || seen.has(key)) continue;
    seen.add(key);
    out.push({
      value,
      label,
      aliases: [channelName, benefit].filter(Boolean),
      kind: "benefit",
    });
  }
  return out;
}

function mergeOptions(channels, benefits) {
  const out = [];
  const seen = new Set();
  for (const item of [...(benefits || []), ...(channels || [])]) {
    const key = `${item.value}|${item.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function withOther(options) {
  return [...(options || []), { value: OTHER_VALUE, label: OTHER_LABEL, aliases: ["其他", "手填"], kind: "other" }];
}

function optionKey(item, index) {
  return `${item.kind || "x"}:${item.value}:${item.label}:${index}`;
}

function withKeys(list) {
  return (list || []).map((item, index) => ({ ...item, key: optionKey(item, index) }));
}

function filterOptions(options, q, maxHits) {
  const cap = Number(maxHits) > 0 ? Number(maxHits) : MAX_HITS;
  const s = String(q || "").trim().toLowerCase();
  const other = { value: OTHER_VALUE, label: OTHER_LABEL, aliases: ["其他", "手填"], kind: "other" };
  const base = options || [];
  if (!s) return withKeys([...base.slice(0, Math.max(1, cap - 1)), other]);
  const hits = base.filter((o) => {
    const blob = [o.label, o.value, ...(o.aliases || [])].join(" ").toLowerCase();
    return blob.includes(s);
  });
  return withKeys([...hits.slice(0, Math.max(1, cap - 1)), other]);
}

function displayLabel(channelValue, channelLabel, channelCustom, channelOther) {
  if (channelOther || isOther(channelValue)) {
    const t = String(channelCustom || "").trim();
    return t || OTHER_LABEL;
  }
  return String(channelLabel || "").trim();
}

function benefitsQuery(groupId, releaseId) {
  const params = [];
  if (groupId) params.push(`groupId=${encodeURIComponent(String(groupId))}`);
  if (releaseId) params.push(`releaseId=${encodeURIComponent(String(releaseId))}`);
  return params.length ? `/catalog/benefits?${params.join("&")}` : "/catalog/benefits";
}

function isOther(value) {
  return value === OTHER_VALUE;
}

function resolveChannelCode(selectedValue, customText) {
  if (isOther(selectedValue)) {
    const t = String(customText || "").trim();
    return t || null;
  }
  const v = String(selectedValue || "").trim();
  return v || null;
}

module.exports = {
  OTHER_VALUE,
  OTHER_LABEL,
  MAX_HITS,
  mapChannels,
  mapBenefitRows,
  mergeOptions,
  withOther,
  filterOptions,
  isOther,
  resolveChannelCode,
  displayLabel,
  benefitsQuery,
};
