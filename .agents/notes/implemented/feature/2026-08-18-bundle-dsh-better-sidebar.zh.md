# Agent Note: 将 dsh-better-sidebar 装配进 web-app 组合

Status: implemented

[English](2026-08-18-bundle-dsh-better-sidebar.md) | 中文

日期：2026-08-18 · 领域：`packages/bundle/web-app`

## 问题

社区工作台插件 `dsh-better-sidebar` 只通过其 README 记载的用户档位通道进入组合：它只存在于单台机器上，从不随仓库分发——fork 的一次全新 `dsh web` 启动根本没有工作台。

## 决策

社区工作台插件 `dsh-better-sidebar`（VSCode 风格右侧栏：资源管理器 / 编辑器 / 终端 / Git / 浏览器、底部面板，以及供三方注册页签的 `ctx.betterSidebar` 服务）以**仓库组合**方式加入本项目，而不是其 README 记载的用户档位通道。档位通道（`dsh plugin --profile web add`）只装到单台机器、永远进不了 fork；bundle 通道让插件随本仓库每次 `dsh web` 启动而挂载，并在推送时随仓库进入远端。改动只有两处：web-app 依赖加 `"dsh-better-sidebar": "^0.13.0"`（npm 官方发布包，自带预构建 `lib/`，仓库无需构建步骤），以及 web-app 的 `cordis.patch.yml` 加一行 `insert`（`id: better-sidebar`）——满足 `verify-cordis-config` 门禁"裸插件行必须能从所属清单的依赖解析"的规则。

## 曾考虑的替代方案

- **保留插件 README 记载的用户档位通道（`dsh plugin --profile web add`）** —— 否决：档位安装只活在单台机器上、永远进不了 fork；工作台必须随仓库本身的每次启动分发。
- **把插件源码 vendor 进 `vendor/`** —— 否决：npm 官方包自带预构建 `lib/`，组合里一行依赖即可、无需仓库构建步骤，上游更新也只是版本号提升。

## 后果

- web 档位栈保持 `dsh-base + dsh-web-app`；档位自己的 `cordis.patch.yml` 没有任何 better-sidebar 行，因此 bundle 挂载不会与遗留的手动挂载行双挂载。档位 bundle 列表里的 `dshmarket` 与此无关、未改动。
- pnpm 装入了第二个 `node-pty` 副本（插件要求 `^1.1.0`，工作区是打过补丁的 `1.2.0-beta.15`）；`allowBuilds` 已覆盖它。若终端表面报"node-pty 加载失败"，在插件的 `.pnpm` 存储目录重建该副本即可——侧边栏本身不受影响照常挂载。
- aqua 对本插件的玻璃适配（作用域化 `[data-dsh-better-sidebar]` 覆盖 + `blur(var(--dsh-aqua-blur))`，见 third-party-panel-glass note）现在在仓库组合里有了作用目标，工作台开箱即随 aqua 皮肤生效。
- 版本钉在 `^0.13.0`；升级 = 改依赖版本 + lockfile，并重跑 `gen-third-party-notices`（notices 门禁跟踪随包发货的依赖）。
