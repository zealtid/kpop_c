/**
 * 单卡品相 / 数量 / 备注（PR-P1-4 / O06）
 * 与 API CARD_CONDITIONS 对齐：mint 全新 / near_mint 近全新 / excellent 优秀 / good 良好 / poor 较差
 */

const CONDITIONS = [
  { value: "", label: "未填写" },
  { value: "mint", label: "全新" },
  { value: "near_mint", label: "近全新" },
  { value: "excellent", label: "优秀" },
  { value: "good", label: "良好" },
  { value: "poor", label: "较差" },
];

const QTY_MIN = 1;
const QTY_MAX = 99;
const NOTES_MAX = 500;

function conditionLabel(value) {
  const key = value || "";
  const hit = CONDITIONS.find((c) => c.value === key);
  return hit ? hit.label : "";
}

function clampQuantity(n) {
  const q = Number(n);
  if (!Number.isFinite(q)) return QTY_MIN;
  const i = Math.trunc(q);
  if (i < QTY_MIN) return QTY_MIN;
  if (i > QTY_MAX) return QTY_MAX;
  return i;
}

function toPatchBody({ quantity, condition, notes }) {
  const text = typeof notes === "string" ? notes : "";
  return {
    quantity: clampQuantity(quantity),
    condition: condition || null,
    notes: text,
  };
}

module.exports = {
  CONDITIONS,
  QTY_MIN,
  QTY_MAX,
  NOTES_MAX,
  conditionLabel,
  clampQuantity,
  toPatchBody,
};
