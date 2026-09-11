import { api, errorMessage } from "../api";
import type { CatalogBundle, CatalogCrudTab, Group, Member, Release, Template } from "./types";

const PATH: Record<CatalogCrudTab, string> = {
  groups: "/admin/catalog/groups",
  members: "/admin/catalog/members",
  releases: "/admin/catalog/releases",
  templates: "/admin/catalog/templates",
};

export type CatalogLoadResult =
  | { ok: true; data: CatalogBundle }
  | { ok: false; status: number; message: string };

export type CatalogListQuery = {
  q?: string;
  groupId?: string;
  releaseId?: string;
  memberId?: string;
  status?: string;
};

function withQuery(path: string, query?: CatalogListQuery) {
  const qs = new URLSearchParams();
  if (query?.q) qs.set("q", query.q);
  if (query?.groupId) qs.set("groupId", query.groupId);
  if (query?.releaseId) qs.set("releaseId", query.releaseId);
  if (query?.memberId) qs.set("memberId", query.memberId);
  if (query?.status) qs.set("status", query.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return `${path}${suffix}`;
}

function deniedMessage(status: number, body: unknown) {
  return errorMessage(body, status === 403 ? "没有权限访问运营接口" : "请求失败");
}

function fail(status: number, body: unknown): CatalogLoadResult {
  return { ok: false, status, message: deniedMessage(status, body) };
}

export async function loadCatalogLookups(): Promise<CatalogLoadResult> {
  const [groups, members, releases] = await Promise.all([
    api<{ groups: Group[] }>("/admin/catalog/groups"),
    api<{ members: Member[] }>("/admin/catalog/members"),
    api<{ releases: Release[] }>("/admin/catalog/releases"),
  ]);
  const failed = [groups, members, releases].find((r) => r.status !== 200);
  if (failed) return fail(failed.status, failed.body);
  return {
    ok: true,
    data: {
      groups: groups.body.groups || [],
      members: members.body.members || [],
      releases: releases.body.releases || [],
      templates: [],
    },
  };
}

export async function loadAdminTemplates(query?: CatalogListQuery) {
  const res = await api<{ templates: Template[] }>(withQuery("/admin/catalog/templates", query));
  if (res.status !== 200) {
    return { ok: false as const, status: res.status, message: deniedMessage(res.status, res.body), templates: [] as Template[] };
  }
  return { ok: true as const, templates: res.body.templates || [] };
}

export async function loadCatalog(query?: CatalogListQuery): Promise<CatalogLoadResult> {
  const [lookups, templates] = await Promise.all([loadCatalogLookups(), loadAdminTemplates(query)]);
  if (!lookups.ok) return lookups;
  if (!templates.ok) return { ok: false, status: templates.status, message: templates.message };
  return { ok: true, data: { ...lookups.data, templates: templates.templates } };
}

export type CatalogFormPayload = Record<string, unknown>;

export async function saveCatalog(tab: CatalogCrudTab, editingId: string | null, body: CatalogFormPayload) {
  const path = editingId ? `${PATH[tab]}/${editingId}` : PATH[tab];
  return api(path, { method: editingId ? "PATCH" : "POST", body: JSON.stringify(body) });
}

export async function setCatalogStatus(tab: CatalogCrudTab, id: string, status: string) {
  return api(`${PATH[tab]}/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
}
