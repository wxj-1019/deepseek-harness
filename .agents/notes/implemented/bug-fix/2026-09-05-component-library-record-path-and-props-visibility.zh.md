# Agent Note: Component library record-path normalization and unresolved-props visibility

Status: implemented

[English](2026-09-05-component-library-record-path-and-props-visibility.md) | 中文

## Problem

组件库的 `component_record` 写入路径从模型提供的 `path` 派生记录 id，当 `/packages\/client\/([^/]+)/` 提取落空时静默回退到 npm 包名。任何正则之外的路径形态——Windows 宿主上模型自然会输出的反斜杠分隔符，或绝对检出前缀——都会产生落在扫描器 `<包目录>/<Name>` id 空间之外的 id。扫描器碰撞拒绝随之失效：模型可以把已被扫描的组件记录成近重复项，且分叉记录无限期地在重扫中存活，因为重扫只清理过期的 *scanned* 记录。本包声明的后条件——扫描记录是权威的、模型写入扫描器已覆盖的 id 会被明确拒绝——恰恰在边界最该起作用的输入上无法成立。

另一个独立问题：查询投影丢弃了记录的 `propsInferred` 与 `rawProps` 字段。无 checker 抽取对本检出大多数已学习组件解析不出成员（props 类型从其他文件导入、继承子句、以及仓库的 `PropsRuntime`/`PropsLocale`/`InjectFace` 交叉模式），于是 `component_query` 把这些组件呈现为 `props: (none)`——这是错误信息，会诱导模型在不知道真实 props 的情况下使用组件。

## Decision

`ComponentLibraryService.contribute` 在从 path 派生任何东西之前先归一化：反斜杠转为分隔符，路径在第一个 `packages/client/` 段处截断，未指向该树下文件的 path 返回 `invalid-record`——包名回退不复存在。记录存储归一化后的仓库相对路径，因此派生的 id 始终落在扫描器的 id 空间内，碰撞拒绝覆盖每一种输入形态。

`ComponentMatch` 携带 `propsInferred` 与 `rawProps`，`component_query` 的 wire schema 包含两者，工具渲染把未解析的 props 呈现为 `unresolved: <原始类型文本>` 而不是 `(none)`。已解析但为空的 props 仍渲染 `(none)`。

## Alternatives considered

**保留回退并写进文档。** 扫描器权威后条件依然无法成立，分叉的模型记录会继续污染持久集，除了人工审核没有清理路径。

**一律拒绝非规范路径。** 校验严格，但 Windows 宿主上的模型自然输出反斜杠路径，而归一化是确定且廉价的；容错零成本还能保住单一 id 空间，直接拒绝只会增加失败却不增加保证。

**用 TypeScript checker（`ts.createProgram`）解析 props。** 对未解析占比（含 `PropsRuntime` 交叉模式）这是正确的长期答案，但它推翻了已成文的 checker-free 设计概念，且冷启动成本未测量。暂缓；原始类型文本已经携带了模型使用组件所需的信息。

**把 `rawProps` 排除在匹配之外，靠源码路径代替。** 模型得逐个读组件文件才能知道 props，这抵消了组件库的存在意义，且 `(none)` 是主动的错误信息而非信息缺失。

## Consequences

扫描器权威后条件现在对模型可能输出的每一种路径形态都成立，模型记录存储的路径与扫描记录直接可比。查询结果为未解析的大多数组件呈现真实类型文本，而不是否认其 props。作为交换，`component_record` 拒绝 `packages/client` 之外的任意路径——写在别处的组件本来就没有可学习的记录，扫描器只遍历那棵树——且每个匹配在 wire 上增加两个有界字段。

## Testing

`service.spec.ts` 钉住反斜杠绝对路径归一化到扫描器 id 空间、经反斜杠路径抵达的碰撞拒绝、以及未指向 client 树的路径拒绝。`tools.spec.ts` 对 fixture 中跨文件的 `Panel` 钉住 `propsInferred: false` 匹配字段与 `unresolved:` 渲染。
