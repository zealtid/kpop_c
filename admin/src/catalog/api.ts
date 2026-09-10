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

export async function loadCatalog(): Promise<CatalogLoadResult> {
  const [groups, members, releases, templates] = await Promise.all([
    api<{ groups: Group[] }>("/admin/catalog/groups"),
    api<{ members: Member[] }>("/admin/catalog/members"),
    api<{ releases: Release[] }>("/admin/catalog/releases"),
    api<{ templates: Template[] }>("/admin/catalog/templates"),
  ]);
  const failed = [groups, members, releases, templates].find((r) => r.status !== 200);
  if (failed) {
    const denied = failed.status === 403;
    return {
      ok: false,
      status: failed.status,
      message: errorMessage(failed.body, denied ? "没有权限访问运营接口" : "请求失败"),
    };
  }
  return {
    ok: true,
    data: {
      groups: groups.body.groups || [],
      members: members.body.members || [],
      releases: releases.body.releases || [],
      templates: templates.body.templates || [],
    },
  };
}

export type CatalogFormPayload = Record<string, unknown>;

export async function saveCatalog(tab: CatalogCrudTab, editingId: string | null, body: CatalogFormPayload) {
  const path = editingId ? `${PATH[tab]}/${editingId}` : PATH[tab];
  return api(path, { method: editingId ? "PATCH" : "POST", body: JSON.stringify(body) });
}

export async function setCatalogStatus(tab: CatalogCrudTab, id: string, status: string) {
  return api(`${PATH[tab]}/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
}
