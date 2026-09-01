# 路径二实施计划：以 aqua 为主导合并玻璃主题与持久化背景

## 目标与架构

把 [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin) v1.3.0（`@deepseek-ai/dsh-client-ui-aqua`，MIT）收编为仓库一等公民包 `packages/client/ui-aqua`，作为主导视觉系统：玻璃令牌、流体背景、壁纸渲染全部由它负责；持久化从 localStorage/IndexedDB 重接到仓库持久缝（settings.yaml + 附件存储 + HTTP 路由）；**删除 `ui-background` 包**，其上传路由/命名空间迁入 ui-aqua 的 Host 半；背景层/面纱/预设等旧呈现全部退役。

收编位置选 `packages/client/` 而非 `vendor/`（vendor/ 范围是 cordis 框架库；上游 build.ps1 本身就是在 `deepseek-harness/packages/client/ui-aqua` 里开发的，包名/结构/peer 依赖 `0.1.0-rc.5` 完全对齐）。这是永久性吸收（fork-and-own），上游出处（仓库 URL、tag v1.3.0、commit SHA）记录在包 README 与 Agent Note。

## 任务分解（按提交切分）

### 1. `feat(attachment)`: 视频能力缝
- `packages/attachment/attachment/src`：新增 `VideoMediaType = 'video/mp4' | 'video/webm' | 'video/ogg'`、`VideoAttachmentLimits = { maxVideoBytes, mediaTypes }`、`VideoAttachmentRef = { attachmentId, mediaType, bytes }`（无 width/height——视频不做解码探元，与图片 ref 的对称差异在 JSDoc 说明）；`AttachmentStore` 增加 `abstract readonly videoLimits`、`abstract saveVideo/readVideo`。
- `packages/attachment/attachment-local/src`：实现 saveVideo（魔数嗅探：mp4 `ftyp`、webm EBML `1A45DFA3`、ogg `OggS` + 字节上限）、readVideo；`Config` 新增 `maxVideoBytes`（默认 32 MiB，可从 cordis.yml 覆盖），`videoMediaTypes` 冻结列表（镜像图片线）。
- `packages/host/apiproxy/src/api-proxy.ts`：`imageLimits` 会话投影旁追加 `videoLimits` 投影。
- 测试：provider 规格（嗅探通过/拒绝、上限、读取、内容寻址幂等）。

### 2. `feat(client/ui-aqua)`: 吸收上游 v1.3.0（先让它"原样跑起来"）
- 源码从本机已装的 v1.3.0 副本（`~/.dsh/plugins/@deepseek-ai/dsh-client-ui-aqua/src`）拷入 `packages/client/ui-aqua/src`；保留 `LICENSE`（MIT + 上游版权）；删除两个死模块（`wordmark-badge.ts`、`greetings.ts`，上游未引用）。
- 按 `packages/client/AGENTS.md` 新包清单打包：package.json（`dsh.client` 块：inject 增补 `connection/remote/settingsScope`，platform web）、tsconfig（extends base.client + 逐依赖 references）、tsdown.config（`clientBundle` 预设）、`css-modules.d.ts`、`src/index.ts` 空 Host apply、`src/invariant.ts`（重写注释为合并后契约）、README 三件套（含 Model Experience 节 + 上游出处 + 字体内嵌署名）。
- 注册面：`tsconfig.base.json` paths、`tsconfig.client.json` references、knip 条目（tsx entry）、`vitest.config.ts` 覆盖豁免清单加 `packages/client/ui-aqua/src/*`（GUI-debt 豁免，与 ui-layout/ui-conversation 同一 rationale 注释）、`packages/bundle/web-app/package.json` 依赖 + `cordis.patch.yml` 双行（Host 行带 `inject: [webServer]` + `trustedHosts`，镜像 ui-background 现有行；浏览器行排 ui-theme 之后）、`apps/web/tests/assembled-boot.ts` 模块表行、`packages/host/apiproxy` 的 `WEB_SETTINGS_NAMESPACES` 加 `'ui-aqua'`。
- 本提交末态：插件按上游逻辑（localStorage）在仓库构建里可跑（`pnpm --filter ... bundle` + 起 `dsh web` 目检）。

