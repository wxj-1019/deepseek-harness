# @deepseek-ai/dsh-tool-tasks

[English](README.md) | 中文

模型可见的任务运行器：`task_list` 发现会话工作区 `package.json` 的 npm 脚本，`task_run` 经 [`shell`](../../shell/shell/README.zh.md) 接缝用配置的包管理器（默认 `npm`）执行其一，报告退出码与有界的合并输出尾部。非零退出是正常报告而非传输失败。脚本发现与输出截尾是被单测钉住的纯函数。

## Model Experience

None——本工具向人类渲染进程输出，除自身工具结果外不进入模型请求。

## Known Limitations and Deferred Work

- **仅工作区根** —— 脚本只从会话工作区的 package.json 解析；不发现嵌套工作区。
- **无结构化失败解析** —— 输出尾部原样呈现；失败摘要属于后延。
