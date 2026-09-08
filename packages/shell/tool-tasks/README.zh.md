---
description: "模型可见的任务工具：发现 npm 脚本，并经配置的包管理器运行其一。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-tasks

[English](README.md) | 中文

## 概述

模型可见的任务运行器：`task_list` 发现会话工作区 `package.json` 的 npm 脚本，`task_run` 经 [`shell`](../../shell/shell/README.zh.md) 接缝用配置的包管理器（默认 `npm`）执行其一，报告退出码与有界的合并输出尾部。非零退出是正常报告而非传输失败。脚本发现与输出截尾是被单测钉住的纯函数。

## 目录

- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

### 使用指引

#### 模型看到什么

生成的 [`task_list` 与 `task_run` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-tasks) 与描述给出先发现后运行的约定：`task_list` 列出会话工作区 `package.json` 的 npm 脚本，`task_run` 经配置的包管理器执行其一，报告退出码与有界合并输出尾部（stdout 在前，stderr 在后）。非零退出是正常结果而非传输失败。

#### Token 影响

工具可见的每个请求都有固定的 schema 与描述开销；`task_run` 输入是脚本名加可选工作区路径，结果尾部按次有界。

#### KV Cache 影响

工具可见性不变时前缀稳定；有界的输出尾部落在可复用前缀之后的历史里，不使既有 KV 缓存条目失效。

### 工具 schema

#### 模型看到什么

模型看到两个对象 schema：`task_list` 无属性，`task_run` 必填 `script` 并带可选 `workspace` 路径，见 [tool-catalog.md#deepseek-aidsh-tool-tasks](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-tasks)。

#### Token 影响

工具可见的每个请求都有固定的 schema 开销。

#### KV Cache 影响

工具定义不变时前缀稳定。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **仅工作区根** —— 脚本只从会话工作区的 package.json 解析；不发现嵌套工作区。
- **无结构化失败解析** —— 输出尾部原样呈现；失败摘要属于后延。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

脚本发现与输出截尾是单测钉住的纯函数；非零退出是正常报告而非失败路径。

</details>
