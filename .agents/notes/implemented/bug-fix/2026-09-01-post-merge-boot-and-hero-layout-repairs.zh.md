# Agent Note：合并后修复批次——settings 兼容导出、remote 注入授权、heroGlow 大括号、index no-store

Status: implemented

[English](2026-09-01-post-merge-boot-and-hero-layout-repairs.md) | 中文

## 问题

rc.8 上游合并（[漂移修复](../architecture/2026-09-01-upstream-merge-api-drift-repair.zh.md)）留下了四个互相独立的缺陷，它们在修复提交之后才在本 fork 的运行时暴露：Web 面启动失败、MCP 设置卡片加载失败、空白会话 hero 顶部对齐而非垂直居中、重建后的客户端 bundle 无法到达正在刷新的浏览器。

- **第三方插件钉死了被移除的 `settingsNamespace` 辅助函数。** 漂移修复把一方调用方迁移到了纯字符串，但捆绑的第三方插件（`dsh-better-sidebar`、`@yeesy369/dsh-web-permission`）的所有已发布版本都从 `@deepseek-ai/dsh-settings` 导入 `settingsNamespace`；loader 拒绝了这两个条目，启动直接死亡。升级无济于事——最新发布版本仍带同样的导入。
- **`ui-settings-mcp` 访问 `ctx.remote` 却没有声明。** 客户端 loader 按插件的 `inject` 列表授予服务；MCP 卡片的控制器消费 `Pick<ClientRemote, 'settings'>`，但其 `inject` 数组漏掉了 `remote`，条目以 `cannot get property "remote" without inject` 失败。
- **合并丢失的闭合大括号让 hero 布局规则整体沉默。** 解决冲突后的 `ConversationRoot.module.css` 丢了闭合 `.heroGlow` 的 `}`（连同它的两条声明）。CSS 嵌套随后吞掉了其后所有规则——`.heroWorkspaceRow`、`.root[data-phase='hero'] .scrollBody { justify-content: center }`、settling 规则——全部变成 `.heroGlow` 下匹配不到任何元素的后代选择器。空白会话的输入框渲染在满高滚动区的顶部，下方是一大片空白；失败是静默的，因为不平衡但可解析的 CSS 依然会加载。
- **渲染的 index 没有缓存策略。** 它内嵌当前客户端 bundle 的 rev，响应却不带 `Cache-Control`，浏览器的启发式缓存让重建后仍在供应旧花名册，刷新看起来毫无效果。

## 决策

- **`dsh-settings` 重新导出 `settingsNamespace`。** 该导出是现有内部 `parseSettingsNamespace` 的别名——与被移除的辅助函数执行同样的校验。一方代码继续传纯字符串；这个辅助函数的存在只为让被钉住的第三方插件能启动。已否决：逐个补丁第三方插件（维护成本更高，升级即失效）和从 bundle 中移除这些行（失去 fork 交付的功能）。
- **`ui-settings-mcp` 在客户端 `inject` 中声明 `'remote'` 和 `'remote.settings'`**，与同族包"裸授权 + 只授予本包消费的那一个作用域子键"的模式一致。
- **`.heroGlow` 按合并前的 fork 文件逐字闭合恢复**（含 `position: absolute`、`pointer-events: none`）。诊断过程中添加的 hero 根填充规则（`.root[data-phase='hero'] { flex: 1 1 auto; min-height: 0; overflow: hidden }`，与 active 态一致）予以保留：它让 hero 不再依赖 html/body/#root 高度链，正如 active 态早已如此。
- **`frontend-static` 以 `cache-control: no-store` 供应渲染的 index。** 哈希化的静态资源保持可缓存；只有内嵌 rev 的 index 被强制取新。

## 已否决的替代方案

- **在 node_modules 里给第三方插件打补丁** —— 否决：三个包 × 未来每次升级都要手工重打补丁；一行兼容导出彻底消灭这份维护。
- **从 web-app bundle 移除浏览器相关行** —— 否决：那会静默移除 fork 交付的浏览器自动化与 better-sidebar 功能，而一个纯增量的导出就能修掉启动错误。
- **只授予 'remote.settings' 不授予裸 'remote'** —— 暂不采纳：同族包都是两者都授，在没有作用域路径的 loader 测试前收窄授权，可能只是一个启动错误换成另一个。
- **仅靠读源码诊断 hero 布局** —— 在两次修错之后否决：CSS module 的打包、嵌套与级联顺序让读源码在这个面上不可靠；CDP 计算样式审计几分钟就找到了丢失的大括号。

## 验证

- `settings` 套件 94 个测试通过，含两条新增的 `settingsNamespace` 用例。
- 所服务的 `ui-conversation` bundle 包含修复后的规则；用 CDP 驱动无头 Edge 访问运行中的服务器，实测 `[data-conversation-scroll]` 上 `justify-content: center` 已生效，且 composer 座席在 hero 中垂直居中。

## 后果

- 导入 `settingsNamespace` 的第三方插件在升级后继续工作；该导出是纯增量，一方调用方不受影响。
- 级联审计的教训可以推广：可解析但大括号错位的 CSS module 会静默失效——规则无报错地消失，bundle 字符串里存在的规则也可能没进加载的样式表。这个面上的布局诊断需要计算样式，而不是读源码。
- 重建后旧页面无法再存活：每次导航都会重新拉取内嵌 rev 的 index。
