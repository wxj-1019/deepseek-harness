# Agent Note: Web 客户端的用户自定义背景

Status: implemented

[English](2026-08-15-web-client-background.md) | 中文

## 问题

Web 客户端只渲染一层纯色页面背景：`body` 与 AppFrame 根节点都刷 `--dsw-alias-bg-base`（`packages/client/web/src/base.css`、`packages/client/ui-layout/src/client/AppFrame.module.css`），客户端里没有任何壁纸或背景概念。theme 插件拥有配色偏好（亮色/暗色/跟随系统），但用户无法个性化会话区背后的空间。

长期使用的聊天工作台是放个人背景的合理场合：用户选一张图片或一个内置渐变，客户端带可读性遮罩渲染在会话区背后，且选择在刷新后保留。持久偏好链路已经存在（`settingsScope` → settings RPC → `$DSH_HOME/settings.yaml`），缺的是背景偏好本身、图片字节的上传通路，以及布局里的渲染面。

## 决策

规划与实现期间修订：以 `/backgrounds/current` + ETag 重校验替代 `GET /backgrounds/<id>`；presenter 归入 `ui-background`；上传准入复用 `ctx.attachments.imageLimits`；两条路由方法都携带完整的 `/api` 信任栅栏；HEAD 应答当前图片路由；显式 null 图片处理加固路由；设置分区的可用性探测在实现期间一度反转，现已修复。

`ui-background` 客户端插件——新包 `packages/client/ui-background`（`@deepseek-ai/dsh-client-ui-background`）——镜像 `ui-theme` 的双半结构并完整拥有该特性：

- 持久设置命名空间 `ui-background`（见下方 schema），经现有 settings capability 持久化；
- 上传路由：`/backgrounds`——POST 经现有 `attachments` 内容寻址存储落一张图并应答其引用，`GET /backgrounds/current` 返回当前图片——因此 settings 只保存内容寻址引用，绝不保存图片字节；
- 一个带 `background/change` 事件的 `ctx.background` 客户端服务；`ui-layout` 在 AppFrame 增加惰性的背景层与遮罩层，但绝不消费该服务；
- 镜像 `injectBootTheme` 的启动期 index 变换，让背景首帧即现、无闪烁；
- 一个背景设置分区，含预设缩略图、图片上传与遮罩浓度滑杆。

范围为 无 / 内置预设 / 一张上传图片。URL 粘贴图片、按工作区区分背景、动效背景、侧栏半透明、替换图片的垃圾回收均不在范围内。

## 设置模型

命名空间 `ui-background`，扁平字段如 `ui-theme`，一个判别标签用于 switch：

```ts ignore-check
interface BackgroundSettings {
  /** Active background kind. */
  preference: 'none' | 'preset' | 'image'
  /** Preset id; read only while the preference is `preset`. */
  preset?: string
  /** Stored-image reference; read only while the preference is `image`. An explicit `null` counts as missing. */
  image?: BackgroundImageRef
  /** Scrim strength over the background, 0-90 percent. */
  dimming: number
}
```

schemastery schema 在设置边界解析默认值（`none`、遮罩 45）并校验每次写入；以 union 包裹的 `image` 成员不携带默认值，因此缺失的图片在解析后仍是 undefined，而手工编辑出的显式 `null` 解析为 null——路由与解析都把它视为缺失。运行时 setter（`setNone`/`setPreset`/`setImage`/`setDimming`）各自在 scope 写入前校验（`setPreset` 对未注册 id 抛错）并发出 `background/change`；连续同步走 settings scope 采纳。消费方经 `resolveBackdrop` 对 `preference` switch，并按闭合联合约定在 default 走 `assertNever`。预设是固定导出的注册表（`aurora`/`dusk`/`mist`）：`id` 与 `{ light, dark }` 两份 CSS `background-image` 值（两种模式必填，与 theme 覆盖约定一致）；标签来自 `settings.background` locale 键（`preset.<id>`）。`dimming` 默认 45。

## 存储与上传路由

Host 半复用现有附件存储（`ctx.attachments` 的 `saveImage`/`readImage`；对象按内容寻址落盘）而不是自建第二套存储，并注册一条 webServer 前缀路由 `/backgrounds`，与 client-modules 的 `/plugins` 路由同构。该路由只在 webServer、attachments、settings 三项服务全部组合时才存在；缺了任何一项的组合在加载时失败，而不是降级路由。

