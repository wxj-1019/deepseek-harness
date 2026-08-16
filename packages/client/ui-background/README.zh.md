# @deepseek-ai/dsh-client-ui-background

[English](README.md) | 中文

背景插件：为 Web 客户端提供持久的 无 / 内置预设 / 一张上传图片 偏好。Host 半注册 `ui-background` 设置命名空间，提供 `/backgrounds` 路由（POST 经附件存储的图片策略准入，GET/HEAD 以 ETag 重校验返回当前图片），并把背景 body 变量注入 index HTML，使首帧绘制即已带出背景。浏览器半提供 `ctx.background`（`BackgroundRuntime`）：经 Host settings scope 校验的偏好写入、`background/change` 事件上的不可变 `BackgroundSnapshot`、原始字节上传，以及背景设置分区。呈现面是三个 body 级 CSS 变量（`--dsw-specific-backdrop-image/-scrim/-surface`）；`ui-layout` 渲染消费它们的惰性图层，并在没有该插件时依然正确。

上传准入复用 `ctx.attachments.imageLimits`（媒体类型、字节上限），因此一份部署策略同时统管聊天图片与背景。存储图片是附件存储中的内容寻址对象；设置只保存引用。两条 `/backgrounds` 方法都经由 `@deepseek-ai/dsh-client-connection/trust` 携带与 `/api` 相同的浏览器信任栅栏；该 Host 行的 `trustedHosts` 配置镜像 connection 行的列表（每个条目在加载时校验，缺省即仅回环——单机部署的安全默认）。遮罩对 `--dsw-alias-bg-base` 求 `color-mix()`，无需额外状态即跟随亮暗；预设以 `body` + `body[data-ds-dark-theme]` 一对规则同时携带两种配色模式。

## 模型体验

无。该服务管理浏览器偏好；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- 被替换的图片不做垃圾回收；孤立的存储对象会累积，但受上传大小上限约束。
- URL 粘贴图片、按工作区区分背景、动效背景与侧栏半透明按设计不在范围内。
