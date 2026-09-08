---
description: "Model-facing task tools: discover npm scripts and run one through the configured package manager."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-tasks

English | [中文](README.zh.md)

## Summary

Model-facing task runner: `task_list` discovers the npm scripts of the session workspace's `package.json`, and `task_run` executes one through the configured package manager (default `npm`) via the [`shell`](../../shell/shell/README.md) seam, reporting the exit code and a bounded combined-output tail. A nonzero exit is a normal report, not a transport failure. Script discovery and output tailing are pure functions pinned by unit tests.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

### Guidance

#### What the model sees

The generated [`task_list` and `task_run` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-tasks) and descriptions teach discovery-then-run: `task_list` names the npm scripts of the session workspace's `package.json`, and `task_run` executes one through the configured package manager, reporting the exit code and a bounded combined-output tail with stdout before stderr. A nonzero exit is a normal result, not a transport failure.

#### Token effect

Fixed schema and description cost on every request where the tools are visible; `task_run` input is the script name plus an optional workspace path, and the result tail is bounded per call.

#### KV Cache effect

Prefix-stable while tool visibility is unchanged; the bounded output tail lands in history after the reusable prefix without invalidating earlier KV-cache entries.

### Tool schema

#### What the model sees

The model sees two object schemas: `task_list` takes no properties, and `task_run` requires `script` with an optional `workspace` path, as cataloged at [tool-catalog.md#deepseek-aidsh-tool-tasks](../../../docs/tool-catalog.md#deepseek-aidsh-tool-tasks).

#### Token effect

Small fixed schema cost on every request where the tools are visible.

#### KV Cache effect

Prefix-stable while the tool definitions are unchanged.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Workspace root only** — scripts resolve from the session workspace's package.json; nested workspaces are not discovered.
- **No structured failure parsing** — the output tail is verbatim; summarizing failures is deferred.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Script discovery and output tailing are pure functions pinned by unit tests; a nonzero exit is a normal report, not a failure path.

</details>
