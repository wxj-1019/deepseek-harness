---
description: "模型可见的结构化 git 工具：shell 接缝上的单一动作枚举，ref 与路径全部校验。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-git

[English](README.md) | 中文

## 概述

模型可见的结构化 `git` 工具，经 [`shell`](../../shell/shell/README.zh.md) 接缝执行：一个工具带动作枚举。读——`status`（porcelain v1 + 分支头）、`diff`（工作树或 `--cached`）、`log`（oneline）、`show`、`branch`（列表）。本地写——`add`、`commit`（提交信息经 stdin 走 `-F -`，shell 引号层完全接触不到）、`checkout`、`stash`。网络——仅在部署设置 `network: true` 时注册 `push`/`pull`/`fetch`。丢弃（`restore`、带路径的 `checkout`）需要 `allowDiscard: true`。每个 ref 与路径都按 shell 元字符和前导短横线校验；校验、命令构造与 porcelain 解析是被单测钉住的纯函数。

## 目录

- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

### 使用指引

#### 模型看到什么

生成的 [`git` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-git) 与描述给出一个带动作枚举的工具：读覆盖 `status`、`diff`、`log`、`show`、`branch`；本地写覆盖 `add`、`commit`、`checkout`、`stash`；`push`/`pull`/`fetch` 仅在部署设置 `network: true` 时出现，丢弃类动作需要 `allowDiscard: true`。每个 ref 与路径都按 shell 元字符与前导短横线校验。

#### Token 影响

工具可见的每个请求都有固定的 schema 与描述开销；schema 随部署旋钮变化——网络动作与丢弃字段只在对应开关下出现——结果携带按次有界的 git porcelain 文本。

#### KV Cache 影响

可见性与部署旋钮不变时前缀稳定；`network` 或 `allowDiscard` 变更可能使自首个变化定义起的复用失效。

### 工具 schema

#### 模型看到什么

模型看到一个对象 schema：`action` 枚举选择 git 动词，其余字段为校验后的 ref、路径与提交信息，见 [tool-catalog.md#deepseek-aidsh-tool-git](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-git)。

#### Token 影响

工具可见的每个请求都有固定的 schema 开销；开启 `network: true` 会新增三个网络动作及其描述行。

#### KV Cache 影响

工具定义不变时前缀稳定。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **无结构化 porcelain 对象** —— status 解析为索引/工作树/路径行，diff 与 log 仍为 git 文本。
- **仅会话工作区单仓库** —— 无 pathspec 通配、无 worktree/子模块切换；含空白字符的 ref 与路径会被校验拒绝。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

所有 ref 与路径都针对 shell 元字符与前导横线做校验；命令构造与 porcelain 解析是单测钉住的纯函数。

</details>
