# @deepseek-ai/dsh-git-graph

[English](README.md) | 中文

DeepSeek Harness Web UI 的 Git 提交历史读取：一个 `/git-graph/api` 前缀路由，
经 shell seam 提供带父提交的日志行与分支名。路由按构造只读。

## 路由

`POST /git-graph/api/log` 携带 `{ cwd, count?, skip? }` 返回
`{ ok, value: { entries, hasMore } }`；`POST /git-graph/api/branch` 携带
`{ cwd, action: 'branch' }` 返回 `{ ok, value: string[] }`。工作目录校验为绝对路径；
失败返回 `{ ok: false, error: { code, message } }`。
