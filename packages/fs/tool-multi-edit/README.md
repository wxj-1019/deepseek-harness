# @deepseek-ai/dsh-tool-multi-edit

English | [中文](README.zh.md)

Model-facing `multi_edit` tool: a batch of literal string edits across one or more files in ONE call over the [`filesystem seam`](../../fs/fs/README.md). Two phases: every target is read and every `oldString` counted before anything writes (each must occur exactly once unless `replaceAll`), then each file writes version-guarded — a concurrent change fails that file loudly. Same-file edits apply in order on the evolving content; a mid-batch failure reports which files landed. Edits existing files only — creation uses `write`. Validation, counting, and application are pure functions pinned by unit tests.

## Model Experience

None — the tool renders user-owned filesystem data for a human and never enters a model request beyond its own tool result.

## Known Limitations and Deferred Work

- **Best-effort cross-file atomicity** — the validate phase makes a partial landing unlikely, but a failed write after earlier writes reports rather than rolls back.
- **Literal text only** — no regex or fuzzy matching; the exact `oldString` must appear in the current content.
