# @deepseek-ai/dsh-tool-tasks

English | [中文](README.zh.md)

Model-facing task runner: `task_list` discovers the npm scripts of the session workspace's `package.json`, and `task_run` executes one through the configured package manager (default `npm`) via the [`shell`](../../shell/shell/README.md) seam, reporting the exit code and a bounded combined-output tail. A nonzero exit is a normal report, not a transport failure. Script discovery and output tailing are pure functions pinned by unit tests.

## Model Experience

None — the tools render process output for a human and never enter a model request beyond their own tool results.

## Known Limitations and Deferred Work

- **Workspace root only** — scripts resolve from the session workspace's package.json; nested workspaces are not discovered.
- **No structured failure parsing** — the output tail is verbatim; summarizing failures is deferred.
