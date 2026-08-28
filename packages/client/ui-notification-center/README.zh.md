# @deepseek-ai/dsh-client-ui-notification-center

[English](README.md) | 中文

Web 通知中心功能的属主包：`sidebar.footer.action` 里的铃铛，加 `shell.overlay` 首个占用者的中心面板，数据来自 [`notification-center`](../../interaction/notification-center/README.zh.md) 存储域，经生成的 `notifications` Remote 命名空间读写。两个表面共用一个 controller；面板开合状态也在这份共享快照里，铃铛与面板永不失步。

铃铛带未读角标；面板按最新在前列出持久条目，含种类、标题（会话标题经 sessions kit 解析）、时间与未读标记——点行进入对应会话，头部提供全部已读与清除已读，Escape 或关闭按钮收起。任何已提交的变更——自己的、其他窗口经白名单 `notifications/changed` 推送的、以及 `connection/reset`——都会让已加载的清单重拉一次；冷清单在铃铛首次点亮前保持冷态。

样式只用 token；文案走本包自己的 `notificationCenter` locale 命名空间。overlay 层按契约是点击穿透的，卡片自己声明收回指针事件。

## Model Experience

None，本包向人类渲染用户拥有的应用数据，不触及任何 prompt、消息、schema、流或工具结果。

#### KV Cache effect

None；本包从不组装或发送 provider 请求。

## Known Limitations and Deferred Work

- **会话消失后条目退回自身标题** —— 会话被删除后其标题无法解析；行回退到条目自带的标题。
- **无通知历史修剪** —— 中心持续增长直到被清除；保留策略是延后工作。
- **种类图标用文字标签** —— 词汇量够小，本轮文字胜过生造图形。
