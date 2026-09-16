# 星卡

星卡是微信小程序小卡图鉴。仓库路径：[`github.com/zealtid/kpop_c`](https://github.com/zealtid/kpop_c)。

C 端主路径是微信小程序；另有只读 **H5**（`h5/`，UGC-2a / H5-1 分享落地 + 微信内图鉴浏览）和独立 **Web 运营后台**（`admin/`）。后端是 Node.js + PostgreSQL。

首个落地切片：**schema + mock 微信登录 + H2H / BTS《ARIRANG》种子图鉴 + 拥有/想要/进度 + 卡册长图**。Path B（搜专辑 → 多选拥有 → 进度更新）可在 API 测试中一次性跑通。

## 硬约束（Scope freeze）

- Tab：卡册 | 图鉴 | 我的；启动默认落在 **卡册**（`pages[0]` 仍是卡册）。情报底栏入口按 UX-B / ME10 隐藏（页面文件保留，深链回卡册）。
- **情报** 页仍接 M2 Feed / 日程 API（关注时间线 + 今日日程 + 详情）；无订阅消息、无爬虫 UI、无缺卡入口；无设置/实验室入口。
- 试点：Hearts2Hearts（深）+ BTS 切片专辑《ARIRANG》（2026-03-20）。
- 可见性只有 `private | public`，无私友 UI，无单卡可见性开关。分享长图包含该组 **全部已拥有** 卡片。
- 拥有会自动去掉想要；已拥有再点想要 → HTTP **200** + 业务码 `OWN_WANT_MUTEX` Toast 互斥且 **不写入**；取消拥有 **不会** 加回想要。
- 进度 = `owned_distinct / count(范围内已发布模板)`，**含特典、不含已废弃**。BTS 脚注固定：「当前图鉴仅含《ARIRANG》切片」。卡册页展示口径说明。
- `UserCard` 唯一键 `(user_id, template_id)`；`quantity ≥ 1`；撤销 = **DELETE 行**（禁止 qty=0）。
- 缺卡反馈 **仅文字**。
- **P7**：卡册总览无搜索（搜索在图鉴）。
- **P8**：分享长图必须拼完所有已拥有卡，禁止截成前 N 张。
- 本阶段不做：订阅消息、交易开关、缺卡清单页、好友、端侧大模型、自动灌库文案。UGC-1 单卡投稿审核与 UGC-2b-VLM 宫格入册已开放（无私有-only、无 H5 宫格）。

## 本地运行

```bash
# PostgreSQL 16，库 kpop_c / 用户 kpop / 密码 kpop
# 或：docker compose up postgres
cp .env.example .env
npm install
npm run migrate
npm run seed          # H2H 样品 + BTS ARIRANG 切片 + 占位卡图
npm run dev           # API :3000，启动时默认会再跑一遍幂等 seed
npm run dev:admin     # 运营后台 Vite :5173（代理 /admin 到 API）
npm run dev:h5        # C 端 H5 Vite :5174（代理 /catalog /share /auth 到 API）
npm test              # 对 kpop_c_test 跑 M1 / M2-a / OPS / H5 行为测试
```

也可用 `docker compose up --build` 拉起 postgres + API。

微信开发者工具打开仓库根目录（`project.config.json` 的 `miniprogramRoot` 指向 `miniprogram/`）。关闭「不校验合法域名」。默认 API：`http://127.0.0.1:3000`（改 `miniprogram/utils/config.js`）。

真机请把 `PUBLIC_BASE_URL` 和 `API_BASE` 换成已配置的 HTTPS。

## 微信登录（真机接入）

本地 / 非生产：未配置 `WX_APPID`+`WX_SECRET` 时，`POST /auth/wx-login { "code": "任意或 mock:openid" }` 走 mock，不请求微信。也可显式设 `MOCK_WX_LOGIN=1`。**Mock 仅用于本地/开发，生产不要开。**

生产必须同时设置 `WX_APPID` 与 `WX_SECRET`（Railway 等）。缺任一密钥时登录与 `getPhoneNumber` 绑定返回 `WX_NOT_CONFIGURED`，**不会**再静默发明 `dev:` openid。H5 网页授权同理（`WX_WEB_APPID`+`WX_WEB_SECRET`）。

生产接入：

1. 小程序后台拿到 `AppID` / `AppSecret`。
2. 环境变量设置 `WX_APPID`、`WX_SECRET`，`NODE_ENV=production`。
3. 小程序 `wx.login()` 的 `code` 原样 POST 到 `/auth/wx-login`。
4. 服务端调用 `https://api.weixin.qq.com/sns/jscode2session` 换 `openid`，签发 JWT。

登录**不**使用手机号。绑定手机号走小程序 `button open-type="getPhoneNumber"`，把微信返回的 **phone code** POST 到 `/me/phone`；服务端调用 `wxa/business/getuserphonenumber` 换号落库。未绑定不挡使用。同一号全局唯一；支持换绑覆盖。上线前须确认小程序类目支持「手机号快速验证」组件。

## Path B（验收主路径）

图鉴搜索 `ARIRANG` → 多选模板 → `POST /collection/cards/batch` → `GET /collection/groups/bts/progress` 的 `ownedDistinct` 增加。卡册总览圆环同步更新。

## 接受度 ID 对照

| ID | 行为 | 屏幕 / 接口 |
| --- | --- | --- |
| **T01** | 三个 Tab：卡册 / 图鉴 / 我的（情报底栏已隐藏） | `miniprogram/app.json` tabBar |
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
| **A08** | 用户提交文字缺卡反馈 → Admin 出现待处理工单，可关联草稿模板 / 关闭 | `POST /feedback/missing`；`GET\|PATCH /admin/tickets` |

## API 一览

| 职责 | 方法 / 路径 |
| --- | --- |
| 登录 / 我 | `POST /auth/wx-login` `POST /auth/wx-web-login` `GET /auth/wx-web/start` `GET\|PATCH /me`（含只读 `contributionPoints`、脱敏 `phoneMasked` / `phoneBound`） `POST /me/phone`（微信 getPhoneNumber 的 `code`，服务端换号；非登录） |
| 关注 | `GET\|PUT /me/follows` |
| 图鉴 | `GET /catalog/groups`（`?ugc_open=1` 仅白名单） `.../members` `.../releases` `GET /catalog/releases/:id/templates` `GET /catalog/search` `GET /catalog/templates` |
| 投稿 | `POST /media/ugc-pending` `POST /catalog/submissions`（可选 `matchOwnIfDuplicate`：近 dup 则挂拥有、不建待审） `GET /me/catalog-submissions` `GET /me/catalog-submissions/:id` `POST /collection/custom-cards/:id/apply-catalog` `POST /catalog/templates/:id/report` `POST /catalog/grid/split`（主路径火山豆包视觉检测 bbox；`engine=jsfeat` 为 4/9 规则宫格回退） |
| 卡册 | `GET /collection/overview` `GET /collection/groups/:id` `.../progress` |
| 拥有 | `POST /collection/cards` `POST /collection/cards/batch` `PATCH\|DELETE /collection/cards/:templateId` |
| 想要 | `GET\|POST /collection/wants` `DELETE /collection/wants/:templateId`；已拥有再 POST 返回 `200` `{ code: "OWN_WANT_MUTEX", message, wanted: false }`，不写库 |
| 分享 | `POST /share/image` → `{ url, cardCount, templateIds, truncated:false }`；公开落地 `GET /share/landing` `GET /share/summary`（已发布摘要） |
| 反馈 | `POST /feedback/missing` `{ text }`（仅文字；不返回工单进度） |
| 管理 | `POST /admin/import` `POST /admin/import/validate` `GET /admin/completeness` `GET\|POST\|PATCH /admin/templates` `POST /admin/templates/:id/publish\|unpublish\|deprecate`；图鉴 CRUD `/admin/catalog/{groups,members,releases,templates}`（组合含 `ugcOpen`）；UGC 审核 `GET /admin/catalog-submissions` `POST .../approve\|reject`；用户 `GET /admin/users`（`q` 支持昵称 / UUID / **完整手机号精确匹配**，手机号查询限频） `GET /admin/users/:id` `GET /admin/users/:id/submissions` `GET /admin/users/:id/phone-events` `POST /admin/users/:id/reveal-phone`（写审计） `POST /admin/users/:id/hard-delete` `{ confirm }`（二次确认；无批量）；缺卡工单 `GET\|PATCH /admin/tickets` `POST /admin/tickets/:id/templates`；情报 `GET\|POST /admin/feed` `GET\|POST /admin/schedule`。鉴权：ops JWT / cookie，或 Header `x-admin-token` |
| OPS 登录 | `POST /admin/auth/login` `GET /admin/auth/me` `POST /admin/auth/logout` `GET /admin/audit` |
| 情报 | `GET /feed` `GET /feed/featured` `GET /feed/:id` |
| 日程 | `GET /schedule/today` `GET /schedule` `GET /schedule/:id`（`startAtShanghai` / Asia/Shanghai） |
| 埋点 | `POST /analytics/events`；服务端也会在业务路径自动打点 |

管理默认令牌：`ADMIN_TOKEN=dev-admin`（脚本 / 测试回退）。运营后台请用用户名密码会话，见下方 OPS-0。

## M2-b 情报页（小程序）

占位页换成真实情报。默认 Tab 仍是卡册。UX-B / ME10 起情报不再出现在底栏；页面保留，深链回卡册。外链用 **复制链接 / 系统打开**，不内嵌 web-view。

| 页面 | 路径 |
| --- | --- |
| 情报首页 | `miniprogram/pages/feed/index` |
| Feed 详情 | `miniprogram/pages/feed-detail/index` |
| 日程列表 | `miniprogram/pages/schedule/index` |
| 日程详情 | `miniprogram/pages/schedule-detail/index` |
| 展示辅助 | `miniprogram/utils/intel.js` |

| ID | 行为 | 覆盖 |
| --- | --- | --- |
| **F01/F02/F03** | 时间线展示 source / trust；L3·hidden 不出现；机翻标「机翻」 | Feed API + 客户端过滤 |
| **S01** | 今日日程横滑可见；门票开售红字倒计时 | `/schedule/today`；`startAtShanghai` |
| **T01** | 冷启动仍落卡册 | `app.json` `pages[0]=pages/cardbook/index` |
| **T02** | 未关注 → 空态去「我的」加关注，可「去看看精选」 | `/feed/featured`；游客走 L1 精选 |
| **X01** | 情报 Tab 无缺卡入口、无爬虫 UI、无订阅消息模板 | 页面源码约束 |

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
  tests/             M1 / M2-a / OPS-0 / OPS-1 / OPS-2 / OPS-3
admin/               独立 Web 运营后台（Vite：图鉴 CRUD + 投稿审核 + 用户/贡献积分 + 完整度 + 导入 + 缺卡工单 + 宫格识别统计 + 情报只读）
h5/                  C 端只读 H5（分享落地 + 微信内图鉴浏览；无投稿/交易）
miniprogram/         微信小程序
project.config.json  微信开发者工具打开仓库根目录用
docker-compose.yml
```

## M2.5 OPS-1 图鉴主数据 CRUD

在 OPS-0 登录壳上，图鉴页改为真实 CRUD。实体对齐现有表，不另建平行表。

**In**

- 组合 `idol_groups` / 成员 `members` / 发行 `releases` / 小卡模板 `templates`
- 状态机：`draft → published / deprecated`（模板废弃沿用 `is_deprecated`，C 端进度不含废弃）
- **无主图不能发布**（`400 IMAGE_REQUIRED`）
- 已发布去重键冲突拒绝（`409 DUPLICATE_PUBLISHED`）；`POST /admin/import` 仍按 `dedupe_key` upsert（D02）
- 发行 `kind=concert_md` 表示演唱会特典；**没有**图鉴 Event 表
- 创建 / 更新 / 状态变更写入 `admin_audit_logs`
- 鉴权：ops JWT（OPS-0）+ `x-admin-token` 脚本回退

**Out**

- OPS-2 完整度看板 / 导入产品化、OPS-3 缺卡工单、审核队列、爬虫、C 端大改

| ID | 行为 |
| --- | --- |
| **A02** | 草稿不出现在小程序图鉴 / 进度分母 |
| **A03** | 无主图发布失败 |
| **A04** | 发布后图鉴可见、进度计入 |
| **A05** | 相同 `dedupe_key` 的已发布重复创建被拒绝 |

`dedupe_key` = `{groupSlug}:{releaseTitle}:{memberEn\|group}:{version}`。

## M2.5 OPS-2 导入校验 + 完整度

在 OPS-1 CRUD 上补运营闭环：导入先校验再写库，完整度看板可读，BTS 切片约束可配置。

**In**

- CSV / Markdown / JSON 批量导入；`POST /admin/import/validate` 与 `POST /admin/import`（可 `dryRun`）返回校验报告，错误在 Admin「导入」页可见
- 完整度看板：按组合 / 发行统计草稿 vs 已发布、缺主图、缺成员
- **A07** 可配置约束：`CATALOG_RELEASE_ALLOWLIST=bts:<release_id>` 时，BTS 不能发布 / 导入切片外专辑（草稿下一张专辑仍可建，看板显示发布闸门）
- 扩展专辑发布闸门在看板可读；签署人流程**不**接入
- 发行 `kind` 白名单：`album | single | mini | concert_md`
- C 端 `listReleases` 隐藏 `deprecated`（与 `draft` 相同）
- 特权写入仍记 `admin_audit_logs`；鉴权仍是 ops JWT + `x-admin-token`

**Out**

- OPS-3 缺卡工单、审核队列、爬虫、C 端大改
- 扩专辑调研文档 / 特典研究表（分析/创意侧）
- 未改 `WX_SECRET` / `API_BASE`；无视觉大改

| ID | 行为 |
| --- | --- |
| **A06** | 完整度：草稿/已发布计数、缺主图、缺成员 |
| **A07** | 配置后 BTS 只能落在允许的 `release_id` 切片 |

Admin：图鉴 → **完整度** / **导入**。

## M2.5 OPS-3 缺卡反馈工单

消费 M1 `missing_feedback`（小程序空搜 C03 的文字提交），在 Admin 走工单，不向 C 端展示进度。

**In**

- 每条 `POST /feedback/missing` 即为一张工单，默认 `open`
- 状态：`open` / `in_progress` / `done` / `wontfix`；关闭（done / wontfix）必须写内部备注
- 可关联已有 `PhotocardTemplate`，或新建模板（**始终 draft**）；工单页**没有**申请入库 / 发布
- 写操作记 `admin_audit_logs`；鉴权仍是 ops JWT + `x-admin-token`
- Admin 顶栏菜单 **反馈/工单**（`#/tickets`）

**Out**

- 审核队列 / 申请入库 / 爬虫
- C 端缺卡进度页（小程序不读工单状态）
- 不重做 OPS-2 完整度 / 导入
- 未改 `WX_SECRET` / `API_BASE`；无视觉大改

| ID | 行为 |
| --- | --- |
| **A08** | 用户提交文字缺卡反馈 → Admin 出现 open 工单，可关联草稿 / 关闭 |

### 本地打开 Admin

```bash
# 终端 1
npm run dev
# 终端 2
npm run dev:admin
# 浏览器 http://localhost:5173
# 默认账号（非生产 seed）：ops / ops-dev
```

环境变量见 `.env.example`：`OPS_ADMIN_USER`、`OPS_ADMIN_PASSWORD` 或 `OPS_ADMIN_PASSWORD_HASH`、`OPS_ALLOWLIST`、`CATALOG_RELEASE_ALLOWLIST`（A07，可选）。生产请只放哈希，不要提交明文密码。生成哈希：

```bash
npm exec -w api -- tsx scripts/hash-ops-password.ts 'your-password'
```

会话：`POST /admin/auth/login` 签发 ops JWT（`typ=ops`）并写 HttpOnly cookie `ops_session`。受保护的 `/admin/*`：未登录 **401**，非 ops（如 reviewer）**403**（A01）。脚本仍可用 `x-admin-token`（`ADMIN_TOKEN`）作为回退，现有测试无需改密钥。Admin SPA 用 Bearer + `sessionStorage`；跨域时 cookie 不是主路径。

| 路径 | 说明 |
| --- | --- |
| `POST /admin/auth/login` | `{ username, password }` → `{ token, user }` |
| `GET /admin/auth/me` | 当前 ops 用户 + 菜单 图鉴/投稿审核/用户/情报/反馈工单 |
| `POST /admin/auth/logout` | 清 cookie |
| `GET /admin/audit` | 最近审计（ops） |
| `GET\|POST /admin/catalog/groups` `PATCH .../:id` `POST .../:id/status` | 组合 CRUD + 状态 |
| `GET\|POST /admin/catalog/members` `PATCH .../:id` `POST .../:id/status` | 成员 |
| `GET\|POST /admin/catalog/releases` `PATCH .../:id` `POST .../:id/status` | 发行（kind 仅 `album\|single\|mini\|concert_md`） |
| `GET\|POST /admin/catalog/templates` `PATCH .../:id` `POST .../:id/status` | 小卡模板；无主图不可 `published` |
| `GET /admin/completeness` | 完整度看板（A06）+ 发布闸门（只读，无签署人） |
| `POST /admin/import/validate` `POST /admin/import` | CSV / Markdown / JSON；先报告后写入 |
| `GET /admin/tickets` `GET\|PATCH /admin/tickets/:id` | 缺卡工单列表 / 状态（open / in_progress / done / wontfix） |
| `POST /admin/tickets/:id/templates` | 关联已有模板，或新建 **draft** 模板并关联（不入库） |
| `GET /admin/users` `GET /admin/users/:id` | C 端用户列表 / 详情（脱敏手机号、昵称、头像、关注、贡献积分、投稿计数） |
| `GET /admin/users/:id/submissions` | 该用户图鉴投稿 / 上传记录（只读） |
| `GET /admin/users/:id/phone-events` | 绑定成功 / 失败 / 换绑审计（脱敏号） |
| `POST /admin/users/:id/reveal-phone` | 显示完整号并写审计；默认脱敏 |
| `POST /admin/users/:id/hard-delete` | 单用户硬删；body `{ confirm }` 必须为昵称或用户 ID；级联清会话/拥有/投稿元数据/积分；已发布图鉴保留（`catalog_kept`）；对象存储异步 GC |

图鉴投稿 **首次审核通过** 时记入贡献积分，默认每张 **1** 分（OQ-P3-1，`CONTRIBUTION_POINTS_PER_APPROVED_CARD`）。合并已有模板同样记分（OQ-P3-3）。驳回为 0。**不回填**历史上已经通过的投稿（OQ-P3-2）。Admin **用户**（`#/users`）与小程序「我的」只读展示。不含现金 / 会员 / 广告 / 商城 / 提现 / 封禁。

### 生产部署（Railway 静态服务 `admin`）

独立服务托管 `admin/` 的 Vite `dist/`（Approach A），不要挂在 API 的 `/admin/` 路径下。nginx 对客户端路由做 SPA fallback（`try_files` → `index.html`）。

1. Railway 项目 `xingka` 新增服务，建议名称 **`admin`**，Root Directory：`/admin`，Builder：Dockerfile（`admin/Dockerfile`）。
2. 服务变量（构建期注入，无密钥）：
   ```
   VITE_API_BASE=https://api-production-0818.up.railway.app
   ```
3. Generate Domain，得到 `https://<admin-service>.up.railway.app`。登录页即该 URL（hash：`#/login`）。
4. API CORS：默认允许 `http://localhost:*` / `127.0.0.1` 以及 `https://*.up.railway.app`。自定义域名再在 API 上设 `CORS_ORIGINS=https://your-admin-host`。
5. 生产 ops 登录仍只用 `OPS_ADMIN_PASSWORD_HASH`（可加 `OPS_ADMIN_USER` / `OPS_ALLOWLIST`）。不要提交明文密码。

```bash
npm run build:admin   # 本地确认 dist/；需设置 VITE_API_BASE
```

## UGC-2a / H5-1 只读 H5

分享图二维码指向 `GET /share/landing?g={slug}`。该地址现在返回已发布组合/发行/模板摘要，并引导打开小程序；配置了 `H5_PUBLIC_URL` 时 302 到 H5 SPA。

| 能力 | 说明 |
| --- | --- |
| 未登录落地 | `GET /share/summary` / `/share/landing` 仅已发布图鉴，不含私人卡册、待审 UGC、工单内部备注 |
| 打开小程序 | 优先动态 URL Link / URL Scheme（`WX_APPID`+`WX_SECRET`）；可选 `WX_MINI_GH_ID` + 公众号 JS-SDK 开放标签；再退回静态 `WX_URL_SCHEME` 或复制路径/扫码 |
| 非微信 | 只展示摘要与打开引导，无登录 UI、无写入口 |
| 微信授权 | `POST /auth/wx-web-login` / `GET /auth/wx-web/start`；用 **unionid** 对齐小程序 `user_id`（需开放平台绑定） |
| 图鉴浏览 | 复用现有 `/catalog/...`（published-only）；搜索走 `/catalog/search` |

### 本地打开 H5

```bash
npm run dev          # API :3000
npm run dev:h5       # http://localhost:5174
# 非微信浏览器只看落地页。本地调试图鉴：localStorage.xingka_force_wechat=1 或 URL ?wx=1
```

### 生产部署（Railway 静态服务 `h5`）

与 Admin 一样独立服务托管 `h5/` 的 Vite `dist/`，不要挂在 API 路径下。

1. Railway 项目新增服务 **`h5`**，Root Directory：`/h5`，Builder：Dockerfile（`h5/Dockerfile`）。仓库内 `h5/railway.toml` 固定 Dockerfile builder，避免 Railpack 从 monorepo 根目录启动 API。
2. 构建变量：`VITE_API_BASE=https://<api-host>`
3. Generate Domain，得到 `https://<h5-service>.up.railway.app`
4. API 变量：`H5_PUBLIC_URL=https://<h5-host>`（自动加入 CORS）；`PUBLIC_BASE_URL` 仍指向 API（二维码域名）
5. 微信公众平台：网页授权回调域名填 API host；`WX_WEB_APPID` / `WX_WEB_SECRET` / `WX_WEB_REDIRECT_URI=https://<api-host>/auth/wx-web/callback`
6. 将小程序与公众号绑定同一开放平台，否则 unionid 对不齐，H5 会建成独立 `web:` 用户
7. 自定义 H5 域名再写入 API `CORS_ORIGINS`

```bash
npm run build:h5     # 本地确认 dist/；需设置 VITE_API_BASE
```

## UGC-2b-VLM 宫格入册（火山豆包视觉）

小程序「宫格入册」：入口显式选择 **AI 切图** 或 **手动四宫/九宫**。AI 路径勾选第三方视觉识别说明 → 相册或相机拍整页（规则或不规则）→ `POST /catalog/grid/split` **服务端**调用火山方舟豆包视觉，返回归一化 bbox（技术安全上限 64，可用环境变量覆盖）→ 确认页展示「识别到 N 张」，可调框、删除、旋转。成员/特典建议仅预填，须用户确认。共享组合/专辑；**版本与特典可不填**。确认后每卡匹配 published 图鉴：命中直接挂拥有（不计 UGC 审批积分），未命中走 UGC-1 待审。

失败 / 超时（约 60s）或未配置 `ARK_API_KEY`：Toast 后降级单卡 `pages/catalog-submit`。日限约 20 页/用户；AI 路径无产品张数上限，仅超出检测/提交安全上限时截断最高置信并 Toast。入口显式二选一：**AI 切图** 或 **手动四宫/九宫**（jsfeat，不经过第三方视觉）。无 H5 宫格、无私有-only、不自动 published。

### 环境变量（仅服务端）

密钥**不得**写入小程序或提交到 git。生产 Railway **必须**先配好再开宫格识别，否则会降级单卡。

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ARK_API_KEY` | 是 | 火山方舟 API Key（控制台 → API Key 管理） |
| `ARK_VISION_MODEL` | 建议 | 默认 `doubao-seed-2-0-lite-260215`（豆包视觉定位 / Grounding，2026-09-16 拍板）。生产也可填方舟推理接入点 `ep-…`，代码按字符串原样传给 chat/completions，不校验必须是 seed 名。 |
| `ARK_BASE_URL` | 否 | 默认 `https://ark.cn-beijing.volces.com/api/v3` |
| `GRID_VLM_PROVIDER` | 否 | 默认 `doubao`（可插拔；测试可用 `mock`） |
| `GRID_VLM_TIMEOUT_MS` | 否 | 默认 `60000` |
| `GRID_VLM_DAILY_LIMIT` | 否 | 默认 `20` |
| `GRID_VLM_MAX_DETECT` | 否 | 默认 `64`（技术安全上限，非产品宣传上限） |
| `GRID_VLM_MAX_SUBMIT` | 否 | 默认 `64`（技术安全上限，非产品宣传上限） |

如何取模型 ID：登录 [火山方舟控制台](https://console.volcengine.com/ark/) → 开通 **Doubao-Seed-2.0-lite**（视觉定位 / Grounding）或创建「推理接入点」后把 `ep-…` 填进 `ARK_VISION_MODEL`。未设时 API 默认 `doubao-seed-2-0-lite-260215`。模型 Grounding 输出 `<bbox>`（常为 1000×1000），服务端再转成产品约定的 0–1 bbox。

### 微信开发者工具验证

1. 打开仓库根目录；关闭「不校验合法域名」；`miniprogram/utils/config.js` 指向本机或已配 HTTPS 的 API。
2. 登录后从图鉴/我的进入「宫格入册」；先选 **AI 切图** 或 **手动四宫/九宫**。AI 未勾选协议时点相册应 Toast「请先勾选视觉识别说明」。
3. AI 勾选后上传不规则多卡样张，出现「识别中…」，进入确认页看到「识别到 N 张」（可调框/删/转）。确认入册：图鉴命中直接入柜，未命中先审后发，不自动 published。
4. 停掉 API 或故意配错 `ARK_API_KEY`：应 Toast 并跳转单卡投稿，不白屏。
5. 抓包：请求只打到自有 API `/catalog/grid/split`，**不见** `ARK_API_KEY`、不见方舟域名。
6. 真机：request 合法域名填 API HTTPS；**不要**把火山方舟域名配进小程序（密钥与调用只在服务端）。

确认后每卡复用 UGC-1：`POST /media/ugc-pending`（≤150KB）+ `POST /catalog/submissions`（白名单、协议）。宫格 `source=grid_page` 一律先匹配 published：近 dup 命中则挂拥有（Mode B，**不计审批积分**），未命中 `pending_review`。版本/特典可空。详见 `docs/ugc-2b-match16-scope-draft.md`。

## 手机号绑定 + Admin 硬删（P3-Phone / P3-HardDelete）

合入后部署 **api + admin**，小程序拉 **main** 重新上传。迁移 `018_phone_bind_harddelete.sql` 随 API 启动 seed/migrate。

- 登录仍微信；未绑定手机号不挡使用。
- Admin 用户列表默认脱敏；完整号查询仅精确匹配且限频；点「显示完整号码」写审计。
- 硬删是物理删除（不是 `deleted_at`）；须输入昵称或 ID 二次确认；已发布图鉴保留（`catalog_kept`），用户图异步 GC。
- **微信类目必须允许手机号快速验证组件**，否则 `getPhoneNumber` 无法上架。不改 Admin ops 登录，无短信 OTP 登录，无批量删用户。

## 明确不做（M1 之外）

订阅消息 Worker、微博爬虫、缺卡清单页（C 端进度）、交易、好友关系、端侧大模型、自动 published 特典文案。H5-2 投稿壳、UGC-2c 票务深链不在本切片。
