---
description: "Read-only git commit-history route for web maintainers: parent-aware log rows and branch names over the shell seam, consumed by the conversation view's commit rail."
kind: "package-reference"
---

# @deepseek-ai/dsh-git-graph

English | [中文](README.zh.md)

## Summary

`dsh-git-graph` serves the web UI's commit rail: a read-only `/git-graph/api` prefix route returning parent-aware log rows and local branch names for a repository working directory. Rows carry the fields the rail needs (hash, subject, author, date, decorations, parents, commit time) in delimiter-separated records, so the client renders lanes without a second request. The route runs git through the shell seam's subprocess discipline and can never mutate the working tree.

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

The official web bundle already mounts the package; the conversation view's commit rail consumes its routes through the web server's authenticated API surface. A composition that only wants the route adds the plugin row directly.

### Route contract

`POST /git-graph/api/log` with `{ cwd, count?, skip? }` returns `{ ok: true, value: { entries, hasMore } }` — one page of history rows, newest first, with a paging marker; `POST /git-graph/api/branch` with `{ cwd }` returns `{ ok: true, value: string[] }`. Working directories are validated absolute paths; failures return `{ ok: false, error: { code, message } }`. Every handler is read-only by construction: no checkout, no mutation, no network.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design concept

- **One delimited record per commit.** The git log format encodes each row with unit-separator boundaries, so parsing never guesses where a subject ends and the author begins.
- **Parent awareness over coloring.** The route returns raw parent hashes; the client derives lanes, so the Host stays ignorant of rendering strategy.
- **Two-tier working-directory resolution.** An explicit `cwd` wins (validated absolute); otherwise the host resolves the session header's `cwd` through the attached `SessionStore` — a full session-log replay through `sessionController.inspect` stalls on long conversations and is only the fallback.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: the `/git-graph/api` route registration and cwd resolution |
| [`src/parse.ts`](src/parse.ts) | Log-row and branch-name parsing with the delimiter contract |
| [`src/invariant.ts`](src/invariant.ts) | Invariant companion (no runtime invariant: correctness is the read-only route contract) |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Commit rail Agent Note](../../../.agents/notes/implemented/feature/2026-09-02-git-commit-rail-first-party.md) — the design behind the first-party rail.
- [Client package](../../client/ui-git-graph/README.md) — the conversation view that renders these rows.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package serves HTTP routes to the web client and registers no prompt, tool, schema, or session event.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits are current package constraints, not a task backlog.

- **Local branches only** — the branch listing reads local refs; remote-tracking branches are a deliberate cut.
- **No history caching** — every page re-runs git; large repositories pay the subprocess cost per page.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above and the linked Agent Note.

</details>
