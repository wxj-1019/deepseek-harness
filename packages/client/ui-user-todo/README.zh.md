# @deepseek-ai/dsh-client-ui-user-todo

[English](README.md) | 中文

Web 今日待办功能的属主包：向 `sidebar.footer.action` 贡献一个入口——触发按钮展开今日面板，数据来自 [`user-todo`](../../todo/user-todo/README.zh.md) 存储域，经生成的 `userTodos` Remote 命名空间读写。全局只有一个 controller 实例；其快照经注入的 hooks 座位供给面板，业务组件只持有查看状态。

面板在客户端派生“今日”视图：先按创建序给出全部未完成条目（从创建日起结转），再按完成时间倒序给出今天完成的条目；本地日期归桶是浏览器时钟上的纯函数，宿主不落盘任何按天簿记。行操作支持从输入框新增、切换完成戳（由宿主拥有）、行内改标题、删除，以及由标准 `useWorkspaces` 供给的项目链接选择器；清除选择会在宿主侧级联摘掉会话链接。任何已提交的变更——自己的、其他窗口经白名单 `user-todo/changed` 推送的、以及 `connection/reset`——都会让已加载的清单重拉一次；冷清单在首次打开前保持冷态。

关闭路径是触发按钮的开合与面板外的指针 dismiss，与其他 footer 面板一致。样式只用 token；文案走本包自己的 `userTodo` locale 命名空间。决策记录见[用户今日待办 Agent Note](../../../.agents/notes/implemented/feature/2026-08-27-user-daily-todo.zh.md)。

## Model Experience

None，本包向人类渲染用户-owned 应用数据，不触及任何 prompt、消息、schema、流或工具结果。

#### KV Cache effect

None；本包从不组装或发送 provider 请求。

## Known Limitations and Deferred Work

- **单面板状态** —— 打开状态属于各挂载点，第二个浏览器窗口初始为收起态；一旦打开，推送事件会让两者保持收敛。
- **会话链接选择器未就位** —— 模型与宿主都接受会话链接，但面板选择器目前只提供项目；在项目内挑选会话是推迟的工作。
- **没有已完成历史** —— 早前日期的完成项是持久的但不渲染；面板严格就是今日视图。
