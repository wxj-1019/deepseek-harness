# Agent Note: post-merge repair batch — settings compat export, remote inject grant, heroGlow brace, index no-store

Status: implemented

English | [中文](2026-09-01-post-merge-boot-and-hero-layout-repairs.zh.md)

## Problem

The rc.8 upstream merge ([drift repair](../architecture/2026-09-01-upstream-merge-api-drift-repair.md)) left four independent defects that surfaced only at runtime on this fork, after the repair commit: the Web surface failed to boot, an MCP settings card failed to load, the blank-session hero rendered top-aligned instead of centered, and rebuilt client bundles could not reach a refreshing browser.

- **Third-party plugins pin the removed `settingsNamespace` helper.** The drift repair migrated first-party callers off the helper, but every published version of the bundled third-party plugins (`dsh-better-sidebar`, `@yeesy369/dsh-web-permission`) imports `settingsNamespace` from `@deepseek-ai/dsh-settings`; the loader refused both entries and boot died. Upgrading cannot help — the newest published versions carry the same import.
- **`ui-settings-mcp` accessed `ctx.remote` without declaring it.** The client loader grants services per the plugin's `inject` list; the MCP card's controller consumes `Pick<ClientRemote, 'settings'>` but its `inject` array omitted `remote`, so the entry failed with `cannot get property "remote" without inject`.
- **A merge-dropped closing brace silenced the hero layout rules.** The resolved `ConversationRoot.module.css` lost the `}` that closes `.heroGlow` (with two of its declarations). CSS nesting then swallowed every following rule — `.heroWorkspaceRow`, `.root[data-phase='hero'] .scrollBody { justify-content: center }`, and the settling rule — into descendant selectors under `.heroGlow` that match nothing. The blank-session composer rendered at the top of a full-height scrollport with a large void below; the failure was silent because unbalanced-but-parseable CSS still loads.
- **The rendered index had no cache policy.** It embeds the current client-bundle revs, but the response carried no `Cache-Control`, so heuristic browser caching kept serving a stale roster after rebuilds and reloads appeared to have no effect.

## Decision

- **`dsh-settings` re-exports `settingsNamespace`.** The export aliases the existing internal `parseSettingsNamespace` — the same validation the removed helper performed. First-party code keeps passing plain strings; the helper exists so pinned third-party plugins boot. Rejected: patching each plugin (higher maintenance, breaks on upgrade) and dropping the rows from the bundle (loses features the fork ships).
- **`ui-settings-mcp` declares `'remote'` and `'remote.settings'`** in its client `inject`, matching the sibling packages' pattern of a bare grant plus the one scoped subkey the package consumes.
- **`.heroGlow` is closed and restored verbatim** from the pre-merge fork file (`position: absolute`, `pointer-events: none` included). The hero-root fill rule (`.root[data-phase='hero'] { flex: 1 1 auto; min-height: 0; overflow: hidden }`, mirroring the active phase) was added while diagnosing and kept: it makes the hero independent of the html/body/#root height chain exactly as active already was.
- **`frontend-static` serves the rendered index with `cache-control: no-store`.** Hashed static assets stay cacheable; only the rev-embedding index is forced fresh.

## Alternatives considered

- **Patch the third-party plugins in `node_modules`** — rejected: three packages × every future upgrade re-applies the patch by hand; the one-line compat export removes the maintenance entirely.
- **Drop the browser rows from the web-app bundle** — rejected: it would silently remove the browser-automation and better-sidebar features the fork ships, to fix a boot error that a single additive export fixes.
- **Grant only `'remote.settings'` without bare `'remote'`** — rejected for now: the sibling packages grant both, and narrowing the grant without a loader test for the scoped path risks trading one boot failure for another.
- **Diagnose the hero layout from source alone** — rejected after two wrong fixes: CSS-module bundling, nesting, and cascade ordering make source reading unreliable here; the computed-style audit through CDP found the dropped brace in minutes.

## Verification

- `settings` suite: 94 tests pass, including the two new `settingsNamespace` cases.
- The served `ui-conversation` bundle contains the repaired rules; a CDP-driven headless Edge against the running server reports `justify-content: center` applied on `[data-conversation-scroll]` and the composer seat vertically centered in the hero.

## Consequences

- Third-party plugins that import `settingsNamespace` keep working across upgrades; the export is additive and first-party callers are unaffected.
- The cascade-audit lesson generalizes: a parseable but mis-braced CSS module fails silently — rules vanish without errors, and bundle strings can contain rules the loaded stylesheet dropped. Layout diagnosis on this surface needs computed styles, not source reading.
- A stale page can no longer survive a rebuild: every navigation re-fetches the rev-embedding index.
