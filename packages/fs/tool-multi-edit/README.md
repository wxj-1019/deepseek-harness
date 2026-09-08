---
description: "Model-facing multi_edit tool: a verified, version-guarded batch of literal string edits across files in one call."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-multi-edit

English | [中文](README.zh.md)

## Summary

Model-facing `multi_edit` tool: a batch of literal string edits across one or more files in ONE call over the [`filesystem seam`](../../fs/fs/README.md). Two phases: every target is read and every `oldString` counted before anything writes (each must occur exactly once unless `replaceAll`), then each file writes version-guarded — a concurrent change fails that file loudly. Same-file edits apply in order on the evolving content; a mid-batch failure rolls already-written files back to their pre-batch content in reverse write order. Edits existing files only — creation uses `write`. Validation, counting, and application are pure functions pinned by unit tests.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

### Guidance

#### What the model sees

The generated [`multi_edit` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-multi-edit) and description teach the two-phase contract: every `oldString` must occur exactly once in its file unless `replaceAll` is set, same-file edits apply in order on the evolving content, a version-guarded write fails that file loudly on a concurrent change, and a mid-batch failure rolls already-written files back. The description bounds one call at 25 edits and defers file creation to `write`.

#### Token effect

Fixed schema and description cost on every request where the tool is visible; each edit carries literal `file`, `oldString`, and `newString` text, so call input scales with batch size and content length up to the 25-edit cap.

#### KV Cache effect

Prefix-stable while tool visibility and config are unchanged; the literal edit text lands in history after the reusable prefix without invalidating earlier KV-cache entries.

### Tool schema

#### What the model sees

The model sees one object schema with a required `edits` array — each entry names `file`, `oldString`, and `newString` with an optional `replaceAll` — as cataloged at [tool-catalog.md#deepseek-aidsh-tool-multi-edit](../../../docs/tool-catalog.md#deepseek-aidsh-tool-multi-edit).

#### Token effect

Small fixed schema cost on every request where the tool is visible.

#### KV Cache effect

Prefix-stable while the tool definition is unchanged.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Restoration is best effort** — a failed write rolls back the files the batch already wrote; if a restore itself fails, the failure names the files whose edited content remains on disk.
- **Literal text only** — no regex or fuzzy matching; the exact `oldString` must appear in the current content.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Validation, occurrence counting, and application are pure functions pinned by unit tests; the two-phase write keeps one file failure from silently corrupting the batch.

</details>
