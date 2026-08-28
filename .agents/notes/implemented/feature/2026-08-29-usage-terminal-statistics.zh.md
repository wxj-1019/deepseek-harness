# Agent Note：终端风用量统计

Status: implemented

[English](2026-08-29-usage-terminal-statistics.md) | 中文

## 问题

用量标签现在只有一张扁平的按会话表格。用户希望参照 ZCode CLI 的报表样式做一个用量统计视图：先是紧凑的汇总条，然后是按模型分解的 cost 报表式表格。台账（v0）只有每会话总量，模型维度还不存在；不过采集器可以零成本拿到它——每条带用量的 `assistant/message` 事件都携带 `message.source.model`（`ModelMessageSource` 溯源字段）。

## 样式定义（“ZCode 风”）

终端报表的习惯用法：状态栏式汇总条（暗标签、亮数值、`·` 分隔）、`/cost` 式分解表、tabular 等宽数字、`K`/`M` 缩写、百分比、细比例条。全部叠放在现有用量标签内，分三段——不加新标签，不引图表库：

```
输入 4.8K · 输出 64 · 缓存读 30.1K · 缓存写 1.2K · 合计 36.1K
128 次请求 · 缓存命中 83% · 最近活跃 08-29 14:32
──────────────────────────────────────────────
模型               请求  输入   输出  缓存读  缓存写  占比
DeepSeek-V4-Flash    96  3.9K    52   24.5K    980  72% ▍
GLM-5.3-flash        32   96     12    5.6K    210  28% ▏
──────────────────────────────────────────────
（现有按会话明细表，样式对齐）
```

## 决策

- **D1 —— 一个标签、三段布局。** 统计渲染在现有用量会话视图内：汇总条、按模型表、按会话表。不加视图项，不动路由。
- **D2 —— 台账 schema v0 → v1。** `UsageLedgerRecord` 增加 `models?: Record<string, UsageLedgerBuckets>`（按模型的四桶加请求数；以 provider 模型 id 为键的 merge-extensible map）与 `firstAt?: number`。按预发布立场升域版本、丢弃 v0 行。现有总量桶保持顶层字段，现有消费方形状不变。
- **D3 —— 模型身份取自事件。** 采集器读 `event.data.message.source.model`（assistant 消息的 `source.kind` 按类型即 `'model'`）。不加事件字段，不动请求管道。
- **D4 —— 聚合是客户端纯函数。** 宿主只做哑累积；总量、按模型汇总、缓存命中率与占比全部在 `view.ts` 对拉取的行派生，按快照 memoize。
- **D5 —— 展示约定。** `fmtTokens`：`< 1000` 原样，`≥ 1000` → `12.3K`，`≥ 1e6` → `1.2M`。缓存命中率 = cacheRead / (input + cacheRead + cacheWrite)（缓存写计为未命中）。占比条 = 纯 CSS 宽度，2px 高。数字对齐处一律 `font-variant-numeric: tabular-nums`。
- **D6 —— 成本仅在配置价格表后显示。** 服务接受可选 `pricing` 配置（每桶 USD/1M token，按模型 id 键控，`*` 为回退键），经 `list()` 发布，客户端用纯函数推导成本；未配置或空表时任何地方都不显示成本。错误的价格表比没有更糟，因此由部署显式选择加入。
- **D7 —— 按天切分。** 记录同时携带按宿主本地日历日（`YYYY-MM-DD`）键控的 `days` 切片；视图渲染按天表格与汇总条中的今日指标。两个字段在 schema 中可选，v1 行干净加载、天统计自升级起累积——无需再升域版本。

## 工作计划

1. **宿主**（`packages/session/usage-ledger`）：record v1 + spec 版本升级；采集器串起模型 id；单测覆盖按模型累积与 v1 重开路径。约半天。
2. **客户端**（`packages/client/ui-usage`）：`view.ts` 纯聚合加单测（空行、单模型、舍入边界）；`UsageSection` 重排为三段布局并新增模块 CSS；两本词典增加汇总标签（`summary.requests`、`summary.cacheHit`、`table.model`、`table.share`）。约半天。
3. **快照**：新的 keyless web 旅程（`usage-panel.e2e.ts`）经真实 remote 面播种行数据，钉住打开标签的黄金（汇总条 + 模型表 + 会话表）；夹具从第一天起可在 macOS/Linux 回放。
4. **文档**：两份包 README 更新到 v1 record 形状；重录配对。

## 备选方案

- **宿主聚合（加 `summary` RPC）被否**：行列表很小且客户端已持有，第二条读路径只会翻倍不变式面积，换不来传输节省。
- **显示成本而非 token 被否**：理由见 D6，错误的价格表比没有更糟。
- **独立统计插件被否**：台账接缝是一个能力，这个视图已经是它唯一的消费方。
