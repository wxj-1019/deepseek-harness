# Agent Note: MCP settings card, boot progress text, and per-route retry control

Status: implemented

English | [中文](2026-08-21-web-settings-trio.zh.md)

## Problem

Three product gaps sat on top of rc.8's foundations. The MCP server composition was settings-driven but file-only — editing `$DSH_HOME/settings.yaml` by hand. The boot page showed a bare arc with no count or identity, so a stuck boot looked identical to a healthy one through the whole prefetch window. And the per-provider `retryPolicy` field existed in both LLM settings namespaces (written end-to-end by e2e) but no surface rendered it.

## Decision

**The MCP card follows the external-card pattern over path-op mutations.** A new browser package (`dsh-client-ui-settings-mcp`) registers into the Plugins configurable tab keyed by the served `mcp` namespace; the controller projects the namespace snapshot into a sorted server list and issues revision-fenced `settings.mutate` path ops (`set ['servers', name]` for add/edit, `unset` for remove, `set ['disabled']` for parking) — the Models-page precedent, because `CardForm` addresses only top-level scalars. The form mirrors the composition contract (transport-switched field sets, `SERVER_NAME_PATTERN` plus taken-key validation, `${NAME}` env/header references stored verbatim); no secrets ride the section.

**Boot progress adds the two missing dimensions.** The boot page now renders `done/total · last-activated-short-name` under the hint and counts finished first-tier prefetches into the same arc — all from the `internal/status` events the kernel already consumed; `shortEntryName` collapses harness client package names to their distinguishing segment. Presentation-only: no protocol, no boot-order change.

**Retry control reuses the existing field.** The Models page ProviderEditor's customized area gains one number field writing `{ retryPolicy: { mode: 'normal', maxRetries } }` through the editor's existing draft/pathOps pipeline; the write merges into the draft's policy object so a hand-written backoff or `mode: 'always'` survives, and clearing removes only the count. No new namespace, no executor setting — the recorded design keeps backoff shaping and retryable codes config-only.

## Consequences

- MCP servers are fully manageable from the Web UI; live application is the namespace's own (the composing manager re-applies the changed row on commit), so the card needs no restart notice.
- The boot arc no longer freezes during prefetch, and a stuck entry is identifiable by name before the terminal audit fires.
- A provider's retry count is editable where its other knobs are; the e2e that writes `retryPolicy` end-to-end already proves the adapter re-registration path.
- `tsconfig.base.json` gains explicit paths for `ui-settings-mcp` and `ui-desktop-notify` (the latter was a latent gap — the source-launch resolution for its bundle row had never been mapped).

## Alternatives considered

**A schema-driven MCP form.** Rejected: the schema-form package is a model layer, not a renderer; the codebase convention is hand-written curated controls (the Models page is the precedent).

**`CardForm` for the servers dictionary.** Rejected: its `set`/`unset` address top-level scalar fields only; dict entries need path ops.

**A deployment-level retry setting.** Rejected twice over: the retry-policy design record rejected LLM-deployment defaults in favor of route-owned policy, and the executor deliberately has no config.
