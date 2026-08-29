# @deepseek-ai/dsh-tool-compact

English | [中文](README.zh.md)

Model-facing `compact` tool: request manual compaction of the current session through the [`compaction`](../../compaction/compaction/README.md) seam (`ctx.compaction.compactNow`) — the same path the human `/compact` command uses. The result reports the compacted scope (history items and tokens), or the structured failure (busy / changed / summary / commit / persistence / cancelled) as an error result; the conversation is never silently degraded.

## Model Experience

The tool result is the model-visible surface: it reports the compacted scope or the structured failure. The compaction summary itself is session content authored by the compaction seam, not by this package.

## Known Limitations and Deferred Work

- **No scoped compaction** — the tool compacts the standard manual range; selectable spans are a compaction-seam capability.
