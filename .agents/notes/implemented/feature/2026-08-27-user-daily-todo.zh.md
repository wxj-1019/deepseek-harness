# Agent Note: 用户今日待办清单

Status: implemented

[English](2026-08-27-user-daily-todo.md) | 中文

## 问题

harness 里没有任何地方安放用户自己的任务。现有所有"任务状"表面都属于 agent 或单个会话：`todo_write` 是模型的工作清单（整列表快照追加进会话日志，`packages/todo/tool-todo`），goal 是会话级、模型可见的状态（`packages/goal/*`），jobs 是进程内存的运行时记录（`packages/jobs/*`），plan 模式与 workflow run 同样以会话为界。一个想记下"今天我要完成什么"——并可选地把条目关联到对应项目——的用户，没有持久的落点。

## 决策

一个宿主包与一个客户端包端对端拥有该功能，套用 message-feedback 模板：

| 件 | 名称 | 说明 |
| --- | --- | --- |
| 宿主包 | `packages/todo/user-todo`（`@deepseek-ai/dsh-user-todo`） | 拥有存储域、服务与 Remote 命名空间 |
| 客户端包 | `packages/client/ui-user-todo`（`@deepseek-ai/dsh-client-ui-user-todo`） | 触发按钮 + 面板，`platform: 'web'` |
| 存储域 | `user_todo`（`version: 0`） | 经 `ctx.storageDomain` 的 zod 校验记录 |
| 线路命名空间 | `userTodos` | Typert Remote：`list` / `put` / `toggle` / `delete` |
| 推送事件 | `user-todo/changed` | `API_REMOTE_FORWARDED_EVENTS` 加一个条目；已加载的清单收到它以及 `connection/reset` 时重拉 |
| UI 座位 | `shell.overlay` 占用者：帧右缘常驻入口 + 右侧抽屉 | 不动 ui-sidebar 与 ui-layout |

一条待办包含必填非空标题、可选备注、`done` 及其恰在为真时存在的 `completedAt`、可选项目链接、以及该项目下的可选会话链接。不带 `id` 的 put 是创建；带 `id` 的 put 是补丁——未指定字段保持原值，显式 `null` 清除。清除项目链接会级联摘掉会话链接。会话链接在写侧对照 workspace 注册表校验——所指会话必须位于所链接项目的已登记会话中——所有拒绝都是显式业务失败而非抛错。每次实质变更都会发出无参的 `user-todo/changed`。

该清单只面向用户：模型不可见。任何内容都不进会话日志，也不存在对应工具；模型可见性留作单独立项的未来决策，因为那会触发"模型可见 ⟺ 已记录"规则与双 SDK 投影。"天"的语义完全在客户端：宿主只存一个扁平集合、没有任何按天簿记；面板把"今日"派生为未完成条目加今天完成的条目；本地日期归桶是浏览器时钟上的纯函数；未完成条目从创建日起结转，已完成条目留在完成当天。

行可链接到项目与其下某个会话：面板提供两个选择器，每次 put 都由宿主重新校验成员关系，链接会话后出现直达按钮；可折叠区按本地完成日期标注展示更早的完成项。无 key 的 headless 快照 `apps/cli/tests/user-todo.snapshot.ts` 经真实组合钉住投影：`modelVisible: true` 时首个 step 发布目录（行、项目标题、到期），未变化的 step 不发布任何内容，完成一条后发布 `catalog-update` 替换；开关关闭时目录永不出现。web 通道经组装应用覆盖该表面：`apps/web/tests/user-todo-panel.e2e.ts` 新增条目、完成它、验证两者在一次整页 reload 后仍在、经推送的 `user-todo/changed` 事件收敛第二个窗口，并钉住开面板快照（`snapshots/user-todo-panel/panel.expected.md`）。单元套件在真实存储栈上钉住服务行为（`packages/todo/user-todo/tests/user-todo.spec.ts`，含重启持久与链接拒绝），以及参数化的日期归桶——跨午夜、时区偏移、进程跨多日存活（`packages/client/ui-user-todo/tests/day.client.spec.ts`）。

