# Agent Note: rename can be applied by the host, opt-in

Status: implemented

English | [中文](2026-08-31-lsp-rename-host-apply.zh.md)

## Problem

`rename` returned a workspace-edit plan that the model applied with its own file-edit tools. For a mechanical multi-file rename, hand-transcribing every plan entry back into edit calls is lossy busywork the model can get wrong.

## Decision

`rename` gains a model-visible `apply` flag, default `false`. With `apply: true` the tool converts the plan itself: each `file:` URI becomes an absolute path that must resolve inside the session workspace (non-`file:` schemes and outside paths reject the whole call before any write), the text edits fold into the current content (applied end-of-document first; overlaps and out-of-range coordinates reject), and each file writes through the version-guarded replace intent. A mid-apply write failure rolls written files back to their pre-apply content — restores ride no signal, matching the multi_edit rollback contract. The tool then reports `{kind: 'rename-applied', applied, files}`; without the flag the plan-only behavior is unchanged.

## Alternatives considered

- **Always apply** — rejected: the plan-first default keeps the model's diff-based review as the primary path.
- **Server-side `workspace/applyEdit`** — rejected: the host rejects that request by design.
- **Apply in the provider** — rejected: the tool owns model-facing policy and already holds the session workspace; keeping application there leaves the seam host-neutral.

## Consequences

- The `lsp` tool now writes when asked; `inject` gains `fs`, and the tool is read-only only when `apply` is unset.
- Containment is enforced against the session workspace, so a language server cannot move the write outside it.
- Rollback semantics mirror multi_edit: a failed apply leaves the workspace as it was, except for named restore failures.
