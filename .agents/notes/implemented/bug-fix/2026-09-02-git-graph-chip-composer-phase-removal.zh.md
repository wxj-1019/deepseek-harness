# Agent Note：git-graph hero 芯片恢复渲染——合并后的会话快照移除了 composerPhase

Status: implemented

[English](2026-09-02-git-graph-chip-composer-phase-removal.md) | 中文

## 问题

rc.8 合并后，git-graph 插件的空白会话分支选择芯片（hero 工作区行旁的源代码管理选择器）停止渲染。芯片的 dock 座位以 `sessionSnapshot?.composerPhase === 'blank'` 作为可见性门槛，但合并后的会话快照不再携带 `composerPhase`（漂移修复把 fork 的 composer 阶段状态替换为上游的 `conversationPhase` 推导，而它位于芯片接收不到的会话快照上）。表达式恒为 `undefined` → hero 座位永远不成立 → 芯片什么都不渲染，而插件本身仍在加载（其 auto-isolation 警告持续输出）。

## 决策

dock 座位的 hero 条件改为读取合并后快照实际携带的字段：`sessionSnapshot.blank === true && sessionSnapshot.openState === 'open'`——一个已打开的空白会话正是该选择器所针对的 hero/新会话状态。session-maybe 上下文座位保留基线 blank 标志（已交付的壳中首选的 selector-context 槽位已不存在，由 dock 兜底覆盖）。

## 已否决的替代方案

- **把会话快照传进芯片** —— 否决：dock 的注入属性只带 session + input；为一个谓词把会话快照穿过槽位机制扩宽座位契约不成比例。
- **在会话快照上恢复等价的 composerPhase 字段** —— 否决：把派生的展示阶段重新加回贴近 wire 的快照，会重新制造迁移刚清除的漂移。

## 后果

- 分支选择器在空白会话恢复渲染（实测：芯片显示当前分支，弹层提供切换分支、创建并检出、Git 图谱）。
- 同样的 composerPhase 形态审计适用于其他读取 `session.composerPhase` 的插件；git-graph 的 auto-isolation 已优雅降级（"the workspaces service shape changed"）。
