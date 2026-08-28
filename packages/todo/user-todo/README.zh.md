# @deepseek-ai/dsh-user-todo

[English](README.md) | 中文

用户的今日待办清单：一份扁平的持久任务条目集合，存放在自己的 [`storage-domain`](../../storage/storage-domain/README.zh.md) 域 `user_todo` 中，由 web 右缘待办抽屉（[`dsh-client-ui-user-todo`](../../client/ui-user-todo/README.zh.md)）经生成的 `userTodos` Remote 命名空间编辑。该清单只面向用户——这里的任何内容都不会进入会话日志、模型请求或工具 schema。

一条待办包含必填的非空标题、可选到期时间、`done` 及其 `completedAt` 戳（当且仅当 `done` 为真时存在）、可选关联的项目（workspace），以及该项目下一个可选关联的会话。put 时的显式 `null` 清除链接或到期时间；未指定的字段保持原值。清除项目链接会级联清除会话链接——会话链接不能脱离父项目悬空存在。每次实质变更都会发出 `user-todo/changed` 事件（已加入浏览器客户端白名单），消费方收到后重拉整表而不是回放增量。

“天”的语义完全在客户端：宿主不落盘任何按天的簿记，因此“今天”始终跟随查看方浏览器的时钟。未完成条目从其创建日起自动结转，已完成条目留在完成当天。会话链接在写侧对照 [workspace 注册表](../../workspace/workspace/README.zh.md) 校验——所指会话必须位于所链接项目的已登记会话中——失效的 id 会被响亮拒绝而不是存下悬空引用。

## Configuration

服务没有组合配置：清单没有任何随部署变化的选项。

## Model Experience

### User-todos 目录投影

#### What the model sees

每个存活 agent 的 pre-step 都会收到一条持久的 `user/message` 目录，发布方式与 skill 目录完全一致的全量替换（首次发布清单框架；变更整体替换；清空已发布清单会发布显式空替换），且消息本身即持久日志记录，投影可从会话日志重建。`modelVisible` 关闭时不注册任何监听。目录是一个 `<system-reminder>` 块，其 `<user_todos>` 主体按创建序列出每个未完成条目——`- [ ] 标题 (due: YYYY-MM-DD HH:mm UTC, OVERDUE) (project: 工作区)`——后跟使用指引：把清单当作用户拥有的常驻上下文，绝不修改。已完成条目、完成戳与会话 id 不投影。

#### Token effect

每个未完成条目约一行加固定框架，只在清单变化的回合支付（digest 门控：清单未变时为零）。

#### KV Cache effect

目录搭载在持久 user 消息上，变化时扩展对话前缀并在该回合切分缓存身份；未变化的回合不给前缀增加任何内容。

## Known Limitations and Deferred Work

- **无 compare-and-set** —— 单用户编辑只会与自身跨设备竞争；输掉的多窗口竞争在下一次重拉时收敛，而不是报出冲突。
- **会话链接不随生命周期封存** —— 删除被链接的会话后引用仍在，与 workspace 注册表保留其无法再校验的会话的做法一致。
- **历史属于客户端** —— 更早的完成项是持久的，并由 web 面板的历史折叠区展示；CLI 或其他表面需自备投影。
- **投影是部署级且以 digest 为基线** —— 开启后覆盖所有 agent；比较基线是最后一条已记录目录（旧目录被压缩遮蔽的情况不检测，替换会重新发布）。提醒本身是客户端观察器：仅在持有一个面板挂载的浏览器窗口存活、且站点已持有通知权限时才会触发。
