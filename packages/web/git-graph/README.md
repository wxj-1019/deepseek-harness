# @deepseek-ai/dsh-git-graph

English | [中文](README.zh.md)

Git commit-history reading for the DeepSeek Harness web UI: a
`/git-graph/api` prefix route serving parent-aware log rows and branch names
over the shell seam. The route is read-only by construction.

## Route

`POST /git-graph/api/log` with `{ cwd, count?, skip? }` returns
`{ ok, value: { entries, hasMore } }`; `POST /git-graph/api/branch` with
`{ cwd, action: 'branch' }` returns `{ ok, value: string[] }`. Working
directories are validated absolute paths; failures return
`{ ok: false, error: { code, message } }`.
