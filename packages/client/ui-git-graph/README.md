# @deepseek-ai/dsh-client-ui-git-graph

English | [中文](README.zh.md)

Git commit-rail conversation view for the DeepSeek Harness web UI: a
`conversation.view` tab ("Git") rendering the session workspace's commit
history with branch topology — dots, lanes, and merge curves — over the
git-graph host route.

## Behavior

- Registers one `conversation.view` entry (`order: 30`, right of Usage).
- Fetches branches and parent-aware log rows from `/git-graph/api` (host
  package `@deepseek-ai/dsh-git-graph`).
- The view is read-only: no checkout, no mutation; paging appends older
  commits and the rail recomputes over the loaded window.

## Development

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-git-graph test
pnpm --filter @deepseek-ai/dsh-client-ui-git-graph bundle
```
