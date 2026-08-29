# @deepseek-ai/dsh-tool-git

[English](README.md) | 中文

模型可见的结构化 `git` 工具，经 [`shell`](../../shell/shell/README.zh.md) 接缝执行：一个工具带动作枚举。读——`status`（porcelain v1 + 分支头）、`diff`（工作树或 `--cached`）、`log`（oneline）、`show`、`branch`（列表）。本地写——`add`、`commit`（提交信息经 stdin 走 `-F -`，shell 引号层完全接触不到）、`checkout`、`stash`。网络——仅在部署设置 `network: true` 时注册 `push`/`pull`/`fetch`。丢弃（`restore`、带路径的 `checkout`）需要 `allowDiscard: true`。每个 ref 与路径都按 shell 元字符和前导短横线校验；校验、命令构造与 porcelain 解析是被单测钉住的纯函数。

## Model Experience

None——本工具向人类渲染仓库状态，除自身工具结果外不进入模型请求。

## Known Limitations and Deferred Work

- **无结构化 porcelain 对象** —— status 解析为索引/工作树/路径行，diff 与 log 仍为 git 文本。
- **仅会话工作区单仓库** —— 无 pathspec 通配、无 worktree/子模块切换。
