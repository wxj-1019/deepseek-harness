---
description: "模型可见的 multi_edit 工具：一次调用内跨文件的、先验证后写入的批量字符串编辑。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-multi-edit

[English](README.md) | 中文

## 概述

模型可见的 `multi_edit` 工具：一次调用在[`文件系统接缝`](../../fs/fs/README.zh.md)上跨一个或多个文件应用一批字面量编辑。两阶段：写入前先读取每个目标并统计每个 `oldString`（除 `replaceAll` 外必须恰好出现一次），随后每个文件带版本守卫写入——并发变更会响亮地使该文件失败。同文件编辑按顺序作用在演进内容上；中途失败会把已写入的文件按写入的逆序恢复为批前内容。仅编辑既有文件——创建用 `write`。校验、计数与应用是被单测钉住的纯函数。

## 目录

- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

### 使用指引

#### 模型看到什么

生成的 [`multi_edit` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-multi-edit) 与描述给出两阶段约定：除非设置 `replaceAll`，每个 `oldString` 必须在所属文件恰好出现一次；同文件编辑按顺序作用在演进内容上；带版本守卫的写入遇并发变更会响亮失败；中途失败会回滚已写入的文件。描述还把单次调用限定为 25 处编辑，文件创建交给 `write`。

#### Token 影响

工具可见的每个请求都有固定的 schema 与描述开销；每处编辑都携带字面量 `file`、`oldString`、`newString` 文本，调用输入随批量与内容长度增长，上限 25 处。

#### KV Cache 影响

工具可见性与配置不变时前缀稳定；字面量编辑文本落在可复用前缀之后的历史里，不使既有 KV 缓存条目失效。

### 工具 schema

#### 模型看到什么

模型看到一个对象 schema：必填 `edits` 数组——每项给出 `file`、`oldString`、`newString` 与可选 `replaceAll`——见 [tool-catalog.md#deepseek-aidsh-tool-multi-edit](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-multi-edit)。

#### Token 影响

工具可见的每个请求都有固定的 schema 开销。

#### KV Cache 影响

工具定义不变时前缀稳定。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **恢复为尽力而为** —— 写入失败时会回滚本批已写入的文件；若恢复本身失败，失败信息会点名哪些文件的已编辑内容仍留在磁盘上。
- **仅字面量文本** —— 不支持正则或模糊匹配；`oldString` 必须逐字出现在当前内容中。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

校验、出现计数与应用是单测钉住的纯函数；两阶段写入保证单文件失败不会静默破坏整批。

</details>
