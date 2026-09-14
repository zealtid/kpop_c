# UGC-1 可研发设计包 — 单卡投稿 + 审核台（用户自研）

> 产品：**星卡** · 仓库：`zealtid/kpop_c`（以仓内最新 `main` 为准）  
> 上位：`ugc-1-scope-freeze.md`（**已确认**）· `ugc-catalog-direction-plan.md`  
> 状态：**设计已审通过 · 用户自研**（2026-09-14 · 项目总监）· **云端研发闸不开**；本地开发完成后找**项目总监发版**  
> 平台：微信小程序 + API + Admin Vue（Naive）；H5 / 宫格 / 备份演练 **不做**  
> 发版约定：PR 自检 U1-01…12 后 @项目总监 → squash 合入 + Railway 部署

---

## 0. 合入与协作

| 项 | 口径 |
|----|------|
| 谁写代码 | **你本人**（本机 / Cursor） |
| 谁发版 | **项目总监**（审 PR → squash → Railway） |
| 分支建议 | `ugc-1-submission-review`（或你习惯命名） |
| 基线 | 当前生产 `main`（Admin B0–B3 + 小程序 M1/M1.5 已在） |
| 回滚 | git revert；对象存储清图逻辑需可幂等重跑 |

---

## 1. 一句话实现目标

白名单团体内：用户短路径提交单卡（卡面必、卡背选）→ `pending_review` → Admin 通过后创建/合并 `PhotocardTemplate`（去重一份；主图仅审过可换）→ 驳回删待审图。私人加卡可仅私人保存，或页内「申请入库」进**同一套提交 UI / API**。

---

## 2. 数据模型

### 2.1 `artist_groups`（或现网 Group 表）增补

| 字段 | 类型 | 说明 |
|------|------|------|
| `ugc_open` | boolean NOT NULL DEFAULT false | **Q4**：运营 Admin 维护；false 则 C 端不可提交入库 |

迁移：新增列 + 可选把试点/W1 团先置 true（OQ2；也可全 false 由运营点开）。

### 2.2 新表 `catalog_submissions`（名称可跟仓内风格微调）

对应冻结 F-D2；**不要**用私人 `UserCustomCard` 假扮 Template。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid/text PK | |
| `user_id` | FK | 投稿人 |
| `group_id` | FK | 必须 ∈ `ugc_open` |
| `release_id` | FK? | 专辑 |
| `member_id` | FK? | |
| `version_label` | text? | 对接 Release.versions |
| `slot_label` / `name` | text | 卡位/名称 |
| `channel_code` / 特典相关 | text? | 有刀 A 则尽量对齐；无则选填 |
| `image_front` | text NOT NULL | 待审桶路径（压缩后） |
| `image_back` | text? | **选填（Q1）** |
| `image_front_thumb` / `image_back_thumb` | text? | 缩略图 |
| `phash_front` | text? | 近 dup / 去重 |
| `status` | enum | `pending_review` / `approved` / `rejected` |
| `reject_reason` | text? | 投稿人可见 |
| `source` | enum | `direct_submit` / `from_custom_card` |
| `custom_card_id` | FK? | 私人卡申请入库时回链（可空） |
| `duplicate_of_template_id` | FK? | 近 dup 候选（可空，审核可改） |
| `reviewer_id` | text? | ops |
| `reviewed_at` | timestamptz? | |
| `result_template_id` | FK? | 通过后写入 |
| `created_at` / `updated_at` | | |
| `agreement_accepted_at` | timestamptz? | 协议勾选时间（建议） |
| 审计 | json? | 不含原图；驳回后图已删仍可留元数据 |

索引：`(status, created_at)`、`(group_id, status)`、`(user_id, created_at)`、`phash_front`。

### 2.3 `photocard_templates` 行为（通过时）

- `created_by`：建议 `user_submission`（若现网枚举只有 ops，则扩枚举或 `source_note`）  
- `status`：通过即 `published`（UGC-1：**先审后发**，通过才公开）；无图不得 published（沿用 B1 门禁）  
- `image_official` / `image_back`：从待审桶**拷贝或移动**到公共模板桶后再删待审对象（或同桶改 ACL/前缀）  
- **去重（F-D1）**：指纹近 + 业务键（group + release + version + slot/name）命中 → **合并**到已有 Template，不新建第二份 published  
- **主图（Q3）**：合并默认**保留**原 `image_official`；仅当审核请求体 `adopt_submission_image=true` 才替换

### 2.4 与 M1.5 `UserCustomCard`（或现网私人表）

| 场景 | 行为 |
|------|------|
| 仅私人保存 | 不变 |
| 「申请入库」 | 校验字段齐 → 建 `catalog_submissions`（`source=from_custom_card`）→ 待审图进**待审桶**（可从私人图复制一份，勿直接把私人路径当公开） |
| 入库驳回（OQ1） | **保留**私人卡；**删除**待审副本图 |
| 私人机器违规驳回 | 仍按 M1.5 清私人违规图 |

