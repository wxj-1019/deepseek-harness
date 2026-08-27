# @deepseek-ai/dsh-user-todo

[English](README.md) | 中文

用户的今日待办清单：一份扁平的持久任务条目集合，存放在自己的 [`storage-domain`](../../storage/storage-domain/README.zh.md) 域 `user_todo` 中，由 web 侧栏底部面板（[`dsh-client-ui-user-todo`](../../client/ui-user-todo/README.zh.md)）经生成的 `userTodos` Remote 命名空间编辑。该清单只面向用户——这里的任何内容都不会进入会话日志、模型请求或工具 schema。

一条待办包含必填的非空标题、可选备注、`done` 及其 `completedAt` 戳（当且仅当 `done` 为真时存在）、可选关联的项目（workspace），以及该项目下一个可选关联的会话。put 时的显式 `null` 清除备注或链接；未指定的字段保持原值。清除项目链接会级联清除会话链接——会话链接不能脱离父项目悬空存在。每次实质变更都会发出 `user-todo/changed` 事件（已加入浏览器客户端白名单），消费方收到后重拉整表而不是回放增量。

“天”的语义完全在客户端：宿主不落盘任何按天的簿记，因此“今天”始终跟随查看方浏览器的时钟。未完成条目从其创建日起自动结转，已完成条目留在完成当天。会话链接在写侧对照 [workspace 注册表](../../workspace/workspace/README.zh.md) 校验——所指会话必须位于所链接项目的已登记会话中——失效的 id 会被响亮拒绝而不是存下悬空引用。

## Configuration

服务没有组合配置：清单没有任何随部署变化的选项。

## Model Experience

None；该域是用户拥有的应用数据。v0 中模型永远看不到这些条目——模型可见性需要会话事件与双 SDK 投影，已被有意推迟。

#### KV Cache effect

None；本包从不组装或发送 provider 请求。

## Known Limitations and Deferred Work

- **无 compare-and-set** —— 单用户编辑只会与自身跨设备竞争；输掉的多窗口竞争在下一次重拉时收敛，而不是报出冲突。
- **会话链接不随生命周期封存** —— 删除被链接的会话后引用仍在，与 workspace 注册表保留其无法再校验的会话的做法一致。
- **没有历史视图** —— 早前日期的已完成条目是持久的，但尚无任何表面展示它们。
