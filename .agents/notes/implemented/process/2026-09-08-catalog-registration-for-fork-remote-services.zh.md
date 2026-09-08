# Agent Note：fork 远程服务的 catalog 注册

Status: implemented

[English](2026-09-08-catalog-registration-for-fork-remote-services.md) | 中文

## 问题

fork 的五个 `TypertRemoteService` 包——component-library、notification-center、session-pins、usage-ledger、user-todo——落地时没有在 Cordis catalog 生成器的策略映射中注册。每次运行 `pnpm run gen-cordis-catalog` 都会在分区检查上大声失败（`has no SERVICE_PAGE entry`），导致任何生成 catalog 都无法刷新：`verify-cordis-catalog` 无法通过，这些服务的公开 API 对面向模型的运行时 catalog（`tool-cordis/src/api-catalog.ts`）不可见，而且 LSP 子系统页与 seam 扩展后的操作联合产生了漂移——因为谁都无法重新生成。

## 决策

每个服务在 `docs/subsystems/` 下获得自己的双语子系统页（含 cordis-surface 标记），生成器的三个映射补上对应条目：`SERVICE_PAGE` 与 `EVENT_SCOPE_PAGE` 把每个服务键和 `domain/*` 事件作用域指向其页面，`TYPE_LINK_EXEMPTIONS` 把各包的请求/结果词汇归类为由各包 `src/types.ts` 持有（包自有词汇的既有先例，如 `AgentPreset*`）。五个页面配对与被修改的 `README` 索引配对均在各自 `.i18n.yaml` 中重新记录。LSP 页面的 `type-equiv` 块与散文已与 11 操作联合重新同步；`packages/lsp/lsp/src/types.ts` 中三处过时的源码 JSDoc（"four operations"、"Every field is required"）一并修正，使被门禁约束的文档拷贝准确。

## 后果

`gen-cordis-catalog` 可干净运行，五个新页面及 `attachment`、`workspace`、`lsp`、`tool-cordis/src/api-catalog.ts` 的生成区域均为最新，`verify-cordis-catalog` 与 `verify-type-equiv` 重新通过。未来新增远程服务必须在同一 PR 中注册全部三个映射（或给出 walk 豁免理由）——分区检查现在会在生成时大声失败，而不是让服务悄然缺失文档。

## 备选方案

- **让 `LINK_MAP` 指向各包 README 而非豁免** —— 拒绝：`linkedTypePages` 的取值按惯例是 `docs/subsystems/*.md` 页面，为包路径改写映射类型得不偿失，现有豁免形式已经够用。
- **把五个服务整体豁免出 catalog** —— 拒绝：它们是真实的用户可见远程 API；隐藏它们会重新制造这次修复所消除的不可见性。