### 2.5 对象存储分桶（F-D8）

| 前缀/桶 | 用途 | 生命周期 |
|---------|------|----------|
| `ugc-pending/` | 待审正/背/缩略图 | 驳回/违规：**删除**（OQ4 ≤24h，争取小时级） |
| 现网公共模板媒体 | published 主图 | 长期；备份后置 UGC-3 |
| 现网私人卡桶 | M1.5 | 与 pending 隔离 |

---

## 3. API 契约（草表 · 路径可按仓内风格微调，语义勿漂）

鉴权：C 端用户 JWT；Admin `ADMIN_TOKEN` / 现网 ops 方式。

### 3.1 C 端

| 方法 | 路径语义 | 说明 |
|------|----------|------|
| GET | `/catalog/groups?ugc_open=1` 或字段带回 | **提交流程团列表只出 `ugc_open=true`**；提交接口仍强校验 |
| POST | `/media/ugc-pending`（或复用现网上传签） | 上传压缩图 → 返回 pending 路径；过机审 |
| POST | `/catalog/submissions` | body：group/release/member/version/slot、front、back?、协议勾选、optional custom_card_id |
| GET | `/me/catalog-submissions` | 投稿人站内列表：pending/approved/rejected（**无订阅** Q5） |
| GET | `/me/catalog-submissions/:id` | 详情 + reject_reason |
| POST | `/me/custom-cards/:id/apply-catalog` | **Q6**：私人页入口；内部转同一 create submission |

**校验：**

- `group.ugc_open === true`（U1-01）  
- `image_front` 必填；`image_back` 可空（U1-02）  
- 未勾选协议 → 400  
- 非本人 custom_card → 403  

**机审拒绝：** 删除的是 **pending 副本**；`from_custom_card` 时 **不删**私人卡（对齐 OQ1）。仅私人源图本身违规才走 M1.5 清私人图。

**近 dup / 清晰度（F-R3/R4）：** 可在 POST 响应带 `warnings: [{code, message}]`，默认不阻断；极端模糊可 400。

### 3.2 Admin

| 方法 | 路径语义 | 说明 |
|------|----------|------|
| GET/PATCH | `/admin/groups/:id` 含 `ugc_open` | 白名单维护（也可独立 PUT `/admin/groups/:id/ugc-open`） |
| GET | `/admin/catalog-submissions` | 筛 status/group/release；待审优先 |
| GET | `/admin/catalog-submissions/:id` | 含图、指纹候选模板列表 |
| POST | `/admin/catalog-submissions/:id/approve` | body：`{ patch字段?, merge_template_id?, adopt_submission_image?: bool }` |
| POST | `/admin/catalog-submissions/:id/reject` | body：`{ reason }` → 状态 rejected + **删 pending 图** |
| POST | `/admin/templates/:id/unpublish` 或现网下架 | 举报/强制下架（F-A8）；跟现网能力拼接 |

**approve 语义：**

1. 应用审核员改的业务字段  
2. 若 `merge_template_id` 或指纹命中策略选定目标 → 合并；否则 create Template  
3. `adopt_submission_image` 默认 false（Q3）  
4. 移动/拷贝图到公共；submission → `approved` + `result_template_id`  
5. **必做（F-C5）**：通过后给投稿人挂「拥有」指向该 Template（已有则增量/幂等）；勿默认甩二期

---

## 4. 小程序 UI

### 4.1 页面/组件

| 表面 | 说明 |
|------|------|
| 投稿入口 | 图鉴或「我的」入口进「投稿图鉴」 |
| **统一流程页** `pages/catalog-submit/*` | 团（**仅白名单**）→ 专/版本·特典 → 卡面 → 卡背(可跳过) → 协议 → 提交 |
| 私人加卡页 | 保留「仅保存」；增加「申请入库」→ **navigate 同一流程页**（预填图与 group 等） |
| 「我的投稿」 | 列表看 pending/通过/驳回；点进看原因 |

### 4.2 交互要点

- 压缩：选图后客户端压缩再传（或服务端再压）；出缩略图  
- 翻转：图鉴详情有背图时可翻（可复用现有组件）  
- 进度：仅站内（Q5）  
- Out：无宫格整页、无 H5

---

## 5. Admin UI（Vue3 + Naive，挂现壳）

| 路由建议 | 能力 |
|----------|------|
| `#/catalog/ugc-whitelist` 或 Group 表单加开关 | 维护 `ugc_open`（Q4） |
| `#/catalog/submissions` | 队列：待审优先；筛团/专；窄屏卡片 |
| `#/catalog/submissions/:id` | 正/背预览；疑似模板对照；改字段；通过（可选「采用本稿主图」勾选）；驳回+原因 |

权限：现 ops allowlist。移动端：列表→详情→通过/驳回主路径可走完。

---

## 6. 状态机

