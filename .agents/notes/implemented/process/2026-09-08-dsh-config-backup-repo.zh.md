# Agent Note: 机器本地配置档的 dsh-config 备份仓库

Status: implemented

[English](2026-09-08-dsh-config-backup-repo.md) | 中文

## Problem

机器本地的 dsh 状态——profiles、`settings.yaml`、agent presets——是 fork 用户手工维护的宿主配置，但它住在任何仓库之外，磁盘损坏或一次改错都没有历史可追溯、可恢复。同一目录还带着毗邻机密的文件（`credentials.yaml`、sessions、storages），绝不能抵达远端，这排除了把整个目录直接纳入版本控制的朴素做法。

## Decision

把机器本地 dsh 主目录版本化到以 `~/.dsh` 为根的私有仓库 `wxj-1019/dsh-config`：白名单 `.gitignore` 放行 profiles、`settings.yaml` 与 presets，`credentials.yaml`、sessions、storages 和 `node_modules/` 保持不入库。任何插件/profile/设置/preset 变更后从 `~/.dsh` 提交并推送；在这台 Windows 宿主机上推送需要 `git -c credential.https://github.com.usehttppath=false push`，因为全局 `usehttppath` 配置会让 store helper 取不到已存凭据。web profile 的 `cordis.patch.yml` 携带 `web-ui-better-sidebar` 的去重禁用；没有它 `dsh web` 会在 boot 时因 `/sidebar/api` 路由重复而死掉。完整流程见 `~/.dsh/README.md`。

## Alternatives considered

- 不做白名单、整个目录入库：否决——sessions、storages 与 `credentials.yaml` 离远端泄露只差一次 `git add -A`。
- 把单个文件软链到别处的仓库：否决——覆盖不全，会静默漏掉新增的 profile 与 preset。

## Consequences

- AGENTS.md 只留一行指针；细节由本篇笔记与 `~/.dsh/README.md` 拥有。
- 任何新的机器本地 profile、设置命名空间或 preset 都必须加入白名单并在同一变更中提交。