### 3. `feat(client/ui-aqua)`: 持久化重接（核心）
- **Host 半** `src/index.ts`：注册 `ui-aqua` 命名空间（schema：`enabled` + aqua 17 个旋钮平铺字段 + `background: 'fluid'|'wallpaper'` + `wallpaper?: ImageAttachmentRef | VideoAttachmentRef`，默认值取上游 `SETTINGS_DEFAULTS`）；`/backgrounds` 路由从 ui-background 吸收并扩展——POST 按声明 content-type 分流图片/视频准入（415/413/422 各分支）、GET current 按 ref 的 mediaType 服务，补单区间 `Range` 支持（206/Content-Range，供 `<video>` 拖动），保留 ETag/no-cache/304；boot `tapIndex`：enabled 时注入 `<style>`（从 `AQUA_TOKEN_OVERRIDES`±compat 生成 body + `body[data-ds-dark-theme]` 双配色令牌）+ 微脚本设 `data-dsh-aqua`/模式属性，消灭刷新闪白。
- **客户端持久化门面**：`AquaLayer` 的 localStorage 读写（~24 处）与 `storage` 跨页签监听替换为 settingsScope 支撑的 `AquaRuntime`（模式镜像 `BackgroundRuntime`：setter → `scope.set(field, value)` 平铺字段 + 乐观本地应用；跨页签由 `settings/document-updated` 远端失效天然获得）；`enabled` 成为持久字段（Plugins 卡片开关写 scope）。
- **壁纸管线重接**：图片走上游现有"降采样→JPEG→POST /backgrounds"流程但上传到服务端（ref 入 settings，弃 data-URL 本地存储）；视频在所有平台用普通 `<input type=file">` 选择→POST（**弃** Chromium 专属 `showOpenFilePicker`/FSA 句柄/IndexedDB blob——持久路由本身就是"记住路径"）；渲染统一 `img/video.src = '/backgrounds/current'`（ETag 随内容切换）；删除 `wallpaper-store.ts` 与 `idb:`/`fsa:` 标记协议及对象 URL 生命周期中已死分支。
- **一次性迁移**：命名空间为空且存在 `dsh.ui-aqua.*` localStorage 键时，把旋钮/enabled 迁入 settings 并清理本地键（对现有用户即你本人）。
- 测试：Host 规格（命名空间注册、路由图片/视频/RANGE/ETag 分支、boot 变换）、runtime 规格（写路径、采纳、revision 守卫、迁移、上传链 stub fetch）、layer 状态机规格（mount/unmount 属性与变量、经桩 theme 服务的令牌覆盖注册/撤除）、store 镜像规格、组件规格（选择器→上传链、开关）。

### 4. `refactor(web)`: 退役 ui-background 与旧背景呈现
- 删除 `packages/client/ui-background` 整包；连带移除：`WEB_SETTINGS_NAMESPACES` 的 `'ui-background'` 行、web-app 依赖与 patch 行、assembled-boot 行、config-catalog 双语行、cordis-client-runner slot-catalog 的 BackgroundSection 行。
- 还原消费面：`ui-layout/AppFrame.tsx|.module.css`（去 `.backdrop`/`.scrim` 层，frame 应回 `--dsw-alias-bg-base`）、`ui-conversation` ConversationRoot 平面基色 + ChatView `.column` 去面纱、`packages/client/web` base.css/AppRoot 还原、删 `backdrop-layers`/`backdrop-veil`/`boot-background` 规格。
- 你的星空图已在附件存储中（内容寻址），合并后在 aqua 面板重选即复用同一对象（sha 相同自动去重）。

### 5. `test(web)+docs`: e2e 旅程与文档
- `apps/web/tests/background-settings.e2e.ts` 重写为 aqua 旅程：种子转录（沿用 POSIX 首行 cwd 技巧）→ General→Appearance 调旋钮→**reload 后仍生效**（持久性断言）→文件选择器上传测试图（Playwright `setInputFiles`）→断言 `/backgrounds` 入库与 `img src`→Plugins 主开关关→html 属性与令牌覆盖完整撤除；重录金图 `section.expected.md`（或新目录）。测试字节用代码内生成的魔数合法小文件，不落二进制 fixture。
- 文档：ui-aqua README 三件套、新 Agent Note（`2026-08-17-aqua-glass-theme-merge.md` + zh + i18n，记录架构、决策、上游出处与"视频=扩展附件缝"的取舍）、旧 Note `2026-08-15-web-client-background.md` 加 superseded 指针、`verify-translation-pairing --write` 重录、attachment 包 README 增补视频线。

### 6. 部署收尾与端到端验证
- **移除路径一产物**（否则 bundle 与 profile 双注册同 id 冲突）：删 `~/.dsh/profiles/web/cordis.patch.yml` 的 ui-aqua insert 行 + `profiles/node_modules/@deepseek-ai/dsh-client-ui-aqua` junction（`~/.dsh/plugins` 源目录可留作参考）。
- 验证链：`pnpm install` → `pnpm run typecheck` → `pnpm run build` → 聚焦单测（attachment×2、ui-aqua、ui-layout、ui-conversation）→ `pnpm run hygiene`（knip/publint/constraints/cordis-config/vendored-links）→ `pnpm run test:web:built apps/web/tests/...e2e` → 重启 `dsh web` 实拍：玻璃+流体、上传星空图与一段视频为壁纸、**重启浏览器后偏好与壁纸仍在**（对照迁移）、主开关完整还原原生、控制台零报错。

## 风险与对策
- **上游 CSS 用 `[class*='sidebarCol']` 子串选择器 + seam-stamper 盖属性**——对类名重命名脆弱；吸收后属于我方代码，e2e 目检覆盖，后续可渐进替换为正式 seam。
- **永久分叉**：不再跟随上游更新；README/Note 记录出处基线（v1.3.0 + commit SHA）。
- **coverage 豁免**：ui-aqua 整包走既有 GUI-debt 豁免（先例充分）；重接的 Host/runtime 逻辑全测。
- **Windows 本地**：e2e 沿用已验证的 fixture 首行 POSIX cwd 规避。

## 交付形态
`feat/web-client-background` 分支上 5 个提交（attachment 视频缝 → 吸收 → 持久化重接 → 退役旧呈现 → e2e+docs），不自动 push；完成后给出实测截图与验证命令清单。
