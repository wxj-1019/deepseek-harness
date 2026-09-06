---
description: "面向 Web 维护者的只读 git 提交历史路由：经 shell seam 提供带父提交的日志行与分支名，由会话视图的提交轨道消费。"
kind: "package-reference"
---

# @deepseek-ai/dsh-git-graph

[English](README.md) | 中文

## 概述

`dsh-git-graph` 为 Web UI 的提交轨道提供服务：一个只读的 `/git-graph/api` 前缀路由，针对仓库工作目录返回带父提交的日志行与本地分支名。每行以分隔符记录携带轨道所需的全部字段（哈希、主题、作者、日期、装饰、父提交、提交时间），客户端无需第二次请求即可渲染车道。路由经 shell seam 的子进程纪律运行 git，永远不会改动工作树。

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

官方 Web bundle 已挂载本包；会话视图的提交轨道经 Web 服务器的认证 API 面消费其路由。只要路由的组装直接添加插件行即可。

### 路由契约

`POST /git-graph/api/log` 携带 `{ cwd, count?, skip? }` 返回 `{ ok: true, value: { entries, hasMore } }`——一页历史行（最新在前）加分页标记；`POST /git-graph/api/branch` 携带 `{ cwd }` 返回 `{ ok: true, value: string[] }`。工作目录校验为绝对路径；失败返回 `{ ok: false, error: { code, message } }`。每个处理器按构造只读：不 checkout、不改动、不联网。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

### 设计概念

- **一次提交一条分隔符记录。** git log 格式用单元分隔符界定每行，解析永远不会猜错主题与作者的分界。
- **父提交信息而非着色。** 路由返回原始父哈希；车道由客户端推导，Host 对渲染策略保持无知。
- **两级工作目录解析。** 显式 `cwd` 优先（校验绝对路径）；否则宿主经挂载的 `SessionStore` 解析会话头的 `cwd`——经 `sessionController.inspect` 的完整会话日志重放在长会话上会卡顿，只作兜底。

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`/git-graph/api` 路由注册与 cwd 解析 |
| [`src/parse.ts`](src/parse.ts) | 遵循分隔符契约的日志行与分支名解析 |
| [`src/invariant.ts`](src/invariant.ts) | 不变量伴随（无运行时不变量：正确性即只读路由契约） |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [提交轨道 Agent Note](../../../.agents/notes/implemented/feature/2026-09-02-git-commit-rail-first-party.zh.md)——第一方轨道背后的设计。
- [客户端包](../../client/ui-git-graph/README.zh.md)——渲染这些行的会话视图。

-----

<a id="model-experience"></a>
## 模型体验

None, as this package serves HTTP routes to the web client and registers no prompt, tool, schema, or session event.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## 已知限制与暂缓工作

<a id="known-limitations-and-deferred-work"></a>

这些限制是当前的包约束，不是任务待办。

- **仅本地分支**——分支列表读取本地引用；远程跟踪分支是明确的裁剪。
- **无历史缓存**——每页都重新运行 git；大仓库按页支付子进程开销。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：未决的开放问题与方向，不具权威性——已发布行为、限制与已接受的取舍以上述各节与所链接的 Agent Note 为准。

</details>
