# Agent Note: LSP formatting rides the existing edit-plan channel

Status: implemented

English | [中文](2026-08-31-lsp-formatting.zh.md)

## Problem

The LSP seam exposed navigation and rename, but formatting — the other read-side operation a coding agent wants before touching a file — was deferred. Adding it as a separate write tool would have duplicated the preview/permission layer that multi_edit and write already own.

## Decision

`formatting` is a ninth seam operation that normalizes to the SAME result shape as rename: a `workspaceEdit` plan (`LspFileEdits[]`) the model applies with its own file-edit tools. `textDocument/formatting` returns `TextEdit[]` for one document; the normalizer wraps that array as a single-file plan keyed by the queried document's URI (`null` becomes an empty plan), so the tool's schema, rendering, caps, and truncation are reused unchanged. Formatting options (`tabSize`, `insertSpaces`) are NOT model input — they are validated plugin config (`formattingTabSize` default 2, `formattingInsertSpaces` default true) that the tool resolves into the seam request, matching the explicit-resolve boundary convention. Capability gating reuses the per-operation slot map (`documentFormattingProvider`), and the transient didOpen/query/didClose lifecycle applies unchanged.

## Alternatives considered

- **A separate format tool with write integration** — rejected: it would bypass the model's own diff-based review flow and duplicate permission plumbing the edit tools already have.
- **`workspace/applyEdit` from the server** — rejected: the host rejects that request by design; the model owns all disk writes.
- **Model-supplied formatting options** — rejected: indentation style is a deployment-wide convention, not a per-call argument.

## Consequences

- Formatting results render exactly like single-file rename plans; no new output schema.
- Servers without `documentFormattingProvider` fail the query through the standard capability gate.
- The `lsp` tool's operation set grows to nine; option plumbing adds two config fields and no model parameters.