- `POST /backgrounds` —— 原始图片字节，媒体类型在 `Content-Type`。准入复用 `ctx.attachments.imageLimits`，因此统管聊天图片的同一份部署策略同时决定接受的媒体类型与字节上限。声明的 content-length 超限时在读取任何字节前即拒绝（413）；分块传输的请求体在流式读取中受上限约束。`saveImage` 校验字节并应答存储引用 `{ attachmentId, mediaType, bytes, width, height }`。失败——超限、媒体类型不支持、存储拒绝——映射为 4xx，并在设置分区以可见错误呈现。
- `GET /backgrounds/current` —— 返回当前存储图片；`HEAD` 应答同一路由（设置分区的悬空引用探测）。处理器经 `settings.get` 读 `ui-background` 节，把缺失或显式 null 的图片引用判为 404（`== null` 存在性判断，手工编辑的设置文档无法让路由崩溃）。响应携带存储的媒体类型、以内容地址为值的 ETag 与 `cache-control: no-cache`：切换背景时立即画出新图片，未变化的刷新则以精确的单 ETag `if-none-match` 匹配重校验为 304。存储对象已不存在的引用应答 404。

路由注册走 `ctx.effect`（返回的清理器负责移除）。上传与读取的鉴权是经 `@deepseek-ai/dsh-client-connection/trust` 子路径的完整 `/api` 浏览器信任栅栏——`isTrustedApiRequest` 施加于 `/api` 的同一组 Host/Origin/Fetch-Metadata 检查，两条方法都用，因此被重绑的 DNS 名、跨站标记或外来 Origin 既不能写入也不能读取背景。Host 行的 `trustedHosts` 配置镜像 connection 行的列表（组合以同一方式派生）；每个条目在加载时校验，缺省即仅回环——单机部署的安全默认。

## 渲染管线

四个 body 级 CSS 变量是唯一机制；启动变换与运行时 presenter 只写变量，样式表以惰性默认值消费：

- `--dsw-specific-backdrop-image` —— 存储图片的 `url(...)` 或预设渐变；未设即无。
- `--dsw-specific-backdrop-scrim` —— `color-mix(in srgb, var(--dsw-alias-bg-base) <dimming>%, transparent)`；对活令牌求值使遮罩自动跟随亮暗。
- `--dsw-specific-backdrop-veil` —— `color-mix(in srgb, var(--dsw-alias-bg-base) 80%, transparent)`；内容列在背景激活时绘制的固定半透明基色填充。聊天转录列（`ChatView` 的 `.column`，以 box-shadow 外扩 16px，使正文不贴面纱边缘）以 `var(--dsw-alias-bg-base)` 为回退值消费它：裸 markdown 正文保有可读底衬，而滚动器两侧留白、头部与首屏继续透出背景。面纱按设计不随遮罩浓度滑杆变化——繁忙图片上的可读性是底线，不是第二个用户可调标量。
- `--dsw-specific-backdrop-surface` —— 背景生效时为 `transparent`；否则未设。

`ui-layout` 在 AppFrame 堆叠序底部渲染两个惰性层（`position: absolute; inset: 0; pointer-events: none`，z-index −2 图片、−1 遮罩），并把 AppFrame 根与启动页的涂刷改为 `background: var(--dsw-specific-backdrop-surface, var(--dsw-alias-bg-base))`；`ui-conversation` 的 ConversationRoot 消费同一 surface 变量，使转录列透出图层而非以平面基色盖住。组件填充——卡片、气泡、菜单——保留各自令牌并保持不透明；侧栏保留实心填充。`ui-layout` 绝不消费背景服务——它对该包没有任何依赖——因此没有该插件时布局行为不变。

Host 半的 `tapIndex` 变换镜像 `injectBootTheme`：在宿主侧经 `settings.get` 读 `ui-background` 节（没有 settings provider 时用默认值），并在 `</head>` 前插入一小段设置这四个变量的 `<style>`，使刷新时首帧即现背景。`backdropVarsCss` 是双方调用者共享的唯一来源。运行期 `BackgroundPresenter`——位于 `ui-background`，拥有 head 中的一个 style 元素，随插件 fiber 一并销毁——按 `ctx.background` 快照写同样四个变量；预设以 `body` + `body[data-ds-dark-theme]` 一对规则同时携带两种配色模式，因此无需 theme 订阅或 `theme/change` 重应用，`none`/无效节则撤下该元素，让惰性默认值接管。

