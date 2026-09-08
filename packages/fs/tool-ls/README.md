---
description: "Model-facing ls tool: one directory listing over the filesystem seam, directories first with sizes and an entry cap."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-ls

English | [中文](README.zh.md)

## Summary

Model-facing `ls` tool: one directory listing over the [`filesystem seam`](../../fs/fs/README.md) (`ctx.fs.listDir`), directories first with a trailing separator, files with byte size when the backend reports it. Session-relative paths resolve against the calling agent's workspace, mirroring `read`/`write`/`edit`. Dot-prefixed entries are hidden unless `all` is set; listings cap at `maxEntries` (default 500) with a dropped-entries note. Sorting and formatting are pure functions pinned by unit tests.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

### Guidance

#### What the model sees

The generated [`ls` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-ls) and description teach the directory-first listing contract: directories carry a trailing separator, files carry byte sizes when reported, dotfiles stay hidden unless `all` is set, and listings cap at `maxEntries` with a dropped-entries note. The description directs discovery-by-pattern to `glob`.

#### Token effect

Fixed schema and description cost on every request where the tool is visible; the result renders the listing body, so result tokens scale with the visible entry count up to the entry cap.

#### KV Cache effect

Prefix-stable while tool visibility and config are unchanged; the data-dependent listing body lands in history after the reusable prefix without invalidating earlier KV-cache entries.

### Tool schema

#### What the model sees

The model sees one object schema with optional `path` (defaulting to the session workspace), optional `all`, and optional `depth` bounded by the deployment maximum, as cataloged at [tool-catalog.md#deepseek-aidsh-tool-ls](../../../docs/tool-catalog.md#deepseek-aidsh-tool-ls).

#### Token effect

Small fixed schema cost on every request where the tool is visible.

#### KV Cache effect

Prefix-stable while the tool definition is unchanged; a config change to `maxEntries` or `maxDepth` may invalidate reuse from the first changed definition.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Direct children only** — no recursive tree mode; use `glob` for discovery.
- **Entry cap** — huge directories drop entries past `maxEntries` with a count note.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Sorting, formatting, and the walk budget are pure functions pinned by unit tests; the deployment tunables are the maxEntries and maxDepth config.

</details>
