---
description: "会话固定存储域之上的浏览器侧固定会话入口（页头星标与侧栏分区）。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-session-pins

[English](README.md) | 中文

## 概述

Web 置顶会话功能的属主包：`conversation.session.header.actions` 中的星钮，加 `sidebar.pinned` 置顶区块，数据来自 [`session-pins`](../../session/session-pins/README.zh.md) 存储域，经生成的 `sessionPins` Remote 命名空间读写。两个表面共用一个 controller；其快照经注入的 hooks 座位供给，业务组件只持有本地交互状态。

星钮出现在每个会话头部，置顶时填充；侧栏区块按置顶顺序列出置顶会话，跳过归档行（与浏览器实际可见内容一致），点击直达，悬停取消置顶。任何已提交的变更——自己的、其他窗口经白名单 `session-pins/changed` 推送的、以及 `connection/reset`——都会让已加载的集合重拉一次；冷集合在首次渲染前保持冷态。

出口路径是星钮开合与区块的悬停动作；样式只用 token；文案走本包自己的 `sessionPins` locale 命名空间。

## 目录

- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

None，本包向人类渲染用户拥有的应用数据，不触及任何 prompt、消息、schema、流或工具结果。

#### KV Cache 影响

None；本包从不组装或发送 provider 请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **树内没有行级置顶钮** —— 置顶操作是会话头部星钮；行悬停置顶会是 ui-workspace 的改动。
- **置顶会话不在其工作区分组内前移** —— 置顶区块是规范落点；组内重排属于树的属主。
- **搜索结果不带置顶态** —— 搜索行既不标记也不提供置顶。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

固定状态只面向用户，绝不进入会话日志或模型请求；面板与页头星标共享同一 controller。

</details>
