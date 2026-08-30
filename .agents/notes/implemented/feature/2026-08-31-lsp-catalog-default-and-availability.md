# Agent Note: LSP language catalog defaults on and annotates availability

Status: implemented

English | [中文](2026-08-31-lsp-catalog-default-and-availability.zh.md)

## Problem

The `lsp-stdio` built-in language catalog documented `catalog` as "true by default", but the implementation required an explicit `config.catalog === true` — omitted configuration mounted no seeds, the opposite of the recorded contract. The probe outcome for each seed (resolved executable vs absent) was discarded after load, and no surface told the model which languages an `lsp` query could actually serve: on a host with servers installed, the model had no way to know `lsp` would work, and on a bare host it could only discover failure per query.

## Decision

- `catalog` is declared in the plugin `Config` schema with default `true`; omission now mounts the built-in TypeScript and Python seeds, matching the documented contract. A seed whose executable is absent is still a skip, not an error; explicit entries that fail still fail loud; catalog off with an empty table is still rejected at load. `mergeServersWithCatalog` extracts the seed-merge as a pure function so default-on semantics are pinned without I/O.
- The plugin retains which providers resolved and registers a bounded `lsp:language-catalog` system-prompt section listing each server's id, extensions, and languages. The model can therefore aim `lsp` queries only at servable files. The section is absent when no provider resolves. Extension and server counts are capped so a large server table cannot inflate the prompt; absent binaries stay on the console warning path (a human concern, not a model-visible one).

Mounting the section required adding `systemPrompt` to the plugin's `inject`; the tests that mount `lsp-stdio` directly now mount `@deepseek-ai/dsh-system-prompt` alongside it, and the specs that exercise explicit-server semantics pass `catalog: false` explicitly — omission no longer means off.

## Alternatives considered

- **Keep omission-off and fix the doc** — rejected: the documented default-on contract is the design; bare-host safety comes from seed skipping, which already exists.
- **Annotate availability on a per-query error** — rejected: teaches the model one extension at a time, after a failed call; the section prevents the failed call.
- **Expose the catalog through a tool output field** — rejected: the model needs availability before choosing to call, not inside an unrelated result.

## Consequences

- Hosts with `typescript-language-server` or `pyright-langserver` on PATH now get those providers without explicit configuration; hosts without them behave as before (no providers, loud per-query misses).
- Configurations that omitted `catalog` and relied on omission meaning off must set `catalog: false` explicitly.
- The prompt gains at most a few hundred bytes, bounded by the section caps.
