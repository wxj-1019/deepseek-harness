---
description: "模型可见的 compact 工具：经压缩接缝请求对当前会话做手动压缩。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-compact

[English](README.md) | 中文

## 概述

模型可见的 `compact` 工具：经[`压缩`](../../compaction/compaction/README.zh.md)接缝（`ctx.compaction.compactNow`）请求对当前会话执行人工压缩——与人用的 `/compact` 命令同一条路径。结果报告压缩范围（历史条目与 token），或结构化失败（busy / changed / summary / commit / persistence / cancelled）作为错误结果；对话绝不会被静默降级。

## 目录

- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

### 使用指引

#### 模型看到什么

生成的 [`compact` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-compact) 与描述把人工压缩呈现为与人工 `/compact` 命令同一条路径：用摘要替换已过时的细节以释放上下文，并报告压缩范围或结构化原因（busy、changed、summary、commit、persistence、cancelled），而不是静默降级对话。

#### Token 影响

工具可见的每个请求都有固定的 schema 与描述开销；调用不带参数，结果是简短的范围或失败报告，而不是被压缩的历史本身。

#### KV Cache 影响

工具可见性不变时前缀稳定。一次成功的压缩会重写会话历史，使被压缩区间的 KV 缓存复用失效；工具定义本身仍可复用。

### 工具 schema

#### 模型看到什么

模型看到一个无参数的对象 schema，见 [tool-catalog.md#deepseek-aidsh-tool-compact](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-compact)。

#### Token 影响

工具可见的每个请求都有固定的 schema 开销。

#### KV Cache 影响

工具定义不变时前缀稳定。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **无范围压缩** —— 本工具压缩标准人工范围；可选范围属于压缩接缝的能力。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

该工具是 ctx.compaction.compactNow 的薄封装；失败分类与摘要撰写属于压缩接缝。

</details>
