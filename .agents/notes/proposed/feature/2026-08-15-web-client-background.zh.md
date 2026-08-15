# Agent Note: Web 客户端的用户自定义背景

Status: proposed

[English](2026-08-15-web-client-background.md) | 中文

## 问题

Web 客户端只渲染一层纯色页面背景：`body` 与 AppFrame 根节点都刷 `--dsw-alias-bg-base`（`packages/client/web/src/base.css`、`packages/client/ui-layout/src/client/AppFrame.module.css`），客户端里没有任何壁纸或背景概念。theme 插件拥有配色偏好（亮色/暗色/跟随系统），但用户无法个性化会话区背后的空间。

长期使用的聊天工作台是放个人背景的合理场合：用户选一张图片或一个内置渐变，客户端带可读性遮罩渲染在会话区背后，且选择在刷新后保留。持久偏好链路已经存在（`settingsScope` → settings RPC → `$DSH_HOME/settings.yaml`），缺的是背景偏好本身、图片字节的上传通路，以及布局里的渲染面。

## 方案

新增 `ui-background` 客户端插件——新包 `packages/client/ui-background`（`@deepseek-ai/dsh-client-ui-background`）——镜像 `ui-theme` 的双半结构并完整拥有该特性：

- 持久设置命名空间 `ui-background`（见下方 schema），经现有 settings capability 持久化；
- 上传通路：一条 `/backgrounds` webServer 路由（POST 经现有 `attachments` 内容寻址存储落一张图；GET 回放存储字节），settings 只保存不透明 id，绝不保存图片字节；
- 一个带 `background/change` 事件的 `ctx.background` 客户端服务，由 `ui-layout` 可选消费，AppFrame 增加惰性的背景层与遮罩层；
- 镜像 `injectBootTheme` 的启动期 index 变换，让背景首帧即现、无闪烁；
- 一个背景设置分区，含预设缩略图、图片上传与遮罩浓度滑杆。

V1 范围为 无 / 内置预设 / 一张上传图片。URL 粘贴图片、按工作区区分背景、动效背景、侧栏半透明、替换图片的垃圾回收均不在范围内（见风险）。

## 设置模型

命名空间 `ui-background`，扁平字段如 `ui-theme`，一个判别标签用于 switch：

```ts
interface BackgroundSettings {
  /** Discriminant for the active background kind. */
  preference: 'none' | 'preset' | 'image'
  /** Preset id; required and only read when preference is 'preset'. */
  preset?: string
  /** Stored-image reference; required and only read when preference is 'image'. */
  image?: { id: string; mediaType: string }
  /** Scrim strength over the background, 0–90 percent. */
  dimming?: number
}
```

`setBackground` 校验配对——`preset` 必须是已注册预设 id，`image` 必须是完整引用——其余一律拒绝；消费方对 `preference` switch 并按闭合联合约定在 default 走 `assertNever`。预设是固定导出的注册表：`id`、本地化标签、`{ light, dark }` 两份 CSS `background-image` 值（两种模式必填，与 theme 覆盖约定一致）。V1 附带三个渐变。`dimming` 默认 45；默认值与最终预设清单是风险节列出的未决产品决策。

## 存储与上传路由

Host 半复用现有附件存储（`ctx.attachments` 的 `saveImage`/`readImage`；对象按内容寻址落在 `$DSH_HOME/attachments/v1`）而不是自建第二套存储，并注册一条 webServer 前缀路由 `/backgrounds`，与 client-modules 的 `/plugins` 路由同构：

- `POST /backgrounds` —— 原始图片字节，媒体类型在 `Content-Type`。处理器以 content-length 加流式守卫执行大小上限（`maxImageBytes`，经校验的插件 Config 字段，默认 8 MiB——不是硬编码可调项），把校验委托给 `saveImage`，应答 `{ id, mediaType }`。失败——超限、媒体类型不支持、`attachments` capability 缺席——映射为 4xx/5xx，并在设置分区以可见错误呈现。
- `GET /backgrounds/<id>` —— 以不可变缓存头回放存储字节。`id` 必须匹配 `^[0-9a-f]{64}$`（存储的 sha256 编址）；其余一律 404，因此绝不从请求输入推导宿主路径。

路由注册走 `ctx.effect`（返回的清理器负责移除）。上传鉴权沿用现有 `/api` POST 面所用的检查；若该面有 loopback 来源校验，`/backgrounds` 采用同一套——实现时核实。

## 渲染管线

三个 body 级 CSS 变量是唯一机制；启动变换与运行时 presenter 只写变量，样式表以惰性默认值消费：

- `--dsw-specific-backdrop-image` —— 存储图片的 `url(...)` 或预设渐变；未设即无。
- `--dsw-specific-backdrop-scrim` —— `color-mix(in srgb, var(--dsw-alias-bg-base) <dimming>%, transparent)`；对活令牌求值使遮罩自动跟随亮暗。
- `--dsw-specific-backdrop-surface` —— 背景生效时为 `transparent`；否则未设。

