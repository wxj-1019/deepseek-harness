# Agent Note: Upstream merge API-drift repair and the runtime package migration

Status: implemented

English | [中文](2026-09-01-upstream-merge-api-drift-repair.zh.md)

## Problem

The fork's `mine/master` merged upstream's 1431-commit rc.8 line (`5ea45953e4 Merge remote-tracking branch 'upstream/master'`), but the merged tree did not typecheck or boot on this host: 46+ `tsc` errors across host and client faces, plus runtime boot crashes (`tool-git` schema rejected by the pre-merge validator). The drift had two sources. First, the authoring machine's 49-commit series (tool-ls/tool-tasks/tool-git/user-todo/ui-usage/ui-user-todo) was written against the new upstream base while this machine still sat on the rc.2 merge point; the same series deleted `packages/client/runtime` (`be531688f3 remove Runtime`) yet the new client packages (and several migrated ones) still referenced it in tsconfigs, manifests, and imports. Second, the merge itself left broken seams: `attachment-local`'s `persistObject` had its correct `objectPath(root, sha256)` call replaced by a nonsense `normalizedImagePath(root, prepared.ref)`, the `settingsNamespace`/`installSettingsSection` exports disappeared from `dsh-settings` in favor of plain namespace strings and `settings.installSection`, `writeText` gained a `sandboxPolicy` parameter that `fs-local` did not override, `HttpFetchLimits` dropped `allowPrivateNetwork`, `ToolCallId` replaced `CallId`, and `LspCallRow`/`unarchiveSession` were referenced before existing.

## Decision

A one-shot integration repair, committed as a single `fix(merge)` commit on top of the merged base:

- **Runtime migration.** Every `@deepseek-ai/dsh-client-runtime/client` import was retargeted per symbol: `createSnapshotStore`/`SnapshotStore`/`defineStore`/`EngineStoreHandle`/`ObservableSnapshot` → `@deepseek-ai/dsh-client-store`; `ClientContext` → `Context as ClientContext` from cordis; `SessionId` → `@deepseek-ai/dsh-session/types`; `SessionListState`/`SessionSummary` → `@deepseek-ai/dsh-api-session-controller/client`; `SettingsScope` → `@deepseek-ai/dsh-client-ui-settings/client`; `SlotRegistry` → `@deepseek-ai/dsh-client-ui-renderer/client`. tsconfig project references and manifest dependency maps were updated to match (`../store`, `tsconfig.client.json` forms).
- **Settings API.** `settingsNamespace(x)` → plain `'x'`; `installSettingsSection(ctx, …)` → `ctx.inject(['settings'], c => c.settings.installSection(ctx, …))` with the settings Context merge pulled by a type-only import.
- **Merge-slop repairs.** Restored `objectPath(root, sha256)`; deleted eight ghost package directories (apiproxy, ui-settings-vision-model, examples demos, session-persistence-sqlite, acp-snapshot, client/runtime) that the merge removed from the tree but left as build residue; removed duplicate `placeholder.steerQueue` locale keys and the orphaned `HeroGlow` usage in ui-conversation; added the missing `sandboxPolicy` override in `fs-local`; dropped `allowPrivateNetwork` from web-fetch-http; renamed `CallId` → `ToolCallId`; exported `LspCallRow`; wired `unarchiveSession` end-to-end (workspace-controller RPC/commands/model/client service, ui-workspace injection, test fakes).
- **Tool schema.** `tool-git`'s `type: ['number','null']` properties became `oneOf: [{type:'number'},{type:'null'}]`; `tool-tasks` marked `workspaces` required and stopped emitting explicit `undefined` under exactOptionalPropertyTypes; `tool-ls` used the conditional-spread cwd pattern.
- **Runtime error identity.** `core/tools` `errorInfo` gained a structural fallback: a thrown object carrying a string `code` is reported even when `instanceof HarnessError` fails across tsdown-bundled copies of the error hierarchy. This restored `result.error.info.{name,code}` for tool failures (tool-fs integration suite went 15 failing → 33 passing).

## Alternatives considered

- **Reconstruct `packages/client/runtime` from git history** — rejected: the authoring series deliberately removed it and migrated consumers; restoring it would fight the migration direction. The new packages' real needs are served by `dsh-client-store`/cordis.
- **Wait for the authoring machine to push its local state** — rejected by instruction: the repair was requested on this host, and every change is mechanical with no behavior intent of its own.
- **Keep the pre-merge validator behavior for array-typed schema `type`** — rejected: upstream's new validator already accepts the array form at runtime; aligning the *type* with `oneOf` keeps both static and runtime views consistent.

## Consequences

- `pnpm run typecheck` (host face + contracts-ready face, including tests) and `pnpm run build` are green (0 errors, 236 client artifacts); tool catalog regenerated (`gen-tool-catalog`), including a `ctx.fs` mount for the `tool-lsp` catalog entry.
- Focused vitest runs over every touched package pass (1600+ tests), except two `lsp-stdio` provider-resolution cases that also fail on the pre-merge baseline on this host (Windows PATH/spawn environment), plus the known pty/side-card Windows flakes.
- The fork's client-side `dsh-client-runtime` references are fully gone from `packages/client` sources; the published npm package remains only as a profile-installed artifact.
- The authoring machine will need to pull this commit and reconcile any unpushed local edits that overlap (notably its own `packages/client/runtime` working copy and any tsconfig tweaks) — see the commit message for the exact file list.
