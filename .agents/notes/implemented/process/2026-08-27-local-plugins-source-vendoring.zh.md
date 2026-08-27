# Agent Note: local-plugins 以源码方式收编外部 web 插件

Status: implemented

[English](2026-08-27-local-plugins-source-vendoring.md) | 中文

## Problem

用户的 web profile 需要一个原生上游 bundle 不带的插件（`dsh-git-graph`，空白会话的分支胶囊与图谱弹窗）。从 npm 安装会把 profile 绑在第三方发布者的节奏上，而这个 fork 没有 GitHub token 和 `gh` CLI，拉取无法自动化；机器磁盘也紧张（E 盘满、D 盘沙箱拒绝写入），堆 npm 副本并不免费。同时 fork 已经带着源码构建的本地插件（独立工作区的 dsh-better-sidebar fork），而且用户希望插件源码就住在他实际推送的 fork 仓库里。

## Decision

用户想要持有并演进的三方插件，以源码形式收编进本仓库的 `local-plugins/<name>/`，就地构建，并通过 `~/.dsh/profiles/web/package.json` 的 `file:` 依赖加 profile `cordis.patch.yml` 的 `insert:` 行接入。`local-plugins/` 刻意置于 pnpm workspace 之外（`packages/` 的语义、hygiene、catalog 规则不受影响）；每个被收编的包自带 `pnpm-workspace.yaml`（占位 `packages: []`），阻止 pnpm 向上走进仓库根 workspace；各自 `.npmrc` 属机器特定配置，已 git-ignore。

首个收编对象是 `local-plugins/dsh-git-graph/`（Apache-2.0，上游 `zhu1090093659/dsh-web` 的 `packages/dsh-git-graph`），上游 `shared/` 构建配置一并复制入内，tsdown 配置的引用改指包内（`../../shared/…` → `./shared/…`）——上游包原本对着它的 monorepo 根构建。

## Alternatives considered

- **从 npm 安装**——否决（所有权）：源码进 fork 后，修复（或退回上游）就是一次 commit，而不是等发布。
- **独立插件仓库**——暂时否决：用户没有 `gh` CLI，新建 GitHub 仓库要手动走网页；放在已在推送的 fork 里只需关心一个远端，日后要拆只是挪目录。
- **放进 `packages/`**——否决：仓库布局为 `@deepseek-ai/dsh-*` workspace 及其 hygiene/catalog 门保留了 `packages/` 语义，三方插件不得进入这些规则。

## Consequences

- 每个收编插件的重建闭环：在其目录内 `pnpm build` → 把 `lib/` 复制进 profile 的 node_modules（pnpm 不会刷新内容已变的 `file:` 依赖）→ 重启 `dsh web`；对 profile 做任何 `pnpm install` 前先停服务器（Windows 文件锁）。
- 收编源码保留上游 License 文件；出处在每个包的 README 追加说明。
- 上游同步是手动的：重新复制包目录并重放本地差异（引用改指、.npmrc ignore）。
