---
description: "Git commit-rail conversation view for browser users: a conversation.view tab rendering the session workspace's history with branch topology over the git-graph host route."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-git-graph

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-git-graph` contributes the conversation view's "Git" tab (`order: 30`, right of Usage): the session workspace's commit history rendered as a commit rail — dots, lanes, and merge curves over the history list — with the page's rows fetched from the git-graph host route. The view is read-only: no checkout, no mutation; paging appends older commits and the rail recomputes over the loaded window.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The official web bundle already mounts the package. The tab appears in the conversation header strip and reads `/git-graph/api` (host package `@deepseek-ai/dsh-git-graph`); it shows history for the session workspace's directory and pages older commits on demand.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design concept

- **Lane geometry is pure.** `CommitGraphRail` assigns lanes over the loaded window and emits percentage vertical coordinates, so rows connect at their shared border regardless of text wrap height.
- **Rail recomputes per window.** Paging replaces nothing: appended rows re-flow the lane assignment deterministically from the parent hashes.
- **Slot registration rides the standard kit** — locale dictionary, `conversation.view` entry, and typed store share the client plugin conventions.

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Browser plugin: locale, tab registration |
| [`src/client/GitGraphTab.tsx`](src/client/GitGraphTab.tsx) | Tab body: paging, branch selection, empty states |
| [`src/client/CommitGraphRail.tsx`](src/client/CommitGraphRail.tsx) | Pure lane assignment and rail geometry |
| [`src/client/api.ts`](src/client/api.ts) | `/git-graph/api` client calls |
| [`src/client/locales.ts`](src/client/locales.ts) | The bilingual copy dictionary |
| [`src/invariant.ts`](src/invariant.ts) | Invariant companion (no runtime invariant: rendering is a pure projection) |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Commit rail Agent Note](../../../.agents/notes/implemented/feature/2026-09-02-git-commit-rail-first-party.md) — the design behind the first-party rail.
- [Host route package](../../web/git-graph/README.md) — the read-only route serving these rows.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package renders user-owned history for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits are current package constraints, not a task backlog.

- **Loaded window only** — the rail renders the paged window and recomputes from it; virtualization beyond the loaded rows is deferred.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above and the linked Agent Note.

</details>
