# Agent Note: Compose MCP servers from the user settings document

Status: implemented

English | [中文](2026-08-20-mcp-servers-settings-composition.zh.md)

## Problem

The MCP client bridge (`dsh-mcp-client`) was complete — per-instance transports, reconnect supervision, tool re-sync — but unreachable: no bundle mounted it, so every surface required hand-written `cordis.yml` rows per server, and its Known Limitations left the startup budget pinned on the MCP SDK's per-request defaults. A user with three MCP servers edited three loader rows by hand and restarted on every change.

## Decision

**A manager composes existing rows from the user settings document.** The new `dsh-mcp-servers` package is a loader group row (`group: true`, extending the vendored `EntryGroup`): each server under the `mcp` settings section becomes the child row `mcp-servers:<name>` whose config is the entry plus the dictionary-key `serverName`. `EntryGroup.update()` is transactional, and the settings dictionary merges per server — one committed edit re-applies exactly one row through the loader's config-diff path (disconnect + reconnect for that server). A `disabled` name list parks entries; `${NAME}` in env/header values resolves from the ambient environment, an unset reference skipping that server with an error instead of leaking an emptied secret.

**The base bundle mounts the manager once.** Web, TUI, and headless all compose over base; this follows the `web`/`tool-web` precedent for cross-surface capability rows. No `isolate`: the manager publishes no service, and child mcp-client instances already enforce namespace uniqueness through their per-app reservation set.

**The manager avoids `loader.create()` deliberately.** `tree.write()` on the root include would write back into the profile composition — the exact trap `PresetTree`'s no-op `write()` override exists for. Being the group row itself also buys row-level HMR and plugin-inventory visibility for free.

**`dsh-mcp-client` gained `startupTimeoutMs` (default 60000).** The initial connect + discovery + registration now races a budget; firing closes the in-flight generation so the failure routes through the existing `failOnStartupError`/reconnect paths. Its `Config` was refactored into shared field descriptors exporting `ServerEntryConfig` — the server-entry union without `serverName` — so the manager's settings schema reuses it verbatim instead of duplicating fields.

## Consequences

- Settings-driven MCP needs no restart and no profile rows; hand-written `cordis.yml` rows keep working unchanged beside it (the same duplicate-`serverName` load-time error protects both sources).
- One explicitly-fatal server (`failOnStartupError`) rolls a whole group update back to the previous set — loader transaction semantics, documented as the manager's first Known Limitation rather than reimplementing per-entry isolation inside the update.
- The `verify-cordis-config` gate passes through the pre-existing `tsconfig.base.json` `packages/mcp/*/src` paths wildcard; the new base row resolves from the base bundle's own dependencies.
- Evidence: unit tests pin schema resolution, row composition, `disabled` exclusion, and `${NAME}` expansion/skip; a loader-level integration suite boots a real composition through `dsh-app-boot` with an in-memory settings provider and the keyless fixture server, proving tool discovery (`mcp__fixture__greet`) and add/remove propagation on committed settings changes without a restart.

## Alternatives considered

**Multi-server config inside `dsh-mcp-client`.** Rejected: it breaks the one-instance-per-server contract, moves the duplicate-`serverName` check from load time into a single plugin's internals, and couples connection supervision to settings parsing.

**Documenting `$DSH_HOME/cordis.patch.yml` insert rows.** Already works today (HMR-watched, zero code) and stays valid for one-off mounts, but it is profile-global, unvalidated, and structurally wrong for a server list that wants per-server merges and a disabled list.

**A settings-namespace consumer that spawns connections itself.** Rejected: it bypasses the loader, losing row ids, row-level HMR, transactional add/remove, and plugin-inventory visibility — the same reasoning that keeps agent presets on `Include`-mounted rows.
