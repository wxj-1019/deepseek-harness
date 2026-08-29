# @deepseek-ai/dsh-tool-ls

English | [中文](README.zh.md)

Model-facing `ls` tool: one directory listing over the [`filesystem seam`](../../fs/fs/README.md) (`ctx.fs.listDir`), directories first with a trailing separator, files with byte size when the backend reports it. Session-relative paths resolve against the calling agent's workspace, mirroring `read`/`write`/`edit`. Dot-prefixed entries are hidden unless `all` is set; listings cap at `maxEntries` (default 500) with a dropped-entries note. Sorting and formatting are pure functions pinned by unit tests.

## Model Experience

None — the tool renders user-owned filesystem data for a human and never enters a model request beyond its own tool result.

## Known Limitations and Deferred Work

- **Direct children only** — no recursive tree mode; use `glob` for discovery.
- **Entry cap** — huge directories drop entries past `maxEntries` with a count note.
