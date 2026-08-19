# Agent Note: Web 表面的桌面完成通知

Status: implemented

[English](2026-08-19-desktop-completion-notification.md) | 中文

日期：2026-08-19 · 领域：`packages/client/ui-desktop-notify`

## 问题

后台标签页里跑完的长任务没有桌面级信号：操作者只能反复回看页面才知道运行结束，而既有的页内提醒只在标签页被盯着时有用。

## 决策

新增浏览器插件 `dsh-client-ui-desktop-notify`，在任务完成时弹出 Web Notification。信号是客户端的 running→idle 边沿：监视器订阅 `ctx.sessions.list`（`host/session-status` 帧已为每个会话驱动、重连安全的快照流），自行对每个会话的 `running` 位做差分，并以启动时的快照播种——首次即处于运行态的会话只被观察、不会被播报。触发条件刻意保持安静：偏好开启、展示时浏览器权限为 granted、且完成的会话不是可见页面上当前选中的那个——盯着会话干活保持沉默，其余情形（选中了别的会话，或标签页被遮挡）弹通知。激活通知会聚焦窗口并通过 `sessions.open` 选中该会话。

开关是"常规设置"里的一行（`settings.general.item`，沿用 Enter 行为行的模式），落在持久化的 `ui-desktop-notify` 命名空间，默认关闭，保证系统权限弹窗永不突袭。该行同时负责权限流程：`default` 先询问浏览器、仅在 granted 时持久化；`denied` 显示重新开启指引；API 缺失显示不支持提示。宿主半在同包注册命名空间；整个特性对模型不可见——没有会话事件、没有 SDK 表面、也没有 agent-loop 改动。

## 曾考虑的替代方案

- 扩展侧栏的绿色 `completed` 提醒（manager 的 `completedNotifications` 边沿）而不建新包——否决：该标记每次运行只触发一次、选中即清除、且完全压制被盯着的会话，属于列表投影的呈现状态；OS 集成需要自己的边沿检测与设置命名空间，"一切皆插件"也要求两者落在特性包里。
- 订阅持久 `turn/end` 事件以获得按原因区分的文案——暂缓：`session/event` 帧只会到达本标签页实例化过的会话，任何会话都可弹的通知无法依赖它；该局限记录在包 README。
- 用 `shell.overlay` 上的页内 toast 栈替代 OS API——否决：需求是在标签页无人盯守时的桌面级感知，页内 toast 到达不了那里。

## 后果

- 监视器是纯客户端消费者：无 RPC、无会话事件、除命名空间注册外无宿主改动。触发逻辑以纯函数形式放在 `notifications.ts`（边沿矩阵单测），运行时在 `desktop-notify.ts`（无 React、端口可注入以便测试），设置行在 `NotificationRow.tsx`；jsdom 长凳启动真实 apply 接线并从中发出一颗通知。
- Web e2e 场景（`apps/web/tests/desktop-notify.e2e.ts`）拥有装配层面的设置表面：通过 init 脚本桩一个 granted 的 Notification API、翻转开关行、锁定持久化写入与 golden——零模型调用，replay 保持无 key。触发路径的页面级覆盖由包长凳承担；通过 scaffold 驱动一次真实完成需要录制 fixture，却不带来额外契约。
- 所有插件卫生面均已落实：fiber 卸载的 HMR 安全、en/zh 键对的语言词典、invariant 伴随、逐文件 100% 覆盖率，以及新客户端包应尽的 bundle/名册/依赖/tsconfig/knip/README 注册。
