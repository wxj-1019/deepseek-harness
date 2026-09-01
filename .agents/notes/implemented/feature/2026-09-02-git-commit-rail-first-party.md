# Agent Note: Git commit-rail becomes a first-party web feature

Status: implemented

English | [中文](2026-09-02-git-commit-rail-first-party.zh.md)

## Problem

The commit-rail visualization (dots, lanes, merge curves over a history list)
lived only inside the third-party `dsh-better-sidebar` plugin's source-control
panel, reachable solely through that plugin's dock. The user asked for the
feature to become a first-party capability of the harness web UI — a
conversation view in the session header, independent of the plugin.

## Decision

Two new workspace packages plus a bundle wiring change:

- **`packages/web/git-graph`** (`@deepseek-ai/dsh-git-graph`): a read-only
  `/git-graph/api` prefix route over the shell seam. `POST /git-graph/api/log`
  returns parent-aware log rows (`%h%x1f%s%x1f%an%x1f%ai%x1f%H%x1f%D%x1f%P%x1f%ct`)
  with paging; `POST /git-graph/api/branch` lists local branch names. Working
  directory resolution is two-tier: the caller may pass `cwd` (validated
  absolute), otherwise the host resolves the session header's `cwd` through
  the attached `SessionStore` first — `sessionController.inspect` replays the
  whole event log and stalls on long conversations, so it is only a fallback.
  The route is read-only by construction: no checkout, no mutation.
- **`packages/client/ui-git-graph`** (`@deepseek-ai/dsh-client-ui-git-graph`):
  a `conversation.view` entry (`order: 30`, right of Usage) rendering the
  session workspace's history with the graph rail. The rail geometry
  (`CommitGraphRail.tsx`) was ported from the plugin implementation: pure lane
  assignment over the loaded window, percentage vertical coordinates so rows
  connect at their shared border regardless of text wrap height.
- **Bundle**: `dsh-web-app` gains both packages in dependencies and the
  `cordis.patch.yml` insert list.

Runtime notes: client plugin registration requires an `inject` declaration
(`['slots', 'locale']`) or the loader rejects the entry; the injected face
must carry a `hooks` key for keyed/list entries. `modlens` 3.18.1 registers
the keyed `settings.plugin.item` slot with `id` instead of `key`; this host
fixes it via pnpm patch (`patches/@liustack__modlens.patch` in the web
profile), which is environment-level and not part of this commit.

## Alternatives considered

- **Extend the plugin** — rejected: the user explicitly wanted the feature
  in the first-party tree, not behind the third-party dock.
- **Reuse `tool-git`** — rejected: it is a model-facing tool with action
  gates; a UI read surface needs its own route and cannot depend on tool
  policy.
- **`sessionController.inspect` for cwd resolution** — tried first and
  rejected at runtime: it replays the whole event log (stalls on long
  conversations); the attached `SessionStore.get` header read is O(1).

## Consequences

- The session header shows a "Git" tab rendering the rail history for any
  session whose workspace is a repository; non-repo workspaces show the
  "not a repository" placeholder.
- The rail remains in the better-sidebar source-control panel unchanged.
- `modlens`'s settings card no longer throws the keyed-slot error on the
  web console.
- New packages follow the client-package skeleton (exports map, dsh.client
  manifest, tsdown clientBundle, hand-written tsconfig alias for the
  `dsh-client-` prefix); both carry parser/geometry unit tests and a jsdom
  component test over mocked fetch.
