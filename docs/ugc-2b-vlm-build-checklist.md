# UGC-2b-VLM 构建清单（2026-09-16 开闸）

> 上位：`ugc-2b-vlm-grid-scope-draft.md`（已确认 · 开闸）  
> 供应商：**火山豆包视觉**（火山引擎 Ark）；备选通义/智谱可插拔  
> 约束：不跑全量测试；密钥仅服务端；确认后仍走 UGC-1；禁止免审灌库

## In
1. 小程序「宫格入册」：去掉强制四宫/九宫；上传整页 → **服务端 VLM** 检出多卡 bbox → 切图 → 确认页
2. API：`/catalog/grid/split`（或新 `/catalog/grid/detect`）主路径调豆包；返回归一化 boxes + 可选建议字段
3. 确认页：调框/删卡/旋转；预填建议须可改；确认后 A 批量 pending + B 匹配入柜（复用 2b）
4. 失败/超时（~18s）：降级单卡 UGC-1；可选保留 jsfeat 规则宫格为高级入口
5. 日限约 20 页/用户；检测最多 12、提交最多 9；协议披露第三方视觉识别
6. Railway：配置 `ARK_API_KEY`（及模型 endpoint/id 环境变量）；密钥不出小程序

## Out
端侧跑模型、免审、H5 宫格、自动 published 特典文案、Album-N、UGC-3、交易

## 验收
VLM-01…09 见 freeze §5

## 环境变量（建议名）
- `ARK_API_KEY` — 火山方舟 API Key（**Railway 生产必填**）
- `ARK_VISION_MODEL` — 默认 `doubao-seed-2-0-lite-260215`（豆包视觉定位 / Grounding，2026-09-16 拍板）。生产也可填方舟接入点 `ep-…`（原样传给 chat/completions）
- `ARK_BASE_URL` — 可选，默认 `https://ark.cn-beijing.volces.com/api/v3`
- `GRID_VLM_PROVIDER=doubao` — 可插拔；CI/本地无密钥时走 mock / `vlm_unconfigured` 降级
- `GRID_VLM_TIMEOUT_MS=18000`、`GRID_VLM_DAILY_LIMIT=20`

## 微信开发者工具验证步骤

1. 打开仓库根；关闭「不校验合法域名」；API 指向本机或 HTTPS。
2. 登录 → 「宫格入册」：未勾选「第三方视觉识别」时点相册 Toast 拦截。
3. 勾选后上传不规则多卡：显示「识别中…」→ 确认页「识别到 N 张」，可调框/删/转；建议成员/版本可改。
4. 确认入册：每卡 pending 或匹配拥有；无自动 published。
5. 停 API / 清空 `ARK_API_KEY`：Toast + 跳转单卡投稿，不白屏。
6. 抓包只见自有 `/catalog/grid/split`，不见 `ARK_API_KEY`、不见方舟域名。
7. 真机：小程序合法域名只配 API HTTPS，不要配方舟。

*合入后部署 api，小程序拉 main。Railway 未设 `ARK_*` 时生产识别会降级单卡。*

## Admin 调用统计

每次服务端 VLM 检测（成功 / `no_cards` / `timeout` / `vlm_fail` / `vlm_unconfigured` / 日限 429）写入 `grid_vlm_calls`；**jsfeat 高级入口不记**。不存原图、base64、方舟原文或密钥。现有 `grid_vlm_daily` 配额逻辑不变。

- API：`GET /admin/grid-vlm/stats?from=&to=`、`GET /admin/grid-vlm/calls`（ops 鉴权）
- Admin 页：「宫格识别」（今日 / 近 7 日卡片 + 明细）
- 合入后部署 **api + admin**；migration `017_grid_vlm_calls.sql` 走现有 `npm run migrate` / seed

