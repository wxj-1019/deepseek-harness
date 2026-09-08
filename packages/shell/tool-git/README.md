---
description: "Model-facing structured git tool: one action enum over the shell seam with validated refs and paths."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-git

English | [中文](README.zh.md)

## Summary

Model-facing structured `git` tool over the [`shell`](../../shell/shell/README.md) seam: ONE tool with an action enum. Reads — `status` (porcelain v1 + branch head), `diff` (working tree or `--cached`), `log` (oneline), `show`, `branch` (list). Local writes — `add`, `commit` (message rides stdin through `-F -`, so no shell quoting layer ever sees it), `checkout`, `stash`. Network — `push`/`pull`/`fetch` register only when the deployment sets `network: true`. Discard (`restore`, `checkout` with paths) requires `allowDiscard: true`. Every ref and path is validated against shell metacharacters and leading dashes; validation, command construction, and porcelain parsing are pure functions pinned by unit tests.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

### Guidance

#### What the model sees

The generated [`git` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-git) and description teach one tool with an action enum: reads cover `status`, `diff`, `log`, `show`, and `branch`; local writes cover `add`, `commit`, `checkout`, and `stash`; `push`/`pull`/`fetch` appear only when the deployment sets `network: true`, and discard actions require `allowDiscard: true`. Every ref and path is validated against shell metacharacters and leading dashes.

#### Token effect

Fixed schema and description cost on every request where the tool is visible; the schema varies with the deployment knobs — network actions and discard fields appear only under their flags — and results carry git porcelain text bounded per call.

#### KV Cache effect

Prefix-stable while visibility and the deployment knobs are unchanged; a `network` or `allowDiscard` change may invalidate reuse from the first changed tool definition.

### Tool schema

#### What the model sees

The model sees one object schema whose `action` enum selects the git verb and whose remaining fields are the validated refs, paths, and message, as cataloged at [tool-catalog.md#deepseek-aidsh-tool-git](../../../docs/tool-catalog.md#deepseek-aidsh-tool-git).

#### Token effect

Small fixed schema cost on every request where the tool is visible; enabling `network: true` adds the three network actions and their description lines.

#### KV Cache effect

Prefix-stable while the tool definition is unchanged.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No structured porcelain objects** — status parses to index/worktree/path rows, but diff and log render as git text.
- **Single-repo, session-workspace only** — no pathspec wildcards, no worktree/submodule switching; refs and paths containing whitespace are rejected by validation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Every ref and path is validated against shell metacharacters and leading dashes; command construction and porcelain parsing are pure functions pinned by unit tests.

</details>
