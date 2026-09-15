# P3 OPS 增长切片 — 用户管理 + 贡献积分（可研发清单）

> 产品：**星卡** · 仓库：`zealtid/kpop_c`  
> 上位：Notion P3 #8 用户管理 / #9 积分；`p3-ops-growth-build-checklist.md`（本文件）  
> 状态：**总监已审 · OQ 默认已拍板**（2026-09-15）  
> 平台：现有 Admin Vue（ops 壳）+ API + 小程序「我的」只读；**无**第二套后台  
> 发版约定：PR 自检 P3-01…06 后 @项目总监 → squash 合入 + Railway 部署

---

## 0. 一句话

运营在现有 Admin 里查看 C 端用户与投稿历史；图鉴投稿 **首次审核通过** 记 **+1** 贡献积分（合并已有模板同样记分）；驳回为 0；历史已通过记录 **不回填**。不做商城 / 支付 / 封禁。

---

## 1. 总监拍板的 OQ 默认值

| ID | 结论 | 实现口径 |
|----|------|----------|
| **OQ-P3-1** | 每条投稿 **首次通过 +1** | `DEFAULT_POINTS_PER_APPROVED_CARD = 1`；可用 `CONTRIBUTION_POINTS_PER_APPROVED_CARD` 覆盖 |
| **OQ-P3-2** | **不回填** 历史已通过投稿 | 迁移只加列/表，默认 0；上线后新通过的才记分 |
| **OQ-P3-3** | **合并已有模板** 的通过 **同样记分** | `approveSubmission` 在 create **与** merge 两条路径都调用记分 |
| 幂等 | 按 `submission_id` | `contribution_point_events.UNIQUE(submission_id)`；重复通过不叠分 |
| 驳回 | **0 分** | `rejectSubmission` 不写流水；`points_awarded` 保持 0 |

---

## 2. In

### 2.1 Admin 用户（#8）

- 列表：现有 `users` 字段（id、nickname、avatar、createdAt、privacy）+ 关注组合 + 投稿计数 + 贡献积分
- 详情下钻：该用户 `catalog_submissions`（只读上传/投稿历史）
- 鉴权：现有 ops JWT / `x-admin-token`；菜单挂在现有 AppShell

### 2.2 贡献积分（#9，非支付）

- 通过 → +1（OQ-P3-1）；合并也 +1（OQ-P3-3）
- 驳回 → 0
- Admin 用户页展示；小程序「我的」只读 `GET /me.contributionPoints`

---

## 3. Out（本包禁止）

商城、现金、会员、广告、提现、封禁系统、UGC-2b 宫格、第二套 Admin 壳。

---

## 4. 数据

| 对象 | 说明 |
|------|------|
| `users.contribution_points` | 累计；默认 0；**不** backfill |
| `catalog_submissions.points_awarded` | 本条首次通过实记分数；存量 approved 保持 0 |
| `contribution_point_events` | 流水；`UNIQUE(submission_id)` |

迁移：`api/migrations/014_contribution_points.sql`

---

## 5. 验收 P3-01…06

| ID | 期望 |
|----|------|
| **P3-01** | Admin **用户**列表可读现有 schema 字段（id / 昵称 / 头像 / 关注 / createdAt 等） |
| **P3-02** | 可下钻该用户图鉴投稿 / 上传历史（只读） |
| **P3-03** | 复用 ops 鉴权与现有 Admin 壳；无第二套后台 |
| **P3-04** | OQ-P3-1：投稿 **首次通过 +1**；按 `submission_id` 幂等，不叠分 |
| **P3-05** | 驳回 = 0；OQ-P3-2 **不回填** 历史已通过投稿 |
| **P3-06** | OQ-P3-3 合并已有模板的通过同样记分；Admin 用户页 + 「我的」只读展示；无商城/支付/封禁 |

---

## 6. 发版时交给项目总监

1. PR 链接 + 自检 P3-01…06  
2. 迁移 `014_contribution_points.sql`（无历史回填）  
3. 可选环境变量 `CONTRIBUTION_POINTS_PER_APPROVED_CARD`（默认 1）  
4. 回滚：drop 新表/列；已记分用户需人工核对（本切片无支付，可接受）
