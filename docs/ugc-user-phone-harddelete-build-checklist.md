# 手机号绑定 + Admin 硬删 构建清单（2026-09-16 开闸）

> 上位：`ugc-user-phone-harddelete-scope-draft.md`（已确认 · 开闸）  
> 约束：不跑全量测试；登录仍微信；硬删须二次确认+审计

## In
1. 小程序 getPhoneNumber → 服务端换号落库；「我的」/设置可绑定；默认不强制绑定
2. Admin 用户列表/详情：脱敏手机号、可筛；绑定事件日志（成功/失败/换绑）
3. Admin 单用户硬删：二次确认（输入昵称或 id）→ 级联清 users/会话/拥有/投稿等；强制审计（actor/时间/target/清理摘要）
4. OQ 默认：手机号全局唯一；仅换绑不清空；完整号查询限频；Admin 默认脱敏点显审计；COS 异步 GC；published 图鉴保留断联

## Out
短信独立登录、改 Admin ops 登录、软删冒充、批量删、用户自助注销合规包

## 验收
见 freeze §5

## 部署
合入后部署 api + admin + 小程序拉 main；确认微信类目支持手机号组件