`ui-layout` 在 AppFrame 堆叠序底部渲染两个惰性层（`position: absolute; inset: 0; pointer-events: none`，z-index −2 图片、−1 遮罩），并把 AppFrame 根与启动页的涂刷改为 `background: var(--dsw-specific-backdrop-surface, var(--dsw-alias-bg-base))`。组件填充——卡片、气泡、菜单——保留各自令牌，V1 保持不透明；侧栏保留实心填充。`ui-layout` 以可选的 `ctx.inject(['background'], …)` 形式消费背景服务（`ui-theme` 的 Host 半是可选消费的规范示例；代码库没有 `optional: true` 注入），因此没有该插件时布局行为不变。

Host 半的 `tapIndex` 变换镜像 `injectBootTheme`：在宿主侧经 `settings.get` 读 `ui-background` 节，把图片 id 解析为 `/backgrounds/<id>`，并插入一小段设置这三个变量的 `<style>`，使刷新时首帧即现背景。运行期 `BackgroundPresenter`——位于 `ui-layout`，与 `theme-presenter.ts` 并列——按 `ctx.background` 快照写同样三个变量，并在 `background/change` 与 `theme/change` 时重应用（预设变体按配色区分）。

## 设置界面

由插件客户端半注册一个新的 `settings.section`（id `background`、order 5、标签 zh 背景 / en Background），沿用 `ui-agent-preset` 的整页分区模式。分区包含：偏好卡片（无 / 预设 / 图片）、按注册表 CSS 值渲染的预设缩略图、上传控件（文件选择 → `ctx.background.uploadImage(file)` → 自动选中）、当前图片预览与移除操作、遮罩浓度滑杆。文案经 `ctx.locale.register` 注册 zh/en，与其他客户端插件一致。

## 失败行为

- 无效设置——未知预设 id、悬空图片 id、配对残缺——响亮失败：schema 校验拒绝写入，设置分区呈现错误态而非静默回退。
- 上传失败在分区内呈现；存储未接受字节前不写任何设置。
- 存储图片不再可解析（被手工清理）时，按未设背景渲染并在分区给出错误态，页面不破损。

## 测试计划

镜像 `ui-theme` 的套件结构：客户端 apply 装配（服务提供、分区槽注册、设置同步、HMR 塌缩恢复）；jsdom 下的分区组件行为（偏好切换、以桩 fetch 上传、遮罩浓度）；`node:vm` 下逐偏好的启动注入；Host apply（命名空间注册与销毁、以桩 `attachments`/`webServer` 验证路由处理器、index 变换）；运行时服务（快照、校验、revision 守卫、theme 变更重应用）；设置 store；以及断言 AppFrame 以回退值消费三个变量的 CSS 契约测试。产品用户可见行为按测试政策随真实可运行示例附带 keyless 快照；快照骨架缺设置界面支持时，骨架支持随同一变更落地。`test:coverage` 保持逐文件 100%。

## 已考虑的备选方案

- **扩展 `ui-theme` 而非新包。** theme 服务拥有配色令牌；上传路由、持久存储与选择分区不是 theme 职责，并入会让一个聚焦插件膨胀。否决。
- **把图片字节存进设置（data URL）。** `settings.yaml` 是带 revision 守卫的小型配置文档；数兆的 base64 值让每次写入与评审都嘈杂。否决，改为不透明 id 加字节路由。
- **为上传新增 typert RPC 方法。** 为一个二进制 POST 让 `/api` typert 面增长。webServer 前缀路由镜像现有 `/plugins` 路由且不增加协议面。否决 RPC 形式。
- **专用 `$DSH_HOME/backgrounds` 存储。** 附件存储已提供经校验、内容寻址、持久的图片存储；复用删除自有代码与测试。否决第二套存储。

## 验收标准

- 默认设置下客户端渲染与今天完全一致：不可见背景层，纯色 `--dsw-alias-bg-base` 页面。
- 选中预设或上传图片后立即在会话区背后呈现，刷新无闪烁地保留，并持久化于 `$DSH_HOME/settings.yaml` 的 `ui-background` 下。
- 上传字节落入附件存储；设置只保存 `{ id, mediaType }`；`GET /backgrounds/<id>` 可取回；超限或不支持的上传以可见错误失败且不写任何内容。
- 遮罩浓度实时生效；亮暗切换无需改设置即跟随。
- 移除背景（preference 置 `none`）恢复纯色页面。
- 拥有该面的门禁通过：包测试与覆盖率、按政策的快照、覆盖本笔记与包文档的 `doc-sync`、lint 与 hygiene。

## 风险

- V1 不回收被替换的图片；孤儿存储对象会累积，受上传大小上限约束。回收是存储缝上的后续工作。
- 复杂图片上的可读性只依赖一个标量遮罩；没有分区或自动对比度适配。若不足，后续方向是分区半透明而非更多标量。
- 启动变换在渲染 index HTML 时读设置；写入与刷新竞态可能让旧背景再出现一次——与 `ui-theme` 启动注入已接受的窗口相同。
- `POST /backgrounds` 是 `/api` 之外的第二个非 RPC 写入面；它必须继承该面的鉴权检查，或 loopback 威胁模型明确覆盖它——实现时核实，不默认假设。
- 实现前的未决产品决策：最终预设清单、遮罩默认值（暂定 45）、分区顺序（暂定 5）。
