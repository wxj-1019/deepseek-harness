---
description: "Component library for hosts and maintainers: learns the checkout's packages/client components into a durable domain and serves them to model tools, the prompt, the skills channel, and the web panel."
kind: "package-reference"
---

# @deepseek-ai/dsh-component-library

English | [中文](README.zh.md)

## Summary

`dsh-component-library` learns this checkout's UI components — exported React components with their props, `--dsw-*` design tokens, JSDoc summaries, and usage examples — into the `component_library` storage domain, and keeps learning through a chokidar watcher as files change. The library is served to the model through the `component_query` and `component_record` tools, an always-on system-prompt section, and a generated `component-library` skill, and to humans through the `component-library` settings namespace and Remote face that the web panel card reads. Choose it when composing the harness's own web profile; it is project-local to this repository and contributes nothing outside it.

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

Compose this package into the harness checkout's own web profile when UI work should reuse the repository's learned components. The official web bundle already carries the row.

### Configuration

Both fields are optional; the composition may omit `config` entirely.

```yaml
- name: '@deepseek-ai/dsh-component-library'
  config:
    root: /path/to/deepseek-harness
    watch: true
```

| Field | Default | Meaning |
|---|---|---|
| `root` | walk up from this package to the first directory containing `packages/client` | Checkout root whose client tree is learned; a root without that tree fails the load |
| `watch` | `true` | Keep learning from file changes after the cold-start scan |

### Observable behavior

Loading the plugin scans `packages/client/*/src/client` for exported PascalCase components, resolves each component's props type (`<Name>Props`, then the first parameter's annotation, then an exported `Props` type), collects the sibling CSS module's `--dsw-*` references, and lifts a usage example from the component's specs or its JSDoc `@example`. Records land in the `component_library` domain; every durable write broadcasts `component-library/changed` after the domain commits. With `watch` on, a settled `.tsx` or `*.module.css` change re-learns exactly one file, and a `.tsx` removal drops its records. A `component_record` path is normalized into the repository-relative POSIX form and rejected unless it names a file under `packages/client`, so model-derived ids always stay inside the scanner's id space. Model-contributed records from `component_record` are quarantined (`reviewed: false`) until approved on the panel; queries exclude them unless the `component-library` settings namespace sets `includeUnreviewed`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package is one Cordis service plugin (`ComponentLibraryService`, a Typert Remote service) that owns the domain and orchestrates four single-purpose modules.

### Design concept

- **Static analysis only.** The extractor parses `.tsx` with the TypeScript compiler API and never evaluates components; unparseable or unreadable files are skipped with a log line, never an abort.
- **Scanned records are authoritative.** A scanner write overwrites a model record of the same id and is born reviewed; the model tool's write to a scanner-covered id is rejected loudly.
- **Honest degradation over inference.** Props types that checker-free analysis cannot resolve — unions, intersections with external operands, heritage clauses — keep their raw type text under `propsInferred: false` instead of a partial member list.
- **No-op writes do not announce.** A rescan compares records ignoring `updatedAt`, so an unchanged file neither churns timestamps nor re-broadcasts the change event.

### Query ranking

`component_query` scores plain strings: exact name match beats package match beats keyword-in-jsdoc beats token reference; scanned records rank above model ones, resolved props above raw ones, and unreviewed model records are excluded unless the settings namespace opts in.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: domain ownership, Remote face, pipeline orchestration, ranking, review |
| [`src/types.ts`](src/types.ts) | Public record/request/result vocabulary plus the `component-library/changed` event declaration |
| [`src/spec.ts`](src/spec.ts) | The `component_library` domain's zod table |
| [`src/extract.ts`](src/extract.ts) | Pure TypeScript-AST extraction of components, props, and CSS token references |
| [`src/tokens.ts`](src/tokens.ts) | Theme stylesheet parsing into the tiered token inventory |
| [`src/scanner.ts`](src/scanner.ts) | Filesystem walk, per-file record assembly, spec-example lifting |
| [`src/watcher.ts`](src/watcher.ts) | Chokidar watcher with a 200 ms stability threshold |
| [`src/tools.ts`](src/tools.ts) | `component_query` / `component_record` tool definitions |
| [`src/skill.ts`](src/skill.ts) | Generated `component-library` skill provider |
| [`src/invariant.ts`](src/invariant.ts) | Invariant companion: every change broadcast trails a durable domain write |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Component library plugin design](../../../docs/component-library-plugin.md) — the design document this package implements.
- [Storage subsystem](../../../docs/subsystems/storage.md) — the storage-domain contract the records live on.
- [Storage package map](../README.md) — the family's packages and their repository position.
- [Settings card package](../../client/ui-component-library/README.md) — the browser panel over this package's Remote face.

-----

<a id="model-experience"></a>
## Model Experience

### System-prompt section

#### What the model sees

Every assembly of a capable profile carries the `component-library:reuse` section: a directive to call `component_query` for the target area before writing UI code, prefer scanned components and their `--dsw-*` tokens over inventing new primitives, and call `component_record` after creating a genuinely new reusable component.

#### Token effect

One fixed short paragraph on every request while the plugin is composed.

#### KV Cache effect

Prefix-stable; the section text is static and changes only with the plugin's composition.

### Tool schemas

#### What the model sees

The model sees the generated [`component_query` and `component_record` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-component-library): the query tool takes a required free-text `query` plus optional `pkg` filter and `limit`; the record tool takes required `name`, `pkg`, `path` and optional `props`, `tokens`, `jsdoc`, and `example`. Both descriptions instruct when to reach for each tool.

#### Token effect

Two fixed schemas on every request where the tools are visible.

#### KV Cache effect

Prefix-stable while the definitions and visibility are unchanged.

### Tool-call results

#### What the model sees

A `component_query` success renders a compact ranked list — name, package, path, props (or the raw props type text marked unresolved when the type did not resolve), tokens, example per match — or the empty-library guidance. A `component_record` success confirms the quarantined id; failures name the rejection (for example a scanner-covered id or a path outside the client tree).

#### Token effect

Result tokens scale with match count and the recorded props; bounded by `limit` (default 10).

#### KV Cache effect

Append-only; results follow the reusable request prefix.

### Skill body

#### What the model sees

Loading the `component-library` skill returns a generated body: the reuse introduction, the `--dsw-static` / `--dsw-alias` / `--dsw-specific` tier conventions with live counts and samples, and the current component list grouped by package.

#### Token effect

Zero until the model loads the skill; the body then scales with the library's size.

#### KV Cache effect

The body regenerates as the library changes, so a loaded snapshot can age; skill content enters the transcript append-only.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits are current package constraints, not a task backlog.

- **Checker-free props extraction** — cross-file or otherwise dynamic props types keep raw text instead of members; query results present that text marked unresolved rather than a structured prop list.
- **Project-local by design** — the library learns only the checkout it runs from; cross-project sharing is out of scope.
- **Cold-start scan cost at load** — the initial walk parses every client component file before the plugin finishes loading.
- **Examples drift with their specs** — lifted mount snippets are refreshed on the next scan of the owning file, not when the spec changes.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above and the linked design document.

#### Future: conversation view and snapshot coverage

The design document defers a `conversation.view` browsing tab and the keyless recorded-session walkthrough until the tools stabilize; both land as follow-ups without changing this package's seams.

</details>
