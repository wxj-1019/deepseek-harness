# @deepseek-ai/dsh-client-ui-desktop-notify

[English](README.md) | 中文

Web 桌面通知特性所有者：提供"常规设置"里的开关行，为部署开启"任务完成时弹系统通知"，以及真正发出通知的完成监视器。信号完全来自 [`dsh-client-runtime`](../runtime/README.zh.md) 由 `host/session-status` 帧驱动的 `sessions.list` 快照流，本包自身不发起任何 RPC；偏好持久化在 `ui-desktop-notify` 设置命名空间。

一次任务完成 = 两次快照之间某个会话的 `running` 位从 true 落到 false。监视器以启动时的快照播种（首次即处于运行态的会话只被观察、不会被播报），并且只在偏好开启、展示时浏览器权限仍为 granted、且完成的会话不是可见页面上正被盯着的那个会话时才弹 Web Notification——其余情形（选中了别的会话，或标签页被其他窗口遮挡）都会弹出。通知携带会话的显示标题、本地化的完成文案，并以会话 id 作为 tag；激活通知会聚焦窗口并选中对应会话。权限流程保持诚实：权限仍为 `default` 时打开开关会先询问浏览器、仅在 granted 时持久化；权限为 `denied` 时显示重新开启的指引，而不是一个撒谎的开关；无此 API 的浏览器显示不支持提示。文案走包自有的 `settings.desktopNotify` 语言命名空间。行为由[桌面完成通知 Agent Note](../../../.agents/notes/implemented/feature/2026-08-19-desktop-completion-notification.zh.md)规定。

## Model Experience

None，本包渲染的是人类偏好与操作系统级通知，不触及任何 prompt、消息、schema、流或工具结果。

#### KV Cache effect

无；本包从不组装或发送提供方请求。

## Known Limitations and Deferred Work

- **完成边沿是 running→idle，而非回合原因** —— `host/session-status` 位覆盖从预步骤到回合收尾的全过程，因此因等待审批而阻塞或被中止出错的会话，对通知而言同样读作"完成"；按原因区分文案需要本标签页从未打开过的会话也能收到回合结束流。
- **每个会话 id 一次通知** —— 相同会话的旧通知会被 tag 替换，声音、分组与生命周期归操作系统所有；页面无法清除或撤回已展示的通知。
