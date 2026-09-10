<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import {
  NButton,
  NCheckbox,
  NDatePicker,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpace,
} from "naive-ui";
import type { CatalogCrudTab, Group, Member, Release, Template } from "../../catalog/types";
import { RELEASE_KINDS } from "../../catalog/types";

export type CatalogFormModel = {
  slug: string;
  nameZh: string;
  nameEn: string;
  nameKo: string;
  aliases: string;
  logoColor: string;
  scopeNote: string;
  isPilot: boolean;
  groupId: string;
  color: string;
  sortOrder: number;
  title: string;
  titleZh: string;
  releasedOn: string | null;
  kind: string;
  releaseId: string;
  memberId: string;
  version: string;
  name: string;
  mainImageUrl: string;
  isBenefit: boolean;
};

const props = defineProps<{
  show: boolean;
  tab: CatalogCrudTab;
  editing: Group | Member | Release | Template | null;
  groups: Group[];
  members: Member[];
  releases: Release[];
  submitting: boolean;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
  save: [payload: Record<string, unknown>];
}>();

function emptyForm(): CatalogFormModel {
  return {
    slug: "",
    nameZh: "",
    nameEn: "",
    nameKo: "",
    aliases: "",
    logoColor: "#ff6b9d",
    scopeNote: "",
    isPilot: true,
    groupId: "",
    color: "#888888",
    sortOrder: 0,
    title: "",
    titleZh: "",
    releasedOn: null,
    kind: "album",
    releaseId: "",
    memberId: "",
    version: "",
    name: "",
    mainImageUrl: "",
    isBenefit: false,
  };
}

const form = reactive<CatalogFormModel>(emptyForm());

const title = computed(() => {
  const editing = !!props.editing;
  if (props.tab === "groups") return editing ? "编辑组合" : "新建组合";
  if (props.tab === "members") return editing ? "编辑成员" : "新建成员";
  if (props.tab === "releases") return editing ? "编辑发行" : "新建发行";
  return editing ? "编辑模板" : "新建模板（草稿）";
});

const groupOptions = computed(() =>
  props.groups.map((g) => ({ label: `${g.nameZh} (${g.slug})`, value: g.id })),
);

const releaseOptions = computed(() =>
  props.releases.map((r) => ({ label: `${r.groupNameZh || ""} · ${r.title}`, value: r.id })),
);

const memberOptions = computed(() => [
  { label: "（组合卡 / 无成员）", value: "" },
  ...props.members.map((m) => ({ label: `${m.groupNameZh || ""} · ${m.nameEn}`, value: m.id })),
]);

const dedupeKey = computed(() => {
  if (props.tab !== "templates" || !props.editing) return "";
  return (props.editing as Template).dedupeKey || "";
});

function hydrate() {
  const next = emptyForm();
  const row = props.editing;
  if (!row) {
    if (props.tab === "members" && props.groups[0]) next.groupId = props.groups[0].id;
    if (props.tab === "releases" && props.groups[0]) next.groupId = props.groups[0].id;
    if (props.tab === "templates" && props.releases[0]) next.releaseId = props.releases[0].id;
    Object.assign(form, next);
    return;
  }
  if (props.tab === "groups") {
    const g = row as Group;
    Object.assign(form, {
      ...next,
      slug: g.slug || "",
      nameZh: g.nameZh || "",
      nameEn: g.nameEn || "",
      nameKo: g.nameKo || "",
      aliases: g.aliases || "",
      logoColor: g.logoColor || "#ff6b9d",
      scopeNote: g.scopeNote || "",
      isPilot: g.isPilot !== false,
    });
    return;
  }
  if (props.tab === "members") {
    const m = row as Member;
    Object.assign(form, {
      ...next,
      groupId: m.groupId || "",
      nameEn: m.nameEn || "",
      nameZh: m.nameZh || "",
      nameKo: m.nameKo || "",
      aliases: m.aliases || "",
      color: m.color || "#888888",
      sortOrder: m.sortOrder ?? 0,
    });
    return;
  }
  if (props.tab === "releases") {
    const r = row as Release;
    Object.assign(form, {
      ...next,
      groupId: r.groupId || "",
      title: r.title || "",
      titleZh: r.titleZh || "",
      aliases: r.aliases || "",
      releasedOn: r.releasedOn || null,
      kind: r.kind || "album",
    });
    return;
  }
  const t = row as Template;
  Object.assign(form, {
    ...next,
    releaseId: t.releaseId || "",
    memberId: t.memberId || "",
    version: t.version || "",
    name: t.name || "",
    mainImageUrl: t.mainImageUrl || "",
    isBenefit: !!t.isBenefit,
  });
}

watch(
  () => [props.show, props.tab, props.editing?.id],
  () => {
    if (props.show) hydrate();
  },
);

