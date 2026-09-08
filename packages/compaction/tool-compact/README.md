---
description: "Model-facing compact tool: request manual compaction of the current session through the compaction seam."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-compact

English | [中文](README.zh.md)

## Summary

Model-facing `compact` tool: request manual compaction of the current session through the [`compaction`](../../compaction/compaction/README.md) seam (`ctx.compaction.compactNow`) — the same path the human `/compact` command uses. The result reports the compacted scope (history items and tokens), or the structured failure (busy / changed / summary / commit / persistence / cancelled) as an error result; the conversation is never silently degraded.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

### Guidance

#### What the model sees

The generated [`compact` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-compact) and description present manual compaction as the same path as the human `/compact` command: replace superseded detail with a summary to free context, reporting the compacted scope or a structured reason (busy, changed, summary, commit, persistence, cancelled) instead of silently degrading the conversation.

#### Token effect

Fixed schema and description cost on every request where the tool is visible; the call carries no parameters, and the result is the short scope or failure report rather than the compacted history itself.

#### KV Cache effect

Prefix-stable while tool visibility is unchanged. A successful compaction rewrites the session history, which invalidates KV-cache reuse from the compacted span; the tool definition itself stays reusable.

### Tool schema

#### What the model sees

The model sees a parameterless object schema, as cataloged at [tool-catalog.md#deepseek-aidsh-tool-compact](../../../docs/tool-catalog.md#deepseek-aidsh-tool-compact).

#### Token effect

Small fixed schema cost on every request where the tool is visible.

#### KV Cache effect

Prefix-stable while the tool definition is unchanged.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No scoped compaction** — the tool compacts the standard manual range; selectable spans are a compaction-seam capability.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The tool is a thin caller of ctx.compaction.compactNow; the failure taxonomy and summary authoring belong to the compaction seam.

</details>
