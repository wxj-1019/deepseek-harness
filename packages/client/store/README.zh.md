---
description: "具有显式快照、订阅与生命周期所有权的浏览器可观察状态存储。"
kind: "package-library"
---
# @deepseek-ai/dsh-client-store

[English](README.md) | 中文

## 概述

供 Client 控制器与 renderer 适配器共用的不依赖 React 的 observable 和快照存储基础原语。本包负责同步与 animation-frame 发布、基于 Immer 的更新、浅比较和可选的浏览器持久化；React 钩子的构造仍属于 `@deepseek-ai/dsh-client-ui-renderer`。当 Client 状态必须在不依赖 React 的情况下发布稳定快照时，请使用它。

## 目录

- [远程镜像](#remote-mirrors)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="remote-mirrors"></a>
## 远程镜像

`RemoteMirrorController`（从 `./remote-mirror` 导出）是 Client 面板经由生成的 Remote face 镜像 Host 持有列表的共享骨架。它负责 cold/loading/ready/error 快照生命周期、只读一次的 `ensure`、失败时保留上一份可用列表的 `resync`，以及在向 Host 收敛之前把传输失败与业务失败映射为展示文本的动词包装。各面板包以各自的 Remote face 与列表载荷子类化它，并实现 `read` 与 `applyReady`；行为分歧的动词（例如把错误发布到自有字段的评审决策）留在子类中。

<a id="model-experience"></a>
## 模型体验

无，因为本包提供浏览器侧状态基础原语，不注册任何面向模型的内容。

#### KV Cache 影响

无；这些存储既不组装也不发送模型请求。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

- **持久化仅限浏览器本地**——持久化存储使用 `localStorage` 中的 JSON；非浏览器运行时会禁用持久化，本包也不提供跨设备同步。
- **Web 壳构建输入**——静态 ESM 为 Vite 保留第三方导入；独立消费方自行提供开发依赖（[依赖规则](../AGENTS.md#dependency-declaration)）。


<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。本包只导出库引擎，不创建进程全局状态；每个存储实例由其所属测试覆盖。
