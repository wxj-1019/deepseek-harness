# Agent Note: Aqua 玻璃主题合并到持久缝

Status: implemented

[English](2026-08-17-aqua-glass-theme-merge.md) | 中文

## 问题

第一版背景特性落地（[2026-08-15-web-client-background](2026-08-15-web-client-background.md)）后，与第三方玻璃主题 [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin) 的并行试用给出了产品答案：aqua 系统——磨砂表面、WebGL 流体背景、视频壁纸——主导，树内的平涂面纱呈现不是用户想要的样子。但 aqua 把所有偏好存浏览器本地（localStorage 旋钮、IndexedDB blob、Chromium File System Access 句柄）：浏览器重置即丢、不跟随账户、也没有可编程的缝。

## 决策

第三方玻璃主题 [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin) v1.3.0（MIT）被吸收为 `packages/client/ui-aqua` 并成为主导视觉系统；第一版 `ui-background` 包退役。aqua 的浏览器本地持久化（localStorage 旋钮、IndexedDB 壁纸 blob、Chromium File System Access 句柄）重接到 harness 缝上：

- 所有旋钮与总开关持久化在 `ui-aqua` 设置命名空间（平铺标量字段，schemastery 以出厂默认值校验；跨页签切换以设置失效的形式到达）。
- 壁纸经 `/backgrounds` 上传（同源栅栏、图片限额或新的视频限额、ETag 重校验、供 `<video>` 拖动的单区间字节服务）进入附件存储，并从 `/backgrounds/current?v=<attachmentId>` 渲染——浏览器中不存任何媒体字节。
- boot `tapIndex` 变换在客户端树激活前画出当前模式的双配色令牌覆盖与 `data-dsh-aqua`/模式属性，消除刷新时的玻璃闪白。
- 一次性迁移在首次运行时采纳上游的 localStorage 旋钮，并上传其 data-URL 壁纸；不支持的旧壁纸标记回退到流体背景。
- 主题层降级为纯应用器；被吸收代码中 Chromium 专属的 FSA/IndexedDB 路径与两个死模块删除。

附件缝为此新增视频准入：`AttachmentStore` 上的 `saveVideo`/`readVideo`/`videoLimits`，容器魔数嗅探（MP4 `ftyp`、WebM EBML、Ogg）加可配置字节上限。视频引用不携带内在尺寸——存储不拥有解复用器，准入只证明容器格式良好，不证明流可解码。

## 决策

上游插件不提供 cordis 服务，状态存浏览器本地存储，运行时桥接只能戳它的 DOM 内部——无契约的脆弱耦合。吸收源码（上游本就通过拷贝进 harness checkout 的 `packages/client/ui-aqua` 开发；peer 依赖与 `0.1.0-rc.5` 对齐）让合并只有一个所有者、一条持久化主线，并纳入仓库自身的门禁。放在 `packages/client/` 而非 `vendor/` 遵循 vendor/ 声明的 Cordis 框架范围；出处记录在包 README 与 LICENSE。

## 已考虑的备选方案

- **用户 profile 之下的运行时组合（路径一）。** 经 profile 补丁层安装上游插件、让树内特性闲置。作为终态被否决：插件不提供服务缝、状态存浏览器本地，运行时桥接只能戳其 DOM 内部——无契约的耦合。
- **把插件 vendor 进 `vendor/`。** 否决：vendor/ 声明的范围是 Cordis 框架层；客户端插件需要客户端打包管线，并与仅 Host 的 vendoring 图、以 upstream 名义重新发布 release 成员相冲突。
- **只吸收渲染思路进树内特性。** 否决：这等于手工重实现一个 4.6k 行的维护中主题，且仍欠一次持久化重接；用户已选上游系统为主导。

## 后果

- 仓库持有一份永久分叉：上游更新以手工方式采纳，基线记录为 v1.3.0。
- 被吸收的渲染引擎（WebGL 流体、画布鲸鱼/网格、聚光灯、盖缝器）保留上游代码，享包级 `noUncheckedIndexedAccess: false` 例外与仓库级 GUI-debt 覆盖豁免；重接的持久化缝（Host 半、运行时、层状态机、store、组件）带完整规格，e2e 旅程钉住启动绘制、持久模式切换、壁纸上传/重载与总开关撤除。
- 被吸收的样式表通过 `[class*=…]` 子串选择器与盖缝 MutationObserver 寻址原生表面；兄弟包的重命名可能需要在这里跟进。
- 被退役 `ui-background` 命名空间的用户只损失偏好本身：已存图片保留在内容寻址的附件存储中，可在 aqua 下重选。