function toPayload(): Record<string, unknown> {
  if (props.tab === "groups") {
    return {
      slug: form.slug.trim(),
      nameZh: form.nameZh.trim(),
      nameEn: form.nameEn.trim(),
      nameKo: form.nameKo.trim(),
      aliases: form.aliases.trim(),
      logoColor: form.logoColor.trim(),
      scopeNote: form.scopeNote.trim(),
      isPilot: form.isPilot,
    };
  }
  if (props.tab === "members") {
    return {
      groupId: form.groupId,
      nameEn: form.nameEn.trim(),
      nameZh: form.nameZh.trim(),
      nameKo: form.nameKo.trim(),
      aliases: form.aliases.trim(),
      color: form.color.trim(),
      sortOrder: Number(form.sortOrder || 0),
    };
  }
  if (props.tab === "releases") {
    return {
      groupId: form.groupId,
      title: form.title.trim(),
      titleZh: form.titleZh.trim(),
      aliases: form.aliases.trim(),
      releasedOn: form.releasedOn || "",
      kind: form.kind || "album",
    };
  }
  return {
    releaseId: form.releaseId,
    memberId: form.memberId || undefined,
    version: form.version.trim(),
    name: form.name.trim() || undefined,
    mainImageUrl: form.mainImageUrl.trim() || null,
    isBenefit: form.isBenefit,
  };
}

function onSubmit() {
  emit("save", toPayload());
}

function close() {
  emit("update:show", false);
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    :title="title"
    :style="{ width: 'min(440px, calc(100vw - 24px))' }"
    :mask-closable="!submitting"
    @update:show="emit('update:show', $event)"
  >
    <n-form @submit.prevent="onSubmit">
      <template v-if="tab === 'groups'">
        <n-form-item label="slug" required>
          <n-input v-model:value="form.slug" :input-props="{ name: 'slug' }" />
        </n-form-item>
        <n-form-item label="中文名" required>
          <n-input v-model:value="form.nameZh" :input-props="{ name: 'nameZh' }" />
        </n-form-item>
        <n-form-item label="英文名" required>
          <n-input v-model:value="form.nameEn" :input-props="{ name: 'nameEn' }" />
        </n-form-item>
        <n-form-item label="韩文名">
          <n-input v-model:value="form.nameKo" />
        </n-form-item>
        <n-form-item label="别名">
          <n-input v-model:value="form.aliases" />
        </n-form-item>
        <n-form-item label="主题色">
          <n-input v-model:value="form.logoColor" />
        </n-form-item>
        <n-form-item label="范围说明">
          <n-input v-model:value="form.scopeNote" />
        </n-form-item>
        <n-form-item>
          <n-checkbox v-model:checked="form.isPilot">试点组合</n-checkbox>
        </n-form-item>
      </template>

      <template v-else-if="tab === 'members'">
        <n-form-item label="组合" required>
          <n-select v-model:value="form.groupId" :options="groupOptions" />
        </n-form-item>
        <n-form-item label="英文名" required>
          <n-input v-model:value="form.nameEn" :input-props="{ name: 'nameEn' }" />
        </n-form-item>
        <n-form-item label="中文名" required>
          <n-input v-model:value="form.nameZh" :input-props="{ name: 'nameZh' }" />
        </n-form-item>
        <n-form-item label="韩文名">
          <n-input v-model:value="form.nameKo" />
        </n-form-item>
        <n-form-item label="别名">
          <n-input v-model:value="form.aliases" />
        </n-form-item>
        <n-form-item label="颜色">
          <n-input v-model:value="form.color" />
        </n-form-item>
        <n-form-item label="排序">
          <n-input-number v-model:value="form.sortOrder" :show-button="false" style="width: 100%" />
        </n-form-item>
      </template>

      <template v-else-if="tab === 'releases'">
        <n-form-item label="组合" required>
          <n-select v-model:value="form.groupId" :options="groupOptions" />
        </n-form-item>
        <n-form-item label="标题" required>
          <n-input v-model:value="form.title" :input-props="{ name: 'title' }" />
        </n-form-item>
        <n-form-item label="中文标题">
          <n-input v-model:value="form.titleZh" />
        </n-form-item>
        <n-form-item label="别名">
          <n-input v-model:value="form.aliases" />
        </n-form-item>
        <n-form-item label="发行日" required>
          <n-date-picker
            v-model:formatted-value="form.releasedOn"
            type="date"
            value-format="yyyy-MM-dd"
            style="width: 100%"
          />
        </n-form-item>
        <n-form-item label="类型">
          <n-select v-model:value="form.kind" :options="RELEASE_KINDS" />
        </n-form-item>
      </template>

      <template v-else>
        <n-form-item label="发行" required>
          <n-select v-model:value="form.releaseId" :options="releaseOptions" />
        </n-form-item>
        <n-form-item label="成员">
          <n-select v-model:value="form.memberId" :options="memberOptions" />
        </n-form-item>
        <n-form-item label="版本" required>
          <n-input v-model:value="form.version" :input-props="{ name: 'version' }" />
        </n-form-item>
        <n-form-item label="名称">
          <n-input v-model:value="form.name" />
        </n-form-item>
        <n-form-item label="主图 URL">
          <n-input v-model:value="form.mainImageUrl" placeholder="/media/cards/xxx.png" />
        </n-form-item>
        <n-form-item>
          <n-checkbox v-model:checked="form.isBenefit">特典</n-checkbox>
        </n-form-item>
        <p v-if="dedupeKey" class="muted">去重键 {{ dedupeKey }}</p>
      </template>

      <n-space justify="end">
        <n-button :disabled="submitting" @click="close">取消</n-button>
        <n-button type="primary" attr-type="submit" :loading="submitting">
          {{ editing ? "保存" : "创建为草稿" }}
        </n-button>
      </n-space>
    </n-form>
  </n-modal>
</template>

<style scoped>
.muted {
  color: var(--color-text-secondary);
  font-size: 13px;
  margin: 0 0 12px;
}
</style>
