export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function statusBadge(status: string) {
  const label =
    status === "published" ? "已发布" : status === "deprecated" ? "已废弃" : status === "draft" ? "草稿" : status;
  return `<span class="badge ${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

export function option(value: string, label: string, selected?: string) {
  return `<option value="${escapeHtml(value)}" ${selected === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
}