```
[私人仅保存]
    --申请入库--> pending_review --approve--> Template published/合并
                       |
                       +--reject--> 删待审图（可留私人卡）

直投稿 ----------------------> pending_review → 同上

机审违规 -------------------> rejected + 清相关 pending 图
```

- `pending_review`：他人不可见；**不进**完成度分母（Q2）  
- 通过后：公开图鉴可见；完成度按 M1 `published` 口径  

---

## 7. 任务切片（建议实现顺序）

| ID | 任务 | 依赖 |
|----|------|------|
| T1 | 迁移：`ugc_open` + `catalog_submissions` + 索引 | — |
| T2 | 媒体：pending 上传 + 压缩 + 机审挂钩 | T1 |
| T3 | C API：create/list/get submission + 白名单校验 | T2 |
| T4 | 小程序：统一提交流程页 + 我的投稿 | T3 |
| T5 | Q6：私人加卡「申请入库」预填合流 | T4 |
| T6 | Admin：白名单开关 + 队列/详情 | T1 |
| T7 | Admin：approve/reject + 去重合并 + 主图勾选 + 清图 | T2 T6 |
| T8 | 近 dup / 清晰度 warning；**通过后挂拥有（必做）** | T3 T7 |
| T9 | 下架/举报拼接；回归 Out 探活 | T7 |

---

## 8. 验收（对齐冻结 U1-01…12）

| ID | 期望 |
|----|------|
| U1-01 | 非白名单团无法提交入库申请 |
| U1-02 | 短路径可提交：卡面必填、卡背可跳过 |
| U1-03 | 提交后站内见「待审」；无订阅消息 |
| U1-04 | 待审不进公开图鉴、不进完成度分母 |
| U1-05 | 审核通过：新模板或合并；图鉴可见 |
| U1-06 | 审核驳回：待审图删除；原因投稿人可见 |
| U1-07 | 合并默认不覆盖主图；勾选「采用本稿」且通过后才换 |
| U1-08 | 私人加卡可仅私人保存；「申请入库」进同一流程 UI |
| U1-09 | 近 dup / 清晰度有提示；压缩后上传 |
| U1-10 | Admin：白名单 + 队列通过/驳回/改字段 |
| U1-11 | 举报或强制下架可用（已通过模板） |
| U1-12 | 无宫格整页、无 H5 业务壳、无交易入口 |

---

## 9. Out（本包禁止捎带）

宫格 4/9、H5 壳、备份演练、贡献徽章、订阅消息、交易/可出可换、缺卡 C 端清单、大模型识卡、未审进完成度、改 Group/Member 主数据写权限。

---

## 10. 风险

| 项 | 注意 |
|----|------|
| 私人路径误公开 | 申请入库必须复制到 pending，禁止直接 publish 私人 URL |
| 去重误合并 | 审核员可改 merge 目标；近 dup 仅提示 |
| 清图失败 | reject 事务外补偿任务；可幂等删 |
| 完成度污染 | 严格仅 `published` |
| 与 OPS-3 工单 | 本包不强制互链（UGC-2） |

---

## 11. 发版时交给项目总监

1. PR 链接 + 自检 U1-01…12 结果（可用勾选）  
2. 迁移编号与是否需跑数据（哪些团已 `ugc_open`）  
3. 环境变量/桶配置变更说明  
4. 回滚注意点（尤其 pending 清图任务）

---

*设计包供你自研。路径/表名以仓内惯例为准，语义以本文件 + `ugc-1-scope-freeze.md` 为准。做完找项目总监发版。*

---

## 12. 需求分析师对照旁注（2026-09-14 · 已由总监吸收进正文）

对照 `ugc-1-scope-freeze.md`：**无硬伤**（Q1–Q6 / OQ1–4 / U1-01…12 / Out 对齐）。

补丁级建议（可选吸收，不挡自研）：

1. **F-C5 挂拥有**：§3.2 写「成本高可二期」偏软；冻结 In 建议通过后挂拥有——请把 **T8 自动挂拥有（或至少一键挂拥有）标为 UGC-1 建议必做**，勿默认甩二期。  
2. **白名单 UX**：§3.1 允许「全量团 + 提交时校验」；为少踩 U1-01，**提交流程团选择建议只列 `ugc_open=true`**。  
3. **机审拒 pending**：请显式一句——拒的是 pending 副本；`from_custom_card` 时 **不删**私人卡（与 OQ1 同向）；仅私人源图本身违规才走 M1.5 清私人图。  
4. **协议审计**：校验有协议勾选即可；表结构可补 `agreement_accepted_at`（非硬性）。

云端研发闸仍不开。

---

## 13. 总监审阅（2026-09-14）

**结论：设计包通过，可供自研。** BA §12 四条补丁已吸收进正文（F-C5 必做、团列表仅白名单、机审清 pending 不误伤私人卡、`agreement_accepted_at` 建议字段）。云端研发闸仍不开；发版找项目总监。
