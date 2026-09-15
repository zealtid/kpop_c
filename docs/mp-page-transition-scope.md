# 小程序页面转场 — 范围冻结（Notion #16）

> 产品：**星卡**  
> 状态：**已确认 · 本切片已开研发闸**（总监批准 BA）  
> 文件：`docs/mp-page-transition-scope.md`  
> 平台：微信小程序；**无 H5、无暗色模式**

---

## 1. 一句话

主栈跳转优先用微信原生 `navigateTo` / `switchTab` / `navigateBack`；不要用 `reLaunch` 切 Tab 或结束投稿。自定义动效只给**页内步骤**，且 **≤300ms**。

---

## 2. In（首包路由）

| 包 | 路由 | 跳转 |
|----|------|------|
| Tab | 卡册 / 图鉴 / 我的 | 原生 `switchTab` |
| 图鉴列表 ↔ 详情 | 图鉴 → 组合 → 卡片详情 | 原生 `navigateTo` / `navigateBack` |
| 投稿流 | 图鉴或我的 → 投稿 → 裁剪返回；提交成功进「我的投稿」 | `navigateTo` / `navigateBack`；成功用 `redirectTo` **替换**投稿页，**禁止 `reLaunch`** |
| 我的 ↔ 设置 | 我的 → 设置 → 返回 | 原生 `navigateTo` / `navigateBack` |

窗口底色与页面底色对齐（`#F4F5F9`），避免原生 push 白闪。

页内步骤（chip / 点按 / 隐私选项等）可用短 CSS / `hover-class`，时长 **≤300ms**；`prefers-reduced-motion` 时关掉。

---

## 3. Out

- 深浅色主题（Notion #15 仍暂停）
- Lottie / 重型自定义路由壳 / Skyline 整页自定义 route
- H5 转场
- 改业务路由、情报 Tab、宫格入册专属动效

---

## 4. 验收 MP-T01…05

| ID | 期望 |
|----|------|
| **MP-T01** | 底栏卡册 / 图鉴 / 我的用原生 `switchTab`，无自定义整页动画，窗口底色无白闪 |
| **MP-T02** | 图鉴列表 ↔ 组合 / 卡片详情用原生 `navigateTo` / `navigateBack`，无白闪 |
| **MP-T03** | 投稿流：进入投稿与裁剪用 navigate/back；提交成功 `redirectTo` 我的投稿，栈里不再留空表单，**不得 `reLaunch`** |
| **MP-T04** | 我的 ↔ 设置用原生 `navigateTo` / `navigateBack` |
| **MP-T05** | 页内点按 / chip / 隐私选项过渡 ≤300ms；减动效关闭；无主题开关、无 Lottie、无 H5 路由壳 |
