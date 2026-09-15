/**
 * 投稿通路 / 特典：词典 + 发行对照表可搜索；无匹配可「其他/手填」（OQ-A）。
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

function filterOptions(options, q) {
  const s = String(q || "").trim().toLowerCase();
  const other = { value: OTHER_VALUE, label: OTHER_LABEL, aliases: ["其他", "手填"], kind: "other" };
  const base = options || [];
  if (!s) return [...base.slice(0, MAX_HITS - 1), other];
  const hits = base.filter((o) => {
    const blob = [o.label, o.value, ...(o.aliases || [])].join(" ").toLowerCase();
    return blob.includes(s);
  });
  return [...hits.slice(0, MAX_HITS - 1), other];
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
};
