# @deepseek-ai/dsh-notification-center

[English](README.md) | 中文

应用内通知中心：每个值得注意的宿主时刻一条持久条目，存放在自己的 [`storage-domain`](../../storage/storage-domain/README.zh.md) 域 `notifications` 中，由 web 铃铛与 overlay 面板（[`dsh-client-ui-notification-center`](../../client/ui-notification-center/README.zh.md)）经生成的 `notifications` Remote 命名空间渲染。该中心只面向用户——这里的任何内容都不会进入会话日志、模型请求或工具 schema。

采集器在 init 时从权威 cordis 事件面订阅：agent 的 running→idle 落定成为 `session-completed` 条目；每个 `approval/decided` 成为带结论的 `approval-decided` 条目；任务终态成为带标签与状态的 `job-finished` 条目；schedule 派发（`schedule/change` 且带 `acceptedAt`，挂载 [`dsh-schedule`](../../schedule/schedule/README.zh.md) 时存在）成为 `reminder-dispatched` 条目。每次追加或已读态变化都会发出白名单事件 `notifications/changed`；已加载表面收到它以及 `connection/reset` 时重拉。

动词：`list`（最新在前）、`markRead`（幂等，未知 id 以 `notification-not-found` 响亮失败）、`markAllRead`、`clearRead`（只清已读）。条目从不离开其来源日志；中心是时刻的持久索引，不是其内容的拷贝。

## Configuration

服务没有组合配置：采集器集合固定，每个来源用各自的事件说话。

## Model Experience

None；该域是用户拥有的应用数据，不进入任何请求组装；模型看不到通知，投影词汇不新增成员。

#### KV Cache effect

None；本包从不组装或发送 provider 请求。

## Known Limitations and Deferred Work

- **落定条目按落定转换计** —— 多回合任务每次 running→idle 翻转产生一条；把爆发合并为每任务一条是延后工作。
- **提醒条目带 schedule id 而非其提示词** —— 派发记录只有 id，向 schedule 折叠态的持久链接属于 schedule 包的改动。
- **审批条目带结论 JSON 而非工具参数** —— asked 事件除 toolName 外的字段不投影进条目。
- **无跨进程可见性** —— 与今天所有 storage domain 一样，该域是进程本地的。
