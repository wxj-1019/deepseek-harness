# Agent Note：LSP formatting 复用既有编辑计划通道

Status: implemented

[English](2026-08-31-lsp-formatting.md) | 中文

## 问题

LSP 接缝此前暴露了导航与 rename，但 formatting——编码代理在动手改文件之前想要的另一项读侧能力——被搁置了。若把它做成独立的写工具，会重复 multi_edit 和 write 已经拥有的预览/权限层。

## 决策

`formatting` 是接缝的第九个操作，归一化为与 rename 相同的结果形状：`workspaceEdit` 计划（`LspFileEdits[]`），由模型用自己的文件编辑工具落盘。`textDocument/formatting` 对单个文档返回 `TextEdit[]`；归一化器把该数组包装为以被查询文档 URI 为键的单文件计划（`null` 变为空计划），因此工具的 schema、渲染、上限与截断全部原样复用。格式化选项（`tabSize`、`insertSpaces`）不是模型输入——它们是经过校验的插件配置（`formattingTabSize` 默认 2、`formattingInsertSpaces` 默认 true），由工具解析后放入接缝请求，符合显式解析边界的约定。能力门控复用逐操作槽位表（`documentFormattingProvider`），瞬态 didOpen/查询/didClose 生命周期保持不变。

## 已考虑的替代方案

- **带写入集成的独立格式化工具** —— 拒绝：它会绕过模型自己的基于 diff 的评审流程，并重复编辑工具已有的权限管线。
- **由服务器 `workspace/applyEdit`** —— 拒绝：本机按设计拒绝该请求；所有磁盘写入都归模型所有。
- **由模型提供格式化选项** —— 拒绝：缩进风格是部署级约定，不是逐调用的参数。

## 后果

- 格式化结果的渲染与单文件 rename 计划完全一致；没有新的输出 schema。
- 未声明 `documentFormattingProvider` 的服务器经标准能力门控使查询失败。
- `lsp` 工具的操作集增至九个；选项管线新增两个配置字段，模型参数为零。
