# @deepseek-ai/dsh-tool-compact

[English](README.md) | 中文

模型可见的 `compact` 工具：经[`压缩`](../../compaction/compaction/README.zh.md)接缝（`ctx.compaction.compactNow`）请求对当前会话执行人工压缩——与人用的 `/compact` 命令同一条路径。结果报告压缩范围（历史条目与 token），或结构化失败（busy / changed / summary / commit / persistence / cancelled）作为错误结果；对话绝不会被静默降级。

## Model Experience

工具结果即模型可见表面：报告压缩范围或结构化失败。压缩摘要本身由压缩接缝产出的会话内容，不由本包生成。

## Known Limitations and Deferred Work

- **无范围压缩** —— 本工具压缩标准人工范围；可选范围属于压缩接缝的能力。
