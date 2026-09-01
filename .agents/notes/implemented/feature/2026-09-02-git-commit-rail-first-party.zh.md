# Agent Note：Git 提交轨道成为一等公民 Web 功能

Status: implemented

[English](2026-09-02-git-commit-rail-first-party.md) | 中文

## Problem

提交轨道可视化（历史列表左侧的圆点、轨道与合并弧）此前只存在于第三方插件
`dsh-better-sidebar` 的源代码管理面板里，只能通过该插件的侧栏访问。用户要求把
该功能升级为主仓库能力——会话头部的独立视图标签，与插件无关。

## Decision

两个新 workspace 包加一处 bundle 接线：

- **`packages/web/git-graph`**（`@deepseek-ai/dsh-git-graph`）：经 shell seam 的
  只读 `/git-graph/api` 前缀路由。`POST /git-graph/api/log` 返回带父提交的日志行
  （`%h%x1f%s%x1f%an%x1f%ai%x1f%H%x1f%D%x1f%P%x1f%ct`）并支持翻页；
  `POST /git-graph/api/branch` 列出本地分支名。工作目录解析分两级：调用方可传
  `cwd`（校验为绝对路径），否则宿主优先从附加的 `SessionStore` 读会话头部的
  `cwd`——`sessionController.inspect` 会重放整个事件日志并在长会话上卡住，因此只作
  兜底。路由按构造只读：不检出、不修改。
- **`packages/client/ui-git-graph`**（`@deepseek-ai/dsh-client-ui-git-graph`）：
  一个 `conversation.view` 条目（`order: 30`，位于 Usage 右侧），渲染会话工作区的
  历史与轨道。轨道几何（`CommitGraphRail.tsx`）从插件实现移植：在已加载窗口上做
  纯车道分配，纵向用百分比坐标，行与行在共享边界处无缝衔接（与文本换行高度无关）。
- **Bundle**：`dsh-web-app` 的依赖与 `cordis.patch.yml` 插入列表均加入两个包。

运行时注记：客户端插件注册必须有 `inject` 声明（`['slots', 'locale']`），否则
loader 拒绝该条目；keyed/list 条目的注入面必须带 `hooks` 键。`modlens` 3.18.1
以 `id` 而非 `key` 注册 keyed 槽 `settings.plugin.item`；本机通过 pnpm patch
（web profile 的 `patches/@liustack__modlens.patch`）修复，属环境级、不在本次提交内。

## Alternatives considered

- **扩展插件** —— 否决：用户明确要求功能进主仓库，而非藏在第三方 dock 后面。
- **复用 `tool-git`** —— 否决：它是带 action 门控的模型工具；UI 读取面需要独立
  路由，不能依赖工具策略。
- **用 `sessionController.inspect` 解析 cwd** —— 先试后弃：它重放整个事件日志
  （长会话卡死）；附加会话的 `SessionStore.get` 头部读取为 O(1)。

## Consequences

- 会话头部新增 "Git" 标签，为任何工作区是仓库的会话渲染轨道历史；非仓库工作区
  显示"不是 Git 仓库"占位。
- better-sidebar 源代码管理面板里的轨道保持不变。
- `modlens` 的设置卡片不再在 Web 控制台抛 keyed-slot 错误。
- 新包遵循客户端包骨架（exports 映射、dsh.client manifest、tsdown clientBundle、
  `dsh-client-` 前缀的手写 tsconfig 别名）；两者都带解析/几何单测与基于 mock
  fetch 的 jsdom 组件测试。
