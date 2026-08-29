# @deepseek-ai/dsh-tool-git

English | [中文](README.zh.md)

Model-facing structured `git` tool over the [`shell`](../../shell/shell/README.md) seam: ONE tool with an action enum. Reads — `status` (porcelain v1 + branch head), `diff` (working tree or `--cached`), `log` (oneline), `show`, `branch` (list). Local writes — `add`, `commit` (message rides stdin through `-F -`, so no shell quoting layer ever sees it), `checkout`, `stash`. Network — `push`/`pull`/`fetch` register only when the deployment sets `network: true`. Discard (`restore`, `checkout` with paths) requires `allowDiscard: true`. Every ref and path is validated against shell metacharacters and leading dashes; validation, command construction, and porcelain parsing are pure functions pinned by unit tests.

## Model Experience

None — the tool renders repository state for a human and never enters a model request beyond its own tool results.

## Known Limitations and Deferred Work

- **No structured porcelain objects** — status parses to index/worktree/path rows, but diff and log render as git text.
- **Single-repo, session-workspace only** — no pathspec wildcards, no worktree/submodule switching; refs and paths containing whitespace are rejected by validation.
