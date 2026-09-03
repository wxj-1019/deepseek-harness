# Component Library Plugin Design

English | [中文](component-library-plugin.zh.md)

A first-party plugin that learns the repository's UI components, persists them as a component library, and lets the AI reuse the library when generating UI code. The plugin is a normal capability seam: Host scanner + storage, model-facing tools, a skills channel, and a client panel. Every layer rides an existing seam; nothing new lands on the agent loop.

## 1. Goal and scope

The loop this plugin closes: discover a component or style pattern in the codebase, persist it into a queryable library, let the model retrieve it while writing UI, and learn continuously as the codebase changes.

In scope: component-level learning first (React components + props), style-token inventory as generation constraints, model retrieval before generation, and continuous refresh on file changes. Out of scope for the first iteration: visual screenshot diffing, runtime component rendering sandboxes, and any upstream distribution (npm publication) of the library itself.

## 2. Architecture overview

Four layers, each on an existing seam:

```
Learn (Host)         Persist (Storage)          Consume (Model + UI)
─────────────        ────────────────          ──────────────────────
scanner.ts        →  storage-domain           →  component.query / component.record tools
chokidar watcher     domain "component_library"    SkillProvider (skill catalog)
                     (JSON backend)               settings.plugin.item panel
```

- **Learn**: a Host scanner extracts component records from `packages/client/*/src/client` and watches them with the chokidar pipeline borrowed from `skill-filesystem`.
- **Persist**: a `storage-domain` domain named `component_library` holds component records; durable writes emit `domain/changed` so the panel refetches.
- **Consume**: two model tools (`component.query`, `component.record`) plus a `SkillProvider` summary document, and a `settings.plugin.item` card for human review.

## 3. Packages

Two packages, following the host/client pairing convention:

| Package | Role | Key seams |
| --- | --- | --- |
| `packages/storage/component-library` | Host: scanner, watcher, storage domain, model tools, skill provider | `storage-domain`, `tools`, `skills` |
| `packages/client/ui-component-library` | Client: settings card (and later a browsing view) | `settings.plugin.item`, `storage-domain` remote read |

The Host package owns the domain schema and the learning pipeline. The Client package owns presentation only and reads through the domain's remote surface.

## 4. Data model

### Component record (one per learned component)

```json
{
  "id": "ui-usage/UsageSection",
  "pkg": "@deepseek-ai/dsh-client-ui-usage",
  "name": "UsageSection",
  "path": "packages/client/ui-usage/src/client/UsageSection.tsx",
  "props": [
    { "name": "useSessions", "type": "SnapshotSelectorHook<SessionListState>", "required": true }
  ],
  "tokens": ["--dsw-alias-label-primary", "--dsw-alias-bg-layer-1"],
  "jsdoc": "The Usage view body: per-session token accounting dashboard.",
  "example": "…a short usage snippet extracted from the first host spec…",
  "updatedAt": 1787767305030
}
```

- `props` is extracted from the component's props type, not inferred from call sites.
- `tokens` is the set of `--dsw-*` variables referenced in the component's own CSS module.
- `example` is optional; it comes from the nearest test file's mount call when one exists, else the JSDoc `@example` block.

### Style-token inventory (generation constraint corpus)

The scanner additionally parses `packages/client/ui-theme/src/styles/design-platform.css` into a token list: `{ name, value, tier: 'static' | 'alias' | 'role' }`. This is published as a reference document, not a database table.

## 5. The learning pipeline

### 5.1 Static scan (cold start)

Walk `packages/client/*/src/client` with a bounded glob; per `.tsx` file:

1. Parse with the TypeScript compiler API (`ts.createSourceFile` + `ts.forEachChild`) for `export function Name` and `export const Name =` declarations whose first letter is uppercase.
2. For each component, resolve the props type reference (`NameProps` / `XxxInjected` intersection) and collect its member names, required flags, and rendered type strings.
3. Read the sibling `*.module.css` (same basename) and collect `--dsw-*` references.
4. Emit one record per component; unknown/unparseable files are skipped with a log line, never an abort.

The scanner is pure static analysis — it does not evaluate components, so CSS imports or JSX never execute.

### 5.2 Continuous learning (watch)

