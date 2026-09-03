# Agent Note：hygiene 门禁收敛与轨道图晋升为主仓库功能

Status: implemented

[English](2026-09-04-hygiene-convergence-and-rail-promotion.md) | 中文

## Problem

rc.8 上游合并落地、git-graph 功能晋升主仓库之后，全量 hygiene 门禁
（`pnpm run hygiene`）在六个子门禁上失败：package invariants、client UI i18n、
Cordis config 校验、publint、workspace constraints 与 package dependencies。
失败集中在两机合并涉及的包（新工具、ui-usage/ui-user-todo、ui-git-graph），
加上预存的 Windows 问题。另外，modlens 设置卡片在每次 Web 控制台抛
keyed-slot 错误。

## Decision

- **invariant 伴生**：所有暴露 `src/invariant.ts` 的包现在声明完整契约——
  `exports["./invariant"]`、`files` 白名单条目、`dsh-invariants` 的
  peer+devDependency（host 包）或仅 devDependency（client 包，按依赖政策），
  以及指向 `runtime-diagnostics/invariants` 的 tsconfig 工程引用。覆盖 17 个包。
- **client 依赖政策**：client 包的运行时导入必须在 `dependencies`
  （connection/schemastery），react 不得 peer+dev 双声明。按门禁给出的精确
  白名单逐一移动；`api/remotes` 的 peers 按 non-Cordis peer 规则收敛为
  devDependencies-only。
- **i18n**：MCP 传输选项文案进字典（`mcpCard.transportStdio/Http`）；usage
  热力图月份标签去本地化为纯数字（两种语言下均中性）。
- **Cordis config**：acp 测试 profile 的 `cordis.yml` 是 git symlink，
  Windows checkout 物化为文本路径桩，校验器无法解析；替换为快照的真实内容
  副本（功能等价，仅失去与快照的自动同步）。
- **版本对齐**：22 个 manifest 按门禁期望值重新对齐根版本与 `files` 白名单。

## Alternatives considered

- **修 publint 的 `exports["./src/*"]` 不匹配** —— 暂缓：失败源于上游
  manifest 的 exports/files 政策矛盾（`./src/*` 导出配 lib-only 白名单）。
  上游 Linux CI 的 glob 解析正常，属 Windows 本机 runner 分歧；改 files 政策
  还是 exports 映射需要上游决策。
- **从 git 历史恢复 `packages/client/runtime` 供 git-graph 导入** —— 否决：
  该系列刻意删除了 Runtime，store/cordis 重定向满足新包需求。

## Consequences

- `constraints`、`verify-package-dependencies`、`verify-package-invariants`、
  `verify-cordis-config`、`verify-client-ui-i18n` 全部通过；`publint` 是唯一
  剩余的 Windows 本机 hygiene 分歧（待上游对齐）。
- modlens 修复位于 web profile 的 pnpm patch
  （`patches/@liustack__modlens.patch`）——环境级，不在本仓库；应向
  `@liustack/modlens` 提上游 PR。
- 全量测试套件的 Windows 基线（pty 管理、lsp-stdio PATH/spawn）失败为预存，
  与本次改动无关。
