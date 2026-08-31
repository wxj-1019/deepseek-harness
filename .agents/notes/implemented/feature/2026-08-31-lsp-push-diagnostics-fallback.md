# Agent Note: push diagnostics back a pull miss instead of failing

Status: implemented

English | [中文](2026-08-31-lsp-push-diagnostics-fallback.zh.md)

## Problem

Server-to-client notifications were dropped at the connection's decode loop, and a `diagnostics` query against a server without pull support failed outright — even though most such servers push `publishDiagnostics` the moment a document opens, which the transient open lifecycle already triggers on every query.

## Decision

- `LspConnection` gains an `onNotification` registry; the decode loop fans every notification out to listeners, isolating each invocation so a throwing listener cannot kill the stream.
- `LspInstance` subscribes to `textDocument/publishDiagnostics`, normalizes each push (`normalizePublishDiagnostics`; malformed pushes are dropped as server noise, never surfaced as query failures), and caches the latest set per document URI, bounded by oldest-entry eviction at 32 documents.
- A `diagnostics` query against a server without pull support no longer fails: the transient open runs, the query waits a bounded `publishGraceMs` (server config, default 250 ms) for a push NEWER than the query's start, and returns it — or an empty set when the grace lapses quietly. Pull-backed queries are unchanged; the wait rides only the caller's abort signal, and grace expiry exits through the loop's cache check rather than a rejection.

## Alternatives considered

- **Hold documents open to receive pushes continuously** — rejected: it would abandon the transient-open lifecycle that keeps no per-document state and complicates pooling; the bounded wait gets the same freshness inside the existing window.
- **Fail loud without pull support (previous behavior)** — rejected: it made every push-only server useless to the tool despite the push channel carrying the same data.
- **Surface pushes as unsolicited events to the model** — rejected: model-visible input must be requested; the tool-owned query remains the only diagnostics surface.

## Consequences

- Push-only servers now answer `lsp` diagnostics queries; the cost is at most one bounded grace per query on servers without pull support.
- The cache holds at most 32 documents; malformed pushes never reject a query.
- `publishGraceMs` joins the validated per-server config; the wait adds no latency to servers that do support pull.
