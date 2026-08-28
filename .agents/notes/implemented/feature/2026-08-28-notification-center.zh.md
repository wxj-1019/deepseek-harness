# Agent Note: 应用内通知中心与 schedule 的挂载

Status: implemented

[English](2026-08-28-notification-center.md) | 中文

## 问题

两个不相关的缺口共用这一轮。其一，web 应用没有应用内通知历史：desktop-notify 发的是瞬态 OS toast，错过一条就无处可查；审批、任务完成、schedule 派发经过后不留任何持久记录。其二，`@deepseek-ai/dsh-schedule` 早已完整发布（持久提醒、三个管理工具、派发生命周期），却未被任何发布组合挂载——只有一个可选示例 overlay，意味着该能力对所有发布表面都是死代码。

## 决策

**通知中心。** 新宿主包 `@deepseek-ai/dsh-notification-center` 拥有一个 `notifications` 存储域（条目按 id 为键：kind、title、detail、sessionId、createdAt、readAt）与一个 Typert Remote 命名空间 `notifications`（`list` / `markRead` / `markAllRead` / `clearRead`）。采集器在 init 时只挂权威面：`agent/status` 的 running→idle 转换成为 `session-completed` 条目；每个 `approval/decided` 成为 `approval-decided` 条目；任务终态成为 `job-finished` 条目；schedule 派发成为 `reminder-dispatched` 条目。每次变更发出白名单事件 `notifications/changed`。客户端包 `@deepseek-ai/dsh-client-ui-notification-center` 在 `sidebar.footer.action` 渲染铃铛（未读角标），并把面板作为 `shell.overlay` 的首个占用者——正是为此设计的帧级浮层——两者共用一个 controller，铃铛与面板的开关与内容永不失步。

**Schedule 挂载。** 发布版 web bundle 现在组合 `@deepseek-ai/dsh-time-context` 与 `@deepseek-ai/dsh-schedule`——官方 Schedule Web overlay 的恰好两行——持久提醒（`schedule_create` / `schedule_list` / `schedule_delete`）在 web 根 agent 上活了。其派发事件经共享的 `session/event` 面免费喂给通知中心。

无 key 的 web 旅程 `apps/web/tests/notification-center.e2e.ts` 驱动一个回放回合，其落定成为未读条目、钉住开面板、并标记已读；单元套件钉住采集器与动词（`packages/interaction/notification-center/tests/notification-center.spec.ts`，含重启持久）。schedule 挂载的证据是 roster 探针（新建根 agent 上有 schedule 工具）与其自有套件。

## 考虑过的替代方案

- **用会话投影而非存储域。** 未采纳：通知是跨会话的用户状态，“不是任何单个会话的事实”——正是 storage domain 的范式场景（workspace 先例）。
- **渲染时从 session-query 派生中心。** 未采纳：query 是可选且按内容形状的；中心需要的是一个带已读态、在事发当下写入的持久索引，而不是一次搜索。
- **把 toast 历史塞进 desktop-notify。** 未采纳：那个包拥有的是 OS 通知决策（焦点 + 权限）；把持久收件箱混进去会撕裂接缝。
- **把 schedule 挂进 base bundle。** 未采纳：schedule 只装在根 agent 上，而 time-context 喂的是 web 本地时区；发布目标是 web 表面——CLI/headless 经各自 profile 自行选配，与 overlay 的意图一致。

## 后果

- web 应用终于有了应用内通知历史；shell.overlay 有了首个占用者和一个可供后来者参考的帧级浮层样例。
- schedule 从死代码变成发布能力：持久提醒在每个 web 会话里可达。
- 通知条目集合固定为四类；新来源只需一个采集器、一个 kind、一条 locale 标签。
- 多回合任务每次落定翻转产生一条——v0 可接受，其爆发形态已记录。

## 风险

- **采集器噪音。** 每次落定一次翻转可能刷屏；角标与面板吸收它，爆发合并是记录的后续工作。
- **reload 时的跨面分裂。** 没有白名单推送时，重载的窗口会显示空的冷中心；铃铛挂载即加载，每次推送变更都重拉。
- **提醒条目只有 id 形状。** schedule 派发记录只带 id，中心无法渲染提醒的提示词——诚实的修法属于 schedule 包的改动，延后。
