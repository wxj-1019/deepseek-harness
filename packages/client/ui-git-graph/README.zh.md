# @deepseek-ai/dsh-client-ui-git-graph

[English](README.md) | 中文

DeepSeek Harness Web UI 的 Git 提交轨道会话视图：一个 `conversation.view`
标签（"Git"），渲染当前会话工作区的提交历史与分支拓扑——圆点、轨道与合并弧——
数据来自 git-graph 主机路由。

## 行为

- 注册一个 `conversation.view` 条目（`order: 30`，位于 Usage 右侧）。
- 从 `/git-graph/api`（宿主包 `@deepseek-ai/dsh-git-graph`）获取分支与带父提交的日志行。
- 视图只读：不检出、不修改；翻页追加更早提交，轨道在已加载窗口上重算。

## 开发

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-git-graph test
pnpm --filter @deepseek-ai/dsh-client-ui-git-graph bundle
```
