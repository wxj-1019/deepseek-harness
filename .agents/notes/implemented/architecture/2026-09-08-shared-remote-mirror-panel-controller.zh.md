# Agent Note: Host 镜像面板的共享 remote-mirror controller

Status: implemented

[English](2026-09-08-shared-remote-mirror-panel-controller.md) | 中文

## 问题

五个 Client 面板包（`ui-session-pins`、`ui-user-todo`、`ui-notification-center`、`ui-usage`、`ui-component-library`）各自持有几乎相同的 controller：cold/loading/ready/error 快照 store、只读一次的 `ensure`、失败时保留上一份可用列表的 `resync`、同一个 `messageOf` 辅助函数，以及在向 Host 重新读取之前把传输失败映射为 `response.error.message`、把业务拒绝映射为 `code:<code>` 的动词包装。这些副本在注释和细节（条目拷贝、pricing 归一化）上已经漂移，且每次生命周期修复都要重复五遍。

## 决策

**共享生命周期由 `@deepseek-ai/dsh-client-store` 中的 `RemoteMirrorController` 持有。** 抽象基类以面板的 `MirrorState` 扩展、生成的 Remote face 与列表载荷为参数；子类只实现 `read`（发起列表调用）与 `applyReady`（把载荷折入 draft）。它提供 `store`、`getSnapshot`、`subscribe`、`cold`、`resync`、`ensure` 以及 `protected mutate` 动词包装。`mirrorErrorMessage` 供少数把失败发布到自有状态字段的子类动词导出使用。

**分歧行为留在子类。** `ui-component-library.review` 返回 `void` 并发布到 `reviewError` 而不是回传消息，因此不走 `mutate`。`ui-notification-center` 在镜像旁边保留面板开合状态与不走 Remote 的动词（`toggleOpen`、`close`）。`ui-usage` 只读，从不调用 `mutate`。额外状态字段（`query`、`open`、`reviewError`）位于子类状态接口上，这些接口扩展 `MirrorState`。

**基类位于 store 包、低于 `ui-slots` 一层。** `dsh-client-store` 无法引用 `HostObservable`；子类保留各自的 `implements HostObservable<State>` 子句，结构化类型即可满足 slot 绑定。store 包为 `RemoteResult` 传输包装新增了指向 `@deepseek-ai/dsh-typert-protocol` 的项目引用与依赖，并沿用 `ui-approval` 的先例直接引用 `packages/typert/protocol`，使导入解析到被引用项目的声明产物。

## 验证

`packages/client/store/tests/remote-mirror.client.spec.ts` 固定基类契约：仅首次读取公告 loading、静默收敛、失败时保留上一份可用数据、传输/拒绝映射、cold/ready/error 下的 `ensure` 语义，以及 `mutate` 的全部四种结果。五个面板包的现有测试套件（68 个测试）针对子类原样通过。

## 备选方案

**保留五份副本。** 已否决：副本已经漂移，且生命周期是同一条契约——失败保留一份读取、公告一次 loading——理应只有一处测试。

**把基类放到 `ui-slots` 与 `HostObservable` 相邻。** 已否决：镜像生命周期依赖 snapshot-store 引擎，而 `ui-slots` 并不持有它；把基类放到 store 之上会颠倒依赖方向，并把 `zustand`/`immer` 拖入 slots 层。

**把分歧的 `review` 动词统一进 `mutate`。** 已否决：component-library 卡片从 store 内联渲染评审错误并丢弃 promise；强行套用到返回消息的包装会无端改变卡片的契约。

## 后果

- 新的 Host 镜像面板改为子类化 `RemoteMirrorController`，不再拷贝生命周期；只有 Remote face、列表载荷折叠与定制动词是新代码。
- 生命周期变更只有一处实现和一份规格；面板套件只守护子类接线。
- `dsh-client-store` 依赖 `dsh-typert-protocol`；对镜像模块做 tree-shaking 的 store 消费者不会加载它。
