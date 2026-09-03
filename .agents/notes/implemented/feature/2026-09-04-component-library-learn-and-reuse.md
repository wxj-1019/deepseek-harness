# Agent Note: Component library learns the checkout's UI components for model reuse

Status: implemented

English | [中文](2026-09-04-component-library-learn-and-reuse.zh.md)

## Problem

The harness web UI grows components in `packages/client`, but the model writing new UI code has no way to discover what already exists: it re-invents primitives and guesses at the `--dsw-*` design-token vocabulary. The reviewed design (docs/component-library-plugin.md) closes the loop: learn components from the checkout into a queryable library, let the model retrieve them before generating UI, and keep learning as files change.

## Decision

Two new workspace packages plus assembly wiring, implementing the design document's four layers on existing seams:

- **`packages/storage/component-library`** (`@deepseek-ai/dsh-component-library`): the Host owner. One Cordis service plugin (`ComponentLibraryService`, a Typert Remote service) opens the `component_library` storage domain (zod table of component records, JSON backend) and orchestrates: a TypeScript-AST extractor (exported PascalCase components; props from `<Name>Props`, then the parameter annotation, then an exported `Props` type; sibling CSS module's `--dsw-*` references; usage example from the nearest spec mount or JSDoc `@example`), a cold-start scan of `packages/client/*/src/client`, a chokidar watcher (200 ms stability threshold; only `.tsx` and `*.module.css` events), two model tools, an always-on system-prompt section (`component-library:reuse`, order `TOOL_COMPONENT_LIBRARY` = 2950), a generated `component-library` skill, and the `component-library` settings namespace. Every durable write broadcasts `component-library/changed` after the domain commits; the invariant companion fails any broadcast that does not trail a domain write.
- **`packages/client/ui-component-library`** (`@deepseek-ai/dsh-client-ui-component-library`): the settings card (`settings.plugin.item`, key `component-library`) with the learned count, client-side search, and approve/discard review controls for model-contributed records. It reads through the generated Remote face, loads lazily, and converges on the pushed change event and connection resets.
- **Wiring**: `dsh-web-app` dependencies plus the two `cordis.patch.yml` insert rows; `component-library/changed` joined the forwarded-event allowlist in `dsh-api-remotes`, which also mounts the Remote contribution.

Deviations from the design document, all reflected back into it:

- Tool names are `component_query` / `component_record`, not the dotted `component.query` / `component.record`: OpenAI-compatible function names reject dots, and every harness tool is snake_case.
- The record schema adds `rawProps` (raw type text kept when a props type is too dynamic for checker-free extraction) and `reviewed` (the quarantine flag the panel's review step flips).
- The token tier vocabulary is `static | alias | specific`, matching the actual `design-platform.css` names; the document said `role`, which does not exist in the stylesheet.
- Scanner test fixtures live in `fixtures/` (not `tests/`): the root vitest pattern `packages/*/*/tests/**/*.spec.{ts,tsx}` would execute a fixture named `*.spec.tsx` as a real test.

## Alternatives considered

- **Reusing `skill-filesystem`'s `SkillWatchManager`** — rejected: the class is module-private and its filters are SKILL.md-specific, so the watcher copies its chokidar configuration (200 ms threshold, `atomic`, `awaitWriteFinish`) with `.tsx`/`*.module.css` filters instead.
- **Full TypeScript checker (`ts.Program`) for props** — rejected for the first iteration: checker-free AST extraction keeps the scan cheap and side-effect-free; unresolvable types degrade to raw text with `propsInferred: false` rather than a partial member list that could mislead.
- **Excluding the tools from `gen-tool-catalog`** — accepted for now: the catalog's composition would need the storage trio and a settings provider solely to harvest two schemas. The catalog gate keys on `tool-*` package names, which this package is not, so freshness stays green; adding the harvest is a follow-up.

## Consequences

- `dsh web` boots the library: the cold scan seeds the domain, the watcher keeps it fresh, and every capable model sees the reuse directive plus both tools.
- Model records stay invisible to queries until a human approves them on the Plugins settings card (`includeUnreviewed` opts into listing them, ranked last).
- The keyless recorded-session walkthrough (scan → query → record → panel refresh) is deferred until the tools stabilize, per the design document's implementation plan.
- Two pre-existing master breakages fixed along the way land in separate commits: the git-graph `GraphLogEntry` local import and the usage-ledger price fields' missing JSDoc.
