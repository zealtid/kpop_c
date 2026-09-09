# 星卡

星卡是微信小程序小卡图鉴（M1）。仓库路径：[`github.com/zealtid/kpop_c`](https://github.com/zealtid/kpop_c)。

本阶段 **只有小程序客户端**，没有 Web App。后端是 Node.js + PostgreSQL。

首个落地切片：**schema + mock 微信登录 + H2H / BTS《ARIRANG》种子图鉴 + 拥有/想要/进度 + 卡册长图**。Path B（搜专辑 → 多选拥有 → 进度更新）可在 API 测试中一次性跑通。

## 硬约束（Scope freeze）

- Tab：情报 | 卡册 | 图鉴 | 我的；启动默认落在 **卡册**。
- **情报** 仅占位，没有假信息流 / 日程。
- 试点：Hearts2Hearts（深）+ BTS 切片专辑《ARIRANG》（2026-03-20）。
- 可见性只有 `private | public`，无私友 UI，无单卡可见性开关。分享长图包含该组 **全部已拥有** 卡片。
- 拥有会自动去掉想要；已拥有再点想要 → HTTP **200** + 业务码 `OWN_WANT_MUTEX` Toast 互斥且 **不写入**；取消拥有 **不会** 加回想要。
- 进度 = `owned_distinct / count(范围内已发布模板)`，**含特典、不含已废弃**。BTS 脚注固定：「当前图鉴仅含《ARIRANG》切片」。卡册页展示口径说明。
- `UserCard` 唯一键 `(user_id, template_id)`；`quantity ≥ 1`；撤销 = **DELETE 行**（禁止 qty=0）。
- 缺卡反馈 **仅文字**。
- **P7**：卡册总览无搜索（搜索在图鉴）。
- **P8**：分享长图必须拼完所有已拥有卡，禁止截成前 N 张。
- 本阶段不做：真·信息流、订阅消息、交易开关、缺卡清单页、投稿审核、好友、AI。

## 本地运行

```bash
# PostgreSQL 16，库 kpop_c / 用户 kpop / 密码 kpop
# 或：docker compose up postgres
cp .env.example .env
npm install
npm run migrate
npm run seed          # H2H 样品 + BTS ARIRANG 切片 + 占位卡图
npm run dev           # API :3000，启动时默认会再跑一遍幂等 seed
npm test              # 对 kpop_c_test 跑 M1 行为测试（含 Path B）
```

也可用 `docker compose up --build` 拉起 postgres + API。

微信开发者工具打开仓库根目录（`project.config.json` 的 `miniprogramRoot` 指向 `miniprogram/`）。关闭「不校验合法域名」。默认 API：`http://127.0.0.1:3000`（改 `miniprogram/utils/config.js`）。

真机请把 `PUBLIC_BASE_URL` 和 `API_BASE` 换成已配置的 HTTPS。

## 微信登录（真机接入）

非生产或未配置密钥时，`POST /auth/wx-login { "code": "任意或 mock:openid" }` 走本地 mock，不请求微信。

生产接入：

1. 小程序后台拿到 `AppID` / `AppSecret`。
2. 环境变量设置 `WX_APPID`、`WX_SECRET`，`NODE_ENV=production`。
3. 小程序 `wx.login()` 的 `code` 原样 POST 到 `/auth/wx-login`。
4. 服务端调用 `https://api.weixin.qq.com/sns/jscode2session` 换 `openid`，签发 JWT。

## Path B（验收主路径）

图鉴搜索 `ARIRANG` → 多选模板 → `POST /collection/cards/batch` → `GET /collection/groups/bts/progress` 的 `ownedDistinct` 增加。卡册总览圆环同步更新。

## 接受度 ID 对照

| ID | 行为 | 屏幕 / 接口 |
| --- | --- | --- |
| **T01** | 四个 Tab：情报 / 卡册 / 图鉴 / 我的 | `miniprogram/app.json` tabBar |
| **T02** | 默认落地卡册 | `pages` 首项 `pages/cardbook/index` |
| **A01** | 游客可读图鉴 | `GET /catalog/groups` 等，无需 token |
| **A02** | 未登录写操作 401 | collection / share / feedback / follows |
| **A03** | 微信登录（非生产可 mock） | `POST /auth/wx-login`；小程序 `app.js` |
| **A04** | 当前用户 | `GET /me` |
| **A05** | 关注组合 | `PUT/GET /me/follows`；我的页 |
| **C01** | 组合 / 成员 / 发行 | `GET /catalog/groups/:id` |
| **C02** | 图鉴搜索 | `GET /catalog/search?q=`；图鉴页 |
| **C03** | 空搜埋点 `catalog_search` empty | 同上 |
| **C04** | 模板含特典 | seed + `isBenefit` |
| **O01** | 卡册总览组合卡 + 进度环，无搜索（P7） | `GET /collection/overview` `searchEnabled=false`；卡册页 |
| **O02** | 组详情 拥有 \| 想要 \| 重复 | `GET /collection/groups/:id`；`pages/cardbook-group` |
| **O03** | 拥有自动移除想要 | `POST /collection/cards` |
| **O04** | 已拥有点想要 → Toast，不写库 | `200` + 业务码 `OWN_WANT_MUTEX`（非 HTTP 409） |
| **O05** | 取消拥有不加回想要 | `DELETE /collection/cards/:id` `wantRestored=false` |
| **O06** | 唯一 (user, template)；qty≥1 | `user_cards` 约束 |
| **O07** | 撤销 DELETE 行 | 同上 |
| **O08** | 批量拥有 | `POST /collection/cards/batch` |
| **O09** | 进度口径 + BTS 脚注 + 卡册说明 | overview / progress / 卡册文案 |
| **S01** | 长图品牌头 + 进度 + 三列 **全部** 已拥有卡（P8） | `POST /share/image` |
| **S02** | 强制底栏小程序码 + 水印 | 同上 `hasQr` `hasWatermark` |
| **S03** | 保存到相册 | `pages/share-preview` |
| **F01** | 缺卡反馈仅文字 | `POST /feedback/missing`；拒绝 `image` |
| **X01** | 可见性仅 private/public；无私友；无单卡可见性 | `PATCH /me`；无 `/friends` |
| **D01** | 管理 draft ↔ published | `POST /admin/templates/:id/publish\|unpublish` |
| **D02** | 导入按 `dedupe_key` 去重 | `POST /admin/import` |
| **D03** | 无主图不可发布 | `400 IMAGE_REQUIRED` |

## API 一览

| 职责 | 方法 / 路径 |
| --- | --- |
| 登录 / 我 | `POST /auth/wx-login` `GET\|PATCH /me` |
| 关注 | `GET\|PUT /me/follows` |
| 图鉴 | `GET /catalog/groups` `.../members` `.../releases` `GET /catalog/releases/:id/templates` `GET /catalog/search` `GET /catalog/templates` |
| 卡册 | `GET /collection/overview` `GET /collection/groups/:id` `.../progress` |
| 拥有 | `POST /collection/cards` `POST /collection/cards/batch` `PATCH\|DELETE /collection/cards/:templateId` |
| 想要 | `GET\|POST /collection/wants` `DELETE /collection/wants/:templateId`；已拥有再 POST 返回 `200` `{ code: "OWN_WANT_MUTEX", message, wanted: false }`，不写库 |
| 分享 | `POST /share/image` → `{ url, cardCount, templateIds, truncated:false }` |
| 反馈 | `POST /feedback/missing` `{ text }` |
| 管理 | `POST /admin/import` `POST /admin/templates` `POST /admin/templates/:id/publish\|unpublish` Header `x-admin-token` |
| 埋点 | `POST /analytics/events`；服务端也会在业务路径自动打点 |

管理默认令牌：`ADMIN_TOKEN=dev-admin`。

## 埋点

`login_success` / `login_fail` / `follow_set` / `catalog_search`（含 empty）/ `card_own_add`（`n`、`batch`）/ `card_own_remove` / `card_want_add` / `card_want_remove` / `share_cardbook_save` / `missing_feedback_submit` / `tab_view`

## 种子图鉴

- **Hearts2Hearts**：The Chase（2025-02-24）、FOCUS（2025-10-20）、Lemon Tang（2026-06-22）；8 成员 × 多版本（含特典）。另有一张已废弃误印（不计入进度）和一张无主图 draft（供 D03）。
- **BTS**：仅《ARIRANG》2026-03-20；7 成员 × Standard / 特典-Weverse / 特典-JP。

占位卡图由 seed 生成到 `api/data/cards/`。

## 目录

```
api/                 Express + pg + sharp 分享长图
  migrations/        PostgreSQL
  src/               路由与领域逻辑
  tests/m1.test.ts   Path B 与 M1 约束
miniprogram/         微信小程序
project.config.json  微信开发者工具打开仓库根目录用
docker-compose.yml
```

## 明确不做（M1 之外）

真·情报流、订阅消息、交易、缺卡清单页、投稿审核、好友关系、AI、Web 客户端。
