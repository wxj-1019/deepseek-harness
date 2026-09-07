# Agent Note: 组件库 story——画廊中的实时预览

Status: implemented

[English](2026-09-06-component-library-stories-live-preview.md) | 中文

## Problem

组件库画廊此前只展示每个已学习组件的契约——props、令牌与作为文本的用法示例。用户希望得到 react-bits 式的体验：看到组件本身，而不只是它的描述。这些组件是 harness 自身的应用组件，依赖运行时 props（会话/工作区 hooks、settings scope、locale 座位），因此在它们的活跃界面之外没有任何东西渲染过它们。

## Decision

一套仓库 story 约定加构建管线，不引入 Storybook：

- **Story 约定**——`packages/client/<pkg>/tests/stories/<Component>.stories.tsx` 导出 `story = { record: '<包目录>/<组件名>', mount(container) }`。`mount` 用手工喂的假 props 渲染真实组件——正是同包 spec 的工厂（fakeScope、fake remote、unused-hook 标准件），story 与 spec 共享同一套心智模型。Story 放在 `tests/` 下：在 src 的 100% 覆盖率门之外，也在两条 client bundle 通道之外。
- **构建管线**——`apps/web/vite.config.ts` 新增 `componentStories()` 插件：扫描 `packages/client/*/tests/stories/`，提供 `virtual:component-stories`（按 record id 的懒加载映射，每个 story 一个按需 chunk），增加 `stories` Vite 入口（`src/stories-entry.ts` 注册 `window.__DSH_STORIES__`），并把入口的 script 标签拼进构建出的 `dist/index.html`——与 preview 界面确立的「第二入口 + 页面拼接」技法相同。
- **画廊预览面板**——组件库画廊检查 `window.__DSH_STORIES__.has(record.id)`，在错误边界内挂载 story（崩溃的 story 永远拖不垮画廊），在切换行与卸载时运行 story 的 disposer。随包附带两个种子 story：McpCard（在内存 scope 上可交互）与组件库卡片自身。

## Alternatives considered

- **浏览器化 SlotTestRuntime**——它的配方（真 Context + 假 sessions/workspaces + 真渲染器）是槽位锚定组件的北极星，但它绑死 jsdom/@testing-library。V1 的 story 直接手工喂完整 props；运行时配方未来可以支撑槽位锚定的预览模式，而不改动 story 约定。
- **独立 /gallery.html 页面**——第二页面的技法存在（preview.html），但 V1 把画廊留在应用内：数据控制器、搜索与审核都在那里。独立页面是容易的后续项（第二入口 + emit，共享 chunk）。
- **扫描器感知 stories**——V1 纯靠客户端声明的 `story.record` id 把 story 关联到记录；让扫描器识别只会多一个徽标。

## Consequences

- 为组件写预览意味着写一个 story 文件；假 props 在组件的 spec 里已经存在。
- Story 是由 apps/web 构建编译的仓库工件：新增或删除需要重跑 `pnpm run build` 以重排 stories 入口；修改 story 内容经 vite watch 车道热更。
- Story 的 React 拷贝与应用的相互独立（隔离子树，无共享元素）——对预览可接受，对稳定性是关键。
