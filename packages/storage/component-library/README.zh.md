---
description: "面向宿主与维护者的组件库：把检出的 packages/client 组件学习进持久 domain，并向模型工具、系统提示词、skills 通道与 Web 面板提供服务。"
kind: "package-reference"
---

# @deepseek-ai/dsh-component-library

[English](README.md) | 中文

## 概述

`dsh-component-library` 把本检出的 UI 组件——导出的 React 组件及其 props、`--dsw-*` 设计令牌、JSDoc 摘要与用法示例——学习进 `component_library` 存储 domain，并通过 chokidar 监听器随文件变更持续学习。组件库通过 `component_query` 与 `component_record` 工具、常驻系统提示词段落、生成的 `component-library` skill 提供给模型，并通过 `component-library` settings 命名空间与 Remote 面提供给 Web 面板卡片读取。只在组装 harness 自身的 Web profile 时选择它；它是本仓库的项目局部插件，在仓库之外不产生任何贡献。

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

当 UI 工作应当复用仓库已学习的组件时，把本包组合进 harness 检出自身的 Web profile。官方 Web bundle 已携带该行。

### 配置

两个字段都可省略；组装可以完全省略 `config`。

```yaml
- name: '@deepseek-ai/dsh-component-library'
  config:
    root: /path/to/deepseek-harness
    watch: true
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `root` | 从本包位置向上查找到第一个包含 `packages/client` 的目录 | 被学习的检出根；不含该树的 root 会使加载失败 |
| `watch` | `true` | 冷启动扫描之后继续从文件变更学习 |

### 可观察行为

插件加载时扫描 `packages/client/*/src/client` 中导出的 PascalCase 组件，按序解析每个组件的 props 类型（`<Name>Props`、首个参数标注、导出的 `Props` 类型），收集同基名 CSS module 的 `--dsw-*` 引用，并从组件的 spec 或 JSDoc `@example` 提取用法示例。记录落入 `component_library` domain；每次持久写入在 domain 提交后广播 `component-library/changed`。`watch` 开启时，一个稳定的 `.tsx` 或 `*.module.css` 变更只重新学习一个文件，`.tsx` 删除会移除其记录。来自 `component_record` 的模型贡献记录处于隔离状态（`reviewed: false`），直到在面板上通过审核；除非 `component-library` settings 命名空间设置 `includeUnreviewed`，查询不含它们。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

本包是一个 Cordis 服务插件（`ComponentLibraryService`，Typert Remote 服务），拥有 domain 并编排四个单一职责模块。

### 设计概念

- **只做静态分析。** 抽取器用 TypeScript 编译器 API 解析 `.tsx`，从不执行组件；无法解析或不可读的文件记一行日志跳过，绝不中止。
- **扫描记录是权威。** 扫描写入覆盖同 id 的模型记录且天生已审核；模型工具写入扫描器已覆盖的 id 会被明确拒绝。
- **宁可诚实降级也不臆测。** 无 checker 分析无法解析的 props 类型——联合、含外部操作数的交叉、继承子句——保留原始类型文本并标记 `propsInferred: false`，而不是给出残缺成员列表。
- **无操作写入不广播。** 重扫时忽略 `updatedAt` 比较记录，未变更的文件既不搅动时间戳也不重复广播变更事件。

### 查询排名

`component_query` 用纯字符串打分：精确名称匹配优于包匹配，包匹配优于 jsdoc 关键词，再优于令牌引用；扫描记录排在模型记录之前，已解析 props 排在原始文本之前；未审核的模型记录默认排除，除非 settings 命名空间选择纳入。

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：domain 所有权、Remote 面、管线编排、排名、审核 |
| [`src/types.ts`](src/types.ts) | 公共记录/请求/结果词汇与 `component-library/changed` 事件声明 |
| [`src/spec.ts`](src/spec.ts) | `component_library` domain 的 zod 表 |
| [`src/extract.ts`](src/extract.ts) | 基于 TypeScript AST 的组件、props 与 CSS 令牌引用纯抽取 |
| [`src/tokens.ts`](src/tokens.ts) | 主题样式表解析为分层令牌清单 |
| [`src/scanner.ts`](src/scanner.ts) | 文件系统遍历、逐文件记录装配、spec 示例提取 |
| [`src/watcher.ts`](src/watcher.ts) | 200 毫秒稳定阈值的 chokidar 监听器 |
| [`src/tools.ts`](src/tools.ts) | `component_query` / `component_record` 工具定义 |
| [`src/skill.ts`](src/skill.ts) | 生成的 `component-library` skill provider |
| [`src/invariant.ts`](src/invariant.ts) | 不变量伴随：每次变更广播都必须尾随一次持久 domain 写入 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [组件库插件设计](../../../docs/component-library-plugin.zh.md)——本包实现的设计文档。
- [存储子系统](../../../docs/subsystems/storage.zh.md)——记录所依赖的 storage-domain 契约。
- [存储包地图](../README.zh.md)——该家族的包及其在仓库中的位置。
- [设置卡片包](../../client/ui-component-library/README.zh.md)——本包 Remote 面之上的浏览器面板。

-----

<a id="model-experience"></a>
## 模型体验

### 系统提示词段落

#### 模型看到什么

每个具备能力的 profile 的装配都携带 `component-library:reuse` 段落：指示模型在编写 UI 代码前对目标区域调用 `component_query`，优先复用扫描组件及其 `--dsw-*` 令牌而非发明新原语，并在创建了真正可复用的新组件后调用 `component_record`。

#### Token 影响

插件组合期间每次请求固定增加一小段。

#### KV 缓存影响

前缀稳定；段落文本静态，只随插件组合变化。

### 工具 schema

#### 模型看到什么

模型看到生成的 [`component_query` 与 `component_record` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-component-library)：查询工具接收必填自由文本 `query` 与可选 `pkg` 过滤、`limit`；记录工具接收必填 `name`、`pkg`、`path` 与可选 `props`、`tokens`、`jsdoc`、`example`。两份描述都说明了何时使用各工具。

#### Token 影响

工具可见时每次请求固定增加两份 schema。

#### KV 缓存影响

定义与可见性不变时前缀稳定。

### 工具调用结果

#### 模型看到什么

`component_query` 成功时渲染紧凑的排名列表——每个匹配含名称、包、路径、props、令牌、示例——或空库指引。`component_record` 成功时确认被隔离的 id；失败会点名拒绝原因（例如扫描器已覆盖的 id）。

#### Token 影响

结果 token 随匹配数量与记录的 props 伸缩；受 `limit` 约束（默认 10）。

#### KV 缓存影响

仅追加；结果跟在可复用请求前缀之后。

### Skill 正文

#### 模型看到什么

加载 `component-library` skill 返回生成的正文：复用简介、`--dsw-static` / `--dsw-alias` / `--dsw-specific` 分层约定（含实时数量与样例），以及按包分组的当前组件清单。

#### Token 影响

模型加载该 skill 前为零；加载后正文随组件库规模伸缩。

#### KV 缓存影响

正文随组件库变更而重新生成，已加载的快照可能过期；skill 内容仅追加进 transcript。

## 已知限制与暂缓工作

<a id="known-limitations-and-deferred-work"></a>

这些限制是当前的包约束，不是任务待办。

- **无 checker 的 props 抽取**——跨文件或其他动态 props 类型保留原始文本而非成员列表，因此这类组件的查询结果没有结构化 props 列表。
- **设计上项目局部**——组件库只学习其运行的检出；跨项目共享不在范围内。
- **加载时的冷启动扫描开销**——首次遍历会解析每个客户端组件文件，然后插件才完成加载。
- **示例随其 spec 漂移**——提取的挂载片段在所属文件下一次扫描时刷新，而不是 spec 变更时。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：未决的开放问题与方向，不具权威性——已发布行为、限制与已接受的取舍以上述各节与所链接的设计文档为准。

#### 未来：conversation view 与快照覆盖

设计文档把 `conversation.view` 浏览页签与免密钥录制会话 walkthrough 推迟到工具稳定之后；两者作为后续项落地，不改变本包的 seam。

</details>
