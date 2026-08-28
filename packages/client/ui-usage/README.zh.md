# @deepseek-ai/dsh-client-ui-usage

[English](README.md) | 中文

Web 用量面板功能的属主包：会话顶栏里的“用量 / Usage”标签（轨迹右边），数据来自 [`usage-ledger`](../../session/usage-ledger/README.zh.md) 存储域，经生成的 `usageLedger` Remote 命名空间读写。一个 controller 支撑整个标签页；其快照经注入的 hooks 座位供给仪表盘，业务组件只持有展示状态。

仪表盘由独立卡片组成：大数字行（累计、今日、单日峰值、当前与最长连续天数）、汇总条（请求数、缓存命中率、配置价格后的成本、最近活跃）、近 20 周的 GitHub 式 Token 活动热力图、带近 7 日/近 30 日切换的按模型每日趋势（零填充）、模型占比环形图。按模型与按会话表格保留精确四桶列；模型与按天切片在客户端跨会话汇总。会话标题经标准 sessions kit 解析（宿主无标题时回退为短 id）。台账在标签首次渲染时懒加载，任何已提交的变更——经白名单 `usage-ledger/changed` 推送加 `connection/reset`——都会让已加载的表格重拉一次；冷台账在首次渲染前保持冷态。

样式只用 token；文案走本包自己的 `usage` locale 命名空间。

## Model Experience

None，本包向人类渲染用户拥有的应用数据，不触及任何 prompt、消息、schema、流或工具结果。

#### KV Cache effect

None；本包从不组装或发送 provider 请求。

## Known Limitations and Deferred Work

- **外部会话的行退化为短 id** —— 标题只对当前窗口列表中的会话可解析；其他 profile 会话的行回退为短 id。
- **无重置** —— v0 的台账没有重置动词，标签页因此不提供清除控件。
- **趋势与热力图读取天×模型交叉切片** —— 切片形状出现之前的存量行只贡献总量，在新样本到来前对按天视图不可见。