Mirror `skill-filesystem`'s `SkillWatchManager`: a chokidar watcher over `packages/client` with a 200 ms stability threshold, project-root LRU eviction, and an `invalidate()` callback that re-runs the affected file's extraction. Only `.tsx` and `*.module.css` events matter.

A write lands a record in the storage domain and emits `domain/changed`, which the client panel uses to refetch.

### 5.3 Model-driven learning

`component.record` lets the model write a record after it creates a component (usually inside a conversation's task). The record is the same shape; `origin: 'model'` marks it for review. A human review step on the panel keeps hallucinated entries out of the durable set.

## 6. Model-facing tools

### `component.query`

Retrieves matching component records. Parameters: `query` (free text: name, package, or purpose keyword), `pkg` (optional filter), `limit` (default 10). Output schema: `{ matches: [{ name, pkg, path, props, tokens, example }] }`. The `render` presents a compact ranked table for the transcript card.

### `component.record`

Writes a model-contributed record. Parameters: `name`, `pkg`, `path`, `props` (array of `{name, type, required}`), `tokens`, `jsdoc`, `example`. The write is validated against the domain schema and stamped `origin: 'model'`.

Both tools register with `ctx.tools.register(defineTool(...))` inside the Host package's plugin, so they appear in the system prompt for every capable model without further plumbing.

## 7. Skills channel

Register a `SkillProvider` named `component-library` that materializes a single skill `component-library` whose `SKILL.md` body is generated from the domain: a short introduction, the token-tier conventions, and the top-used components list. The provider's `list()` returns the summary entry; `get()` generates the body on demand. Models that prefer long-form guidance load it through the existing skill tool instead of calling `component.query` repeatedly.

## 8. Client panel

A `settings.plugin.item` keyed card (`key: 'component-library'`) renders the library summary: component count, recently updated rows, and a search box. Follow the AquaPluginCard / McpCard pattern (register with `store`, `locale`, `inject`; subscribe to the domain's `changed` event for live refresh). A later iteration can promote it to a `conversation.view` tab modeled on the Git commit-rail view.

## 9. Implementation plan

1. **Scaffold**: the two packages with manifests, tsconfigs, tsdown configs, invariant companions, and bilingual READMEs. `pnpm run gen-tsconfig-paths` picks up the aliases.
2. **Storage + static scan**: the domain, the TypeScript-API extractor, and cold-start seeding of `packages/client`.
3. **Model tools**: `component.query` and `component.record` with wire schemas and transcript rendering.
4. **Client panel**: the keyed settings card with live refresh.
5. **Watcher + skill provider**: continuous learning and the skills channel.
6. **Polish**: ranked retrieval, example extraction from specs, and review controls on the panel.

Each stage lands with its unit tests and an Agent Note; the keyless snapshot suite gains a recorded `component_library` walkthrough once the tools stabilize.

## 10. Testing policy

- Scanner: fixture directories under the package's `tests/` with crafted `.tsx` + `.module.css` pairs; assert records per file.
- Storage: open the domain against a scratch `DSH_HOME`; put/get/update round-trips and the `domain/changed` emission.
- Tools: run the Host plugin in a cordis context with a scripted storage backend; call both tools and assert the wire shapes.
- Panel: jsdom render with a stubbed remote scope; assert the card lists entries and the search filters.

## 11. Risks and mitigations

- **Extraction fidelity**: static props extraction cannot read conditional/discriminated unions correctly; when a props type is too dynamic, the record keeps the raw type text so the model still has the contract. Mark such records `propsInferred: false` so the query result can de-prioritize them.
- **Example quality**: test-mount snippets are the best examples but can drift; records keep `updatedAt` so stale examples are visible and refreshable.
- **Hallucinated model records**: `origin: 'model'` records are quarantined until a human confirms them on the panel; query results rank them below scanned records.
- **Watcher cost**: chokidar on `packages/client` is bounded by a 200 ms stability threshold and per-file re-extraction, so it stays idle-priced.

## 12. Acceptance criteria

- `component.query` returns matching records for a seeded scan of `packages/client` in a scratch profile.
- The settings card lists the seeded components and refreshes on `domain/changed`.
- The generated skill body loads through the skill tool without format errors.
- A recorded walkthrough replays keylessly: scan → query → record → panel refresh.
