---
description: "设置接缝之上的浏览器侧 MCP 服务器组合设置卡。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-mcp

[English](README.md) | 中文

## 概述

DeepSeek Harness Web UI 的 MCP 服务器设置卡：在插件设置区的可配置标签页里渲染 `mcp` settings 命名空间的服务器列表，提供停用／启用、添加／编辑表单和删除——每次写入都是带版本围栏的路径操作，编辑无需重启即生效（组装管理器监听同一命名空间）。

## 目录

- [用法](#usage)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="usage"></a>
## 用法

由 web-app bundle 挂载。`mcp` 命名空间被服务时（base bundle 的 `@deepseek-ai/dsh-mcp-servers` 始终服务它）卡片出现。每个服务器行显示名称、传输方式和停用状态；添加／编辑表单按传输方式切换字段集（stdio：命令／参数／环境变量／工作目录；streamable-http：URL／请求头），超时与 `failOnStartupError` 收在"高级"折叠区。`env`／`headers` 值可用 `${NAME}` 引用环境变量——原样存储，由管理器在组装时解析。

-----

<a id="model-experience"></a>
## 模型体验

### 组装出的服务器工具

#### 模型看到什么

不直接可见：卡片编辑的 settings 条目由组装管理器变成 `mcp__<serverName>__<rawName>` 工具。增删、停用或编辑服务器都会从下一个组装边界改变该服务器的工具集。

#### Token 影响

间接：与手工编辑 `settings.yaml` 完全一致——每个已注册工具的定义在其注册期间随请求携带；卡片自身不添加任何提示文本。

#### KV Cache 影响

间接：未变化的服务器保持逐字节一致的工具定义；对其条目的任何编辑都会替换该服务器的定义，并可能使复用从第一个变化的 schema token 起失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **暂无重连策略编辑器** —— 高级折叠区携带超时与 `failOnStartupError`；`reconnect` 子策略在有卡片设计前仍仅限 `settings.yaml`。
- **名称编辑会换键** —— 编辑表单禁用名称字段（重命名会使停用引用失联）；重命名等价于先加后删。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

服务器定义持久化在 mcp-servers 设置命名空间；mcp-client 桥接在变更时重新组合并拥有全部连接。

</details>
