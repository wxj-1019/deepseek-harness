---
description: "面向浏览器用户的 Git 提交轨道会话视图：一个 conversation.view 页签，基于 git-graph 宿主路由渲染会话工作区的分支拓扑历史。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-git-graph

[English](README.md) | 中文

## 概述

`dsh-client-ui-git-graph` 贡献会话视图的「Git」页签（`order: 30`，位于 Usage 右侧）：把会话工作区的提交历史渲染为提交轨道——历史列表之上的圆点、车道与合并弧——行数据来自 git-graph 宿主路由。视图只读：不检出、不修改；翻页追加更早提交，轨道在已加载窗口上重算。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与暂缓工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

官方 Web bundle 已挂载本包。页签出现在会话头部条中，读取 `/git-graph/api`（宿主包 `@deepseek-ai/dsh-git-graph`）；展示会话工作区目录的历史，按需翻页加载更早提交。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

### 设计概念

- **车道几何是纯函数。** `CommitGraphRail` 在已加载窗口上分配车道，输出百分比纵向坐标，因此无论文本换行高度如何，行都在共享边界处相连。
- **轨道按窗口重算。** 翻页不替换任何内容：追加的行根据父哈希确定性地重排车道分配。
- **槽位注册遵循标准套件**——locale 字典、`conversation.view` 条目与类型化 store 遵循客户端插件约定。

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 浏览器插件：locale、页签注册 |
| [`src/client/GitGraphTab.tsx`](src/client/GitGraphTab.tsx) | 页签主体：翻页、分支选择、空态 |
| [`src/client/CommitGraphRail.tsx`](src/client/CommitGraphRail.tsx) | 纯车道分配与轨道几何 |
| [`src/client/api.ts`](src/client/api.ts) | `/git-graph/api` 客户端调用 |
| [`src/client/locales.ts`](src/client/locales.ts) | 双语文案字典 |
| [`src/invariant.ts`](src/invariant.ts) | 不变量伴随（无运行时不变量：渲染是纯投影） |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [提交轨道 Agent Note](../../../.agents/notes/implemented/feature/2026-09-02-git-commit-rail-first-party.zh.md)——第一方轨道背后的设计。
- [宿主路由包](../../web/git-graph/README.zh.md)——提供这些行的只读路由。

-----

<a id="model-experience"></a>
## 模型体验

None, as this package renders user-owned history for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## 已知限制与暂缓工作

<a id="known-limitations-and-deferred-work"></a>

这些限制是当前的包约束，不是任务待办。

- **仅限已加载窗口**——轨道渲染分页窗口并据此重算；超出已加载行的虚拟化暂缓。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：未决的开放问题与方向，不具权威性——已发布行为、限制与已接受的取舍以上述各节与所链接的 Agent Note 为准。

</details>
