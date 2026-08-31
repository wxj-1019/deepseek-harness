# Agent Note: call hierarchy chains prepare with a direction query

Status: implemented

English | [中文](2026-08-31-lsp-call-hierarchy.zh.md)

## Problem

The seam exposed navigation, rename, formatting, and diagnostics, but no call hierarchy: a model asking "who calls this function?" had to fall back to textual reference digging.

## Decision

`incomingCalls` and `outgoingCalls` are two cursor operations sharing one flow: the instance sends `textDocument/prepareCallHierarchy` at the cursor, takes the first prepared symbol (empty result becomes an empty call list), then issues `callHierarchy/incomingCalls` or `callHierarchy/outgoingCalls` with that symbol. Each leg races abort under its own request id. Both operations normalize to one shared `calls` row shape — far-end symbol identity (name, kind, URI, selection range preferred, container) plus its call-site spans — gated on the single `callHierarchyProvider` capability slot, and covered by the transient-open lifecycle like every document query. The tool renders one bounded line per call (`where container.name — N call site(s)`).

## Alternatives considered

- **One `callHierarchy` operation with a direction argument** — rejected: the seam's closed union treats distinct model intents as distinct operations, and direction-as-argument would need its own validation for no benefit.
- **Expose raw `CallHierarchyItem`s to the model** — rejected: the seam normalizes protocol shapes; the model consumes rows, not items.

## Consequences

- Servers without `callHierarchyProvider` fail both operations through the standard capability gate.
- A prepare that yields no symbol resolves to an empty call list rather than an error.
- The operation count rises to eleven; each new operation was a compile-forced update across seam, provider, and tool.
