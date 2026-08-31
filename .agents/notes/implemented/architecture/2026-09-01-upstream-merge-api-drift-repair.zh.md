# Agent Note：上游合并 API 漂移修复与 runtime 包迁移

Status: implemented

[English](2026-09-01-upstream-merge-api-drift-repair.md) | 中文

## Problem

fork 的 `mine/master` 合并了上游 1431 个提交的 rc.8 线（`5ea45953e4 Merge remote-tracking branch 'upstream/master'`），但合并后的树在本机既过不了类型检查也无法启动：host 与 client 两个编译面合计 46+ 个 `tsc` 错误，启动即崩（`tool-git` 的 schema 被合并前的校验器拒绝）。漂移有两个来源。其一，作者机器的 49 提交系列（tool-ls/tool-tasks/tool-git/user-todo/ui-usage/ui-user-todo）是按新上游基座写的，而本机当时还停在 rc.2 合并点；同一系列删除了 `packages/client/runtime`（`be531688f3 remove Runtime`），但新客户端包（以及若干待迁移包）的 tsconfig、manifest 与导入里仍引用它。其二，合并本身留下了坏缝：`attachment-local` 的 `persistObject` 里正确的 `objectPath(root, sha256)` 调用被换成了无意义的 `normalizedImagePath(root, prepared.ref)`；`dsh-settings` 删除了 `settingsNamespace`/`installSettingsSection` 导出，取而代之的是纯字符串命名空间与 `settings.installSection`；`writeText` 新增了 `sandboxPolicy` 参数而 `fs-local` 没有覆盖；`HttpFetchLimits` 删掉了 `allowPrivateNetwork`；`ToolCallId` 取代了 `CallId`；`LspCallRow` 与 `unarchiveSession` 在被定义之前就被引用。

## Decision

一次性整合修复，作为合并基座之上的单个 `fix(merge)` 提交：

- **runtime 迁移。** 所有 `@deepseek-ai/dsh-client-runtime/client` 导入按符号重定向：`createSnapshotStore`/`SnapshotStore`/`defineStore`/`EngineStoreHandle`/`ObservableSnapshot` → `@deepseek-ai/dsh-client-store`；`ClientContext` → cordis 的 `Context as ClientContext`；`SessionId` → `@deepseek-ai/dsh-session/types`；`SessionListState`/`SessionSummary` → `@deepseek-ai/dsh-api-session-controller/client`；`SettingsScope` → `@deepseek-ai/dsh-client-ui-settings/client`；`SlotRegistry` → `@deepseek-ai/dsh-client-ui-renderer/client`。tsconfig 工程引用与 manifest 依赖同步更新（`../store`、`tsconfig.client.json` 形式）。
- **settings API。** `settingsNamespace(x)` → 纯 `'x'`；`installSettingsSection(ctx, …)` → `ctx.inject(['settings'], c => c.settings.installSection(ctx, …))`，settings 的 Context 合并由 type-only 导入拉入。
- **合并残渣修复。** 恢复 `objectPath(root, sha256)`；删除八个幽灵包目录（apiproxy、ui-settings-vision-model、examples 演示、session-persistence-sqlite、acp-snapshot、client/runtime——合并从树里删除但留下构建残渣）；清理 ui-conversation 重复的 `placeholder.steerQueue` locale key 与孤立的 `HeroGlow` 用法；补上 `fs-local` 缺失的 `sandboxPolicy` 覆盖；从 web-fetch-http 删除 `allowPrivateNetwork`；`CallId` → `ToolCallId`；导出 `LspCallRow`；把 `unarchiveSession` 全链路接上（workspace-controller 的 RPC/commands/model/client service、ui-workspace 注入、测试假件）。
- **工具 schema。** `tool-git` 的 `type: ['number','null']` 属性改为 `oneOf: [{type:'number'},{type:'null'}]`；`tool-tasks` 把 `workspaces` 标为必填并停止在 exactOptionalPropertyTypes 下显式产出 `undefined`；`tool-ls` 采用条件展开的 cwd 写法。
- **运行时错误身份。** `core/tools` 的 `errorInfo` 增加结构化回退：携带字符串 `code` 的抛出对象即便跨 tsdown 打包的 HarnessError 副本 `instanceof` 失败也会被报告。这恢复了工具失败的 `result.error.info.{name,code}`（tool-fs 集成套件从 15 个失败变为 33 个全过）。

## Alternatives considered

- **从 git 历史重建 `packages/client/runtime`** —— 否决：作者系列是刻意删除并迁移消费方的；恢复它会逆着迁移方向。新包的真实需求由 `dsh-client-store`/cordis 满足。
- **等作者机器推送本地状态** —— 按指示否决：本次修复在本机完成，且每处改动都是机械性的、没有自己的行为意图。
- **为数组式 schema `type` 保留合并前校验器行为** —— 否决：上游新校验器在运行时已接受数组形式；类型面用 `oneOf` 对齐让静态与运行时视图一致。

## Consequences

- `pnpm run typecheck`（host 面 + contracts-ready 面，含测试）与 `pnpm run build` 全绿（0 错误，236 个客户端产物）；tool catalog 已重新生成（`gen-tool-catalog`），含 `tool-lsp` 目录条目补挂的 `ctx.fs`。
- 所有 touched 包的聚焦 vitest 通过（1600+ 测试）；仅两个 `lsp-stdio` provider 解析用例在本机合并前基线上同样失败（Windows PATH/spawn 环境），外加已知的 pty/side-card Windows 抖动。
- fork 客户端源码里的 `dsh-client-runtime` 引用已彻底清除；发布的 npm 包仅作为 profile 安装产物存在。
- 作者机器需要拉取本提交并调和任何未推送的本地改动（尤其是它自己的 `packages/client/runtime` 工作副本与 tsconfig 调整）——提交信息里附有完整文件清单。
