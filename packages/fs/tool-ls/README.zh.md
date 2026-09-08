---
description: "模型可见的 ls 工具：经文件系统接缝列出一个目录，目录在前、附带大小与条目上限。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-ls

[English](README.md) | 中文

## 概述

模型可见的 `ls` 工具：经[`文件系统接缝`](../../fs/fs/README.zh.md)（`ctx.fs.listDir`）列出一个目录——目录在前并带尾分隔符，文件在后端可报告时附带字节大小。会话相对路径按调用方 agent 的工作区解析，与 `read`/`write`/`edit` 一致。点前缀条目默认隐藏，`all` 打开；列表上限 `maxEntries`（默认 500），超出部分附条数说明。排序与格式化是被单测钉住的纯函数。

## 目录

- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

### 使用指引

#### 模型看到什么

生成的 [`ls` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-ls) 与描述给出目录在前的列表约定：目录带尾分隔符，文件在后端可报告时附字节大小，点前缀条目默认隐藏、`all` 打开，列表在 `maxEntries` 处截断并附条数说明。描述把按模式发现文件指向 `glob`。

#### Token 影响

工具可见的每个请求都有固定的 schema 与描述开销；结果体是列表正文，结果 token 随可见条目数增长直至条目上限。

#### KV Cache 影响

工具可见性与配置不变时前缀稳定；数据相关的列表正文落在可复用前缀之后的历史里，不使既有 KV 缓存条目失效。

### 工具 schema

#### 模型看到什么

模型看到一个对象 schema：可选 `path`（默认会话工作区）、可选 `all`、可选 `depth`（受部署上限约束），见 [tool-catalog.md#deepseek-aidsh-tool-ls](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-ls)。

#### Token 影响

工具可见的每个请求都有固定的 schema 开销。

#### KV Cache 影响

工具定义不变时前缀稳定；`maxEntries` 或 `maxDepth` 配置变更可能使自首个变化定义起的复用失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **仅直接子项** —— 无递归树模式；发现用 `glob`。
- **条目上限** —— 超大目录在 `maxEntries` 处截断并附条数说明。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

排序、格式化与遍历预算是单测钉住的纯函数；部署侧可调项是 maxEntries 与 maxDepth 配置。

</details>