## 设置界面

由插件客户端半注册一个 `settings.section`（id `background`、order 5、标签 zh 背景 / en Background）——该特性拥有自己的设置面。分区包含：偏好卡片（无 / 预设 / 图片）、按注册表 CSS 值渲染为双配色分屏色块的预设缩略图、上传控件（文件选择 → `ctx.background.uploadImage(file)` → 自动选中）、当前图片预览与移除操作、遮罩浓度滑杆。无效背景（未知预设 id、缺失图片引用）渲染错误横幅；对 `/backgrounds/current` 的 HEAD 探测驱动悬空图片错误行。文案经 `ctx.locale.register` 注册 zh/en，与其他客户端插件一致。

## 失败行为

- 无效设置——未知预设 id、悬空图片引用、配对残缺——响亮失败：schema 在设置边界拒绝写入，`resolveBackdrop` 给出 `invalid` 判定，设置分区渲染错误横幅，presenter 撤下变量让惰性默认值接管，而不是静默回退。
- 上传失败在分区内呈现；存储未接受字节前不写任何设置。
- 存储图片不再可解析（被手工清理）时不画图片——路由 404——并在分区给出错误态，页面不破损。

## 测试

包套件镜像 `ui-theme` 的：客户端 apply 装配（服务提供、分区槽注册、设置同步）、jsdom 下的分区组件行为（偏好切换、以桩 fetch 上传、遮罩浓度）、`node:vm` 下逐偏好的启动注入、Host apply（命名空间注册与销毁、以桩 `attachments`/`webServer` 验证路由处理器、index 变换）、运行时服务（快照、校验、revision 守卫）、设置 store，以及断言 AppFrame 以回退值消费变量、聊天转录列以不透明回退绘制面纱的 CSS 契约测试。产品用户可见面在 web 应用的快照套件中随 keyless `background-settings` 快照发布——旅程播种一段转录，并钉住预设生效时面纱在场、不随遮罩浓度滑杆变化、选无后回退平面基色；该包 `test:coverage` 保持逐文件 100%。

## 已考虑的备选方案

- **扩展 `ui-theme` 而非新包。** theme 服务拥有配色令牌；上传路由、持久存储与选择分区不是 theme 职责，并入会让一个聚焦插件膨胀。否决。
- **把图片字节存进设置（data URL）。** `settings.yaml` 是带 revision 守卫的小型配置文档；数兆的 base64 值让每次写入与评审都嘈杂。否决，改为不透明 id 加字节路由。
- **为上传新增 typert RPC 方法。** 为一个二进制 POST 让 `/api` typert 面增长。webServer 前缀路由镜像现有 `/plugins` 路由且不增加协议面。否决 RPC 形式。
- **专用 `$DSH_HOME/backgrounds` 存储。** 附件存储已提供经校验、内容寻址、持久的图片存储；复用删除自有代码与测试。否决第二套存储。

## 后果

- **已取代（2026-08-17）：** 玻璃主题合并把本特性的数据面并入 `packages/client/ui-aqua` 并退役了该包——现行架构见 [2026-08-17-aqua-glass-theme-merge](2026-08-17-aqua-glass-theme-merge.md)。

- 持久偏好刷新后无闪烁保留：启动变换在首帧画出该节，presenter 在激活后接管同一组变量，两者共享同一个 `backdropVarsCss` 来源。
- 变量契约让 `ui-layout` 在没有该插件时依然正确——它渲染惰性图层，绝不消费背景服务——也让聊天列以同样方式正确：没有该插件时，面纱回退为平面基色令牌。
- 上传准入复用 `ctx.attachments.imageLimits`，一份部署策略统管聊天图片与背景，settings 只保存内容寻址引用。
- 两条 `/backgrounds` 方法都携带完整的 `/api` 信任栅栏，以对齐而非单独的威胁模型解决第二写入面风险。
- 被替换的图片不做垃圾回收；孤立的存储对象会累积，但受上传大小上限约束。回收是存储缝上的后续工作。
- 复杂图片上的可读性依赖遮罩加转录列背后固定的分区面纱；没有自动对比度适配。面纱在首个构建显示出裸正文被 5% 遮罩的图片淹没后落地——正是初版暂缓的分区跟进，且保持零新增标量。
- 启动变换在渲染 index HTML 时读设置；写入与刷新竞态可能让旧背景再出现一次——与 `ui-theme` 启动注入已接受的窗口相同。