## 考虑过的替代方案

- **复用 agent 待办表面（`todo_write`）。** 未采纳：那是模型可见的会话日志状态——归属不对、持久化语义不对（每会话整列表替换），还会把用户笔记泄漏进模型上下文。
- **把条目存进 settings 文档。** 未采纳：`ctx.settings` 是用户可编辑*配置*的接缝（每个属主插件一个命名空间）；任务行是数据，写进去还会污染用户的版本化配置备份。
- **把条目追加进会话日志。** 未采纳："模型可见 ⟺ 已记录"规则把日志留给进入模型请求的内容；跨会话的用户清单"不是任何单个会话的事实"——正是 storage domain 的范式场景（workspace 先例）。
- **手写 BFF 域（`todo.*` RPC map）。** 未采纳：本功能是常规 CRUD 形状；生成式 Typert Remote 样板最少，且有 message-feedback 这个完整模板。
- **落在 `conversation.input.dock`。** 未采纳：该座位是会话作用域；当日清单按定义是跨会话的。
- **落在 `settings.section`。** 未采纳：设置面是配置，不是任务数据。
- **当日隔离、不结转。** 未采纳：每天早晨都要手工重建清单，与本功能的初衷相悖。
- **链接 job 或 workflow run。** 未采纳：jobs 是进程内存对象（从不落盘），workflow run 依附会话——都不是持久链接的稳定所指。
- **v0 就让模型可见。** 推迟而非否决：那需要会话事件并同步 TypeScript 与 Python SDK 的投影更新，是自成一体的改动。

## 后果

- 零配置即是卖点：面板首次启动即可用，条目经域的 JSON 后端跨宿主重启持久。
- 宿主不存任何"天"状态，因此午夜与时区正确性集中在一个纯客户端函数里，而不是持久簿记中。
- 会话链接在被链接会话删除后仍然保留（只存 id、无生命周期栅栏），与 workspace 注册表自己的记账方式一致；未来的清理扫描会是宿主侧改动。
- 多窗口收敛的代价是一条白名单加一个重拉约定——没有增量协议，没有轮询。
- 会话选择器与更早完成历史与面板同轮交付，因为二者读取的都是客户端已持有的状态（workspaces kit 与持久清单）；线路与 schema 均无改动。
- 三个推迟表面都已在后续迭代交付：备注编辑（纯客户端）、提醒（`dueAt` 字段加挂载级通知观察器）、模型可见性（`modelVisible` 部署开关，把未完成项投影为全量替换的 pre-step 目录，发布后空清单也有显式空替换——绝不静默）。

## 风险

- **文案层命名碰撞。** 包名与命名空间已定（`user-todo`/`userTodos`），但 UI 文案仍可能让用户分不清两个 todo 表面。缓解：locale 文案对用户清单一律用"今日待办"；本笔记记录区分理由。
- **推送一致性。** 白名单漏条目或客户端漏订阅会让多窗口状态静默分裂。缓解：旅程的 reload 段承担同类收敛检查，事件从服务写路径的单一位置发射。
- **门禁登记点遗漏。** 新客户端包涉及多处登记点，漏一处就红一道门禁。缓解：清单核对本身已作为独立步骤执行（tsconfig 引用、bundle patch 行、web-app 依赖、两个生成目录、verify 脚本条目）。
- **本机验证缺口。** 本 Windows 宿主的 web 快照通道存在既有的种子夹具反斜杠缺陷（批跑大面积失败）；新旅程本机经单文件过滤验证，真正信号以 Linux CI 为准。
- **日期边界簿记。** 跨午夜与进程长期存活的本地时区折算是边界 bug 温床。缓解：纯函数加上述参数化测试。
