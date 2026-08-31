# Agent Note：调用层次将 prepare 与方向查询串联

Status: implemented

[English](2026-08-31-lsp-call-hierarchy.md) | 中文

## 问题

接缝此前暴露了导航、rename、formatting 与诊断，但没有调用层次：模型问"谁调用了这个函数？"时只能退回到文本式的引用翻找。

## 决策

`incomingCalls` 与 `outgoingCalls` 是共享同一流程的两个光标操作：实例先在光标处发送 `textDocument/prepareCallHierarchy`，取第一个准备好的符号（空结果变为空调用列表），再以该符号发起 `callHierarchy/incomingCalls` 或 `callHierarchy/outgoingCalls`。每一程都以自己的请求 id 参与中止竞速。两个操作归一化为共享的 `calls` 行形状——远端符号标识（name、kind、URI、优先 selectionRange、container）加上其调用点跨度——由单一的 `callHierarchyProvider` 能力槽位门控，并像所有文档查询一样覆盖瞬态打开生命周期。工具按有界的每调用一行渲染（`位置 容器.名称 — N 个调用点`）。

## 已考虑的替代方案

- **一个带方向参数的 `callHierarchy` 操作** —— 拒绝：接缝的封闭联合把不同的模型意图当作不同的操作；方向作为参数还需要单独校验，没有任何收益。
- **向模型暴露原始 `CallHierarchyItem`** —— 拒绝：接缝归一化协议形状；模型消费的是行，不是协议条目。

## 后果

- 没有 `callHierarchyProvider` 的服务器经标准能力门控使两个操作失败。
- prepare 未产出符号时解析为空调用列表而非错误。
- 操作数增至十一个；每个新操作都是对接缝、提供方与工具的编译强制更新。
