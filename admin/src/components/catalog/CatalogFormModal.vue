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
import MediaUploadField from "./MediaUploadField.vue";

export type CatalogFormModel = {
  slug: string;
  nameZh: string;
  nameEn: string;
  nameKo: string;
  aliases: string;
  logoColor: string;
  logoUrl: string;
  scopeNote: string;
  isPilot: boolean;
  ugcOpen: boolean;
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
  imageBack: string;
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
  defaultReleaseId?: string;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
  save: [payload: Record<string, unknown>, publish?: boolean];
}>();

function emptyForm(): CatalogFormModel {
  return {
    slug: "",
    nameZh: "",
    nameEn: "",
    nameKo: "",
    aliases: "",
    logoColor: "#ff6b9d",
    logoUrl: "",
    scopeNote: "",
    isPilot: true,
    ugcOpen: false,
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
    imageBack: "",
    isBenefit: false,
  };
}

const form = reactive<CatalogFormModel>(emptyForm());

const title = computed(() => {
  const editing = !!props.editing;
  if (props.tab === "groups") return editing ? "编辑组合" : "新建组合";
  if (props.tab === "members") return editing ? "编辑成员" : "新建成员";
  if (props.tab === "releases") return editing ? "编辑发行" : "新建发行";
  return editing ? "维护小卡" : "维护小卡 · 新建";
});

const hasMainImage = computed(() => !!form.mainImageUrl.trim());

const modalStyle = computed(() => ({
  width: props.tab === "templates" ? "min(680px, calc(100vw - 24px))" : "min(520px, calc(100vw - 24px))",
}));

const groupOptions = computed(() =>
  props.groups.map((g) => ({ label: `${g.nameZh} (${g.slug})`, value: g.id })),
);

const releaseOptions = computed(() =>
  props.releases.map((r) => ({ label: `${r.groupNameZh || ""} · ${r.title}`, value: r.id })),
);

const memberOptions = computed(() => {
  const release = props.releases.find((r) => r.id === form.releaseId);
  const members = release ? props.members.filter((m) => m.groupId === release.groupId) : props.members;
  return [
    { label: "（组合卡 / 无成员）", value: "" },
    ...members.map((m) => ({ label: `${m.groupNameZh || ""} · ${m.nameEn}`, value: m.id })),
  ];
});

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
    if (props.tab === "templates") {
      next.releaseId = props.defaultReleaseId || props.releases[0]?.id || "";
    }
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
      logoUrl: g.iconUrl || g.logoUrl || "",
      scopeNote: g.scopeNote || "",
      isPilot: g.isPilot !== false,
      ugcOpen: !!g.ugcOpen,
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
    imageBack: t.imageBack || "",
    isBenefit: !!t.isBenefit,
  });
}

watch(
  () => [props.show, props.tab, props.editing?.id],
  () => {
    if (props.show) hydrate();
  },
);

watch(
  () => form.releaseId,
  () => {
    if (props.tab !== "templates" || !props.show) return;
    if (!form.memberId) return;
    if (!memberOptions.value.some((opt) => opt.value === form.memberId)) {
      form.memberId = "";
    }
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
      iconUrl: form.logoUrl.trim() || null,
      logoUrl: form.logoUrl.trim() || null,
      scopeNote: form.scopeNote.trim(),
      isPilot: form.isPilot,
      ugcOpen: form.ugcOpen,
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
    imageBack: form.imageBack.trim() || null,
    isBenefit: form.isBenefit,
  };
}

function onSubmit(publish = false) {
  emit("save", toPayload(), publish);
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
    :style="modalStyle"
    :mask-closable="!submitting"
    @update:show="emit('update:show', $event)"
  >
    <n-form @submit.prevent="onSubmit(false)">
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
        <n-form-item label="团图标">
          <MediaUploadField v-model="form.logoUrl" kind="logos" compact placeholder="/media/logos/xxx.png" />
        </n-form-item>
        <n-form-item label="范围说明">
          <n-input v-model:value="form.scopeNote" />
        </n-form-item>
        <n-form-item>
          <n-checkbox v-model:checked="form.isPilot">试点组合</n-checkbox>
        </n-form-item>
        <n-form-item>
          <n-checkbox v-model:checked="form.ugcOpen">开放 UGC 投稿</n-checkbox>
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
        <p class="muted">
          官方图鉴小卡：先选发行/版本，再上传正面主图（发布必填）与卡背（可选）。图片走现有
          <code>/media/cards</code> 上传。无主图不能发布。
        </p>
        <div class="card-faces">
          <div class="face">
            <div class="face-label">正面主图（必填才能发布 · 2:3）</div>
            <MediaUploadField v-model="form.mainImageUrl" kind="cards" placeholder="/media/cards/xxx.png" />
          </div>
          <div class="face">
            <div class="face-label">卡背（可选 · 2:3）</div>
            <MediaUploadField v-model="form.imageBack" kind="cards" placeholder="/media/cards/xxx-back.png" />
          </div>
        </div>
        <n-form-item label="发行" required>
          <n-select v-model:value="form.releaseId" :options="releaseOptions" filterable />
        </n-form-item>
        <p v-if="!releaseOptions.length" class="muted">请先在「发行」页创建并发布一条发行，再上传小卡。</p>
        <n-form-item label="成员">
          <n-select v-model:value="form.memberId" :options="memberOptions" filterable />
        </n-form-item>
        <n-form-item label="版本" required>
          <n-input v-model:value="form.version" :input-props="{ name: 'version' }" />
        </n-form-item>
        <n-form-item label="名称">
          <n-input v-model:value="form.name" />
        </n-form-item>
        <n-form-item>
          <n-checkbox v-model:checked="form.isBenefit">特典</n-checkbox>
        </n-form-item>
        <p v-if="dedupeKey" class="muted">去重键 {{ dedupeKey }}</p>
      </template>

      <n-space justify="end">
        <n-button :disabled="submitting" @click="close">取消</n-button>
        <n-button type="primary" attr-type="submit" :loading="submitting">
          {{ editing ? "保存" : "保存草稿" }}
        </n-button>
        <n-button
          v-if="tab === 'templates'"
          type="success"
          attr-type="button"
          :disabled="!hasMainImage"
          :loading="submitting"
          @click="onSubmit(true)"
        >
          保存并发布
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
.muted code {
  font-size: 12px;
}
.card-faces {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.face {
  flex: 0 0 auto;
}
.face-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}
</style>
