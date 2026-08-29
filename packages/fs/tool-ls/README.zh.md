# @deepseek-ai/dsh-tool-ls

[English](README.md) | 中文

模型可见的 `ls` 工具：经[`文件系统接缝`](../../fs/fs/README.zh.md)（`ctx.fs.listDir`）列出一个目录——目录在前并带尾分隔符，文件在后端可报告时附带字节大小。会话相对路径按调用方 agent 的工作区解析，与 `read`/`write`/`edit` 一致。点前缀条目默认隐藏，`all` 打开；列表上限 `maxEntries`（默认 500），超出部分附条数说明。排序与格式化是被单测钉住的纯函数。

## Model Experience

None——本工具向人类渲染用户自有文件系统数据，除自身工具结果外不进入模型请求。

## Known Limitations and Deferred Work

- **仅直接子项** —— 无递归树模式；发现用 `glob`。
- **条目上限** —— 超大目录在 `maxEntries` 处截断并附条数说明。
