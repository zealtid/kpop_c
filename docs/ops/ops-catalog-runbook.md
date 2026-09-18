# 星卡运营图鉴 Runbook

> **对照表路径已废弃（2026-09-18）**  
> 不要再把「中国特典对照表 / version-benefit CSV」导入 `release_benefit_map`。  
> 现行作业：维护 [特典词典](#特典词典) + [小卡模板/维护](#小卡模板维护)。  
> 样例 CSV `docs/ops/version_benefit_map.sample.csv` 仅作历史参考，**标为 deprecated，禁止进库**。

## 特典词典

产品名：**特典词典**（数据源仍是 `channel_dictionary`，技术字段 `channel_code` 可保留）。

Admin：图鉴 → **特典词典**（`#/catalog/benefits`）。可列表、新增、改中文名/别名、软禁用。C 端投稿/筛选选择器读启用中的词典条目。

不要新建第二套「特典」实体。

## 小卡模板/维护

卡面、版本、POB 文案仍走 Template。Admin：图鉴 → **小卡模板/维护**（`#/catalog/templates`）。

## 已下线：版本×特典对照表

`release_benefit_map` 表保留（软下线，不 DROP）。Admin 不再展示矩阵编辑/CSV 导入。读 map 类 API 返回空列表 + `deprecated: true`。

硬删表与 `channel_*` 标识 rename **另开闸**。
