# Agent Note: 本机开发校验开关

Status: implemented

[English](2026-08-17-local-dev-check-toggles.md) | 中文

## Problem

每完成一个功能或插件都会触发漫长的本地校验——真实 API 的 e2e 套件（上百个文件的真实模型调用）、插桩全量覆盖率运行、doc-sync 聚合、pre-push typecheck——因为本地唯一的检查选择机制是 agent 在 [dsh-pre-push-checks](../../../skills/dsh-pre-push-checks/SKILL.md) 指引下的判断。此前没有持久的按机器方式表达"本机跳过这条车道"：仓库不存在 `DSH_SKIP_*` 环境变量机制，而免 key 自动跳过是让无密钥 CI 不受阻塞的机制，不是成本信号（docs/testing.md）。即使某条车道的证据在这台机器上并不需要，开发者也要为每次例行运行付出全部时间。

## Decision

`dev-checks` 设置命名空间保存六个按机器的布尔开关，全部默认开启，可在 Web 设置页**开发校验**中编辑（新包 `packages/client/ui-settings-dev-checks`），存储于产品设置文档 `$DSH_HOME/settings.yaml`：

- `e2e`、`coverage`、`snapshot`、`docSync`、`prePushTypecheck` 由门禁包装器（`scripts/dev-check-run.ts`，读取 `scripts/dev-checks.ts`）硬生效，日常入口都经过它：`test:e2e`/`test:coverage`/`test:snapshot`/`doc-sync` 四个 package 脚本与 lefthook pre-push 的 typecheck。关闭的门禁打印跳过提示并以 0 退出。
- `buildHygiene` 仅作建议：它通过 skill 指导 agent 的检查选择，构建脚本本身不加拦截，因为其他门禁依赖构建产物——硬拦截会级联成误导性跳过。

语义上保护 CI 证据：文件或配置段缺失时所有键默认开启；`CI=true` 在任何文件访问之前就将读取器短路为全开；显式全量入口（`check:all`、`test:snapshot:record/refresh`、CI 门禁模式）从不读取这些开关。配置段格式错误（未知键、非布尔值、非映射段）会在包装器中大声失败而非静默忽略，笔误绝不会被读作已关闭的门禁。脚本侧键清单与包 schema 是同一事实的两处声明；`scripts/dev-checks.spec.ts` 将二者锁定一致。

Web 写入路径复用现有设置机制而非另造：client 包的宿主半注册命名空间（ui-aqua 模式），API 代理的 `WEB_SETTINGS_NAMESPACES` 准入 `dev-checks`（可远程编辑命名空间的刻意收口），页面通过 `ctx.settingsScope` 绑定，使用纯 `aria-pressed` 开关按钮。

## Alternatives considered

- **环境变量（`DSH_SKIP_E2E=1`……）**——跨 shell 不持久、无图形界面，还会引入仓库刻意未新增的临时环境变量方言；设置文档已经是带 Web 编辑器的持久按机器存储。
- **仓库内 gitignored 配置文件**——Web 设置页只能经设置服务写入，而设置服务拥有 `$DSH_HOME/settings.yaml`；让 UI 写仓库文件需要引入"仓库位置"概念的专用 RPC，对工作目录无关的宿主进程来说很脆弱。设置文档也是正确的作用域：这些是按机器的偏好，不是仓库政策。
- **仅 agent 软生效（只改 skill prose，不加包装器）**——最省，但漏读一次或直接 `pnpm run test:e2e` 仍要付出全部代价；包装器让开关成为入口本身的事实，skill 只是第二层。
- **把 `build`/`hygiene` 也硬拦截**——`run-gates` 聚合的下游门禁依赖 build 门禁（`needs: ['build']`）；关掉它会跳过下游门禁，制造"我以为全跑过了"的假证据。建议性开关保持了依赖图的诚实。
- **在 `run-gates.ts` 的 `gatesForMode()` 内过滤门禁**——对 CI 模式予以否决：`check:all` 与 `ci-*` 聚合是显式全量彩排入口，绝不能被本机偏好收窄，因此开关落在日常脚本边界而非调度器内部。

## Consequences

开发者在 Web 设置中拨动一个开关（或直接编辑 YAML），重型车道立即停止消耗本机时间，而 CI 继续拥有完整矩阵——这正是 docs/testing.md 已有的分工。代价是：产品设置文档多了一个来自仓库工具的消费者（由 schema 锁定测试保持诚实）、四个被包装脚本多一次进程跳转（相对车道本身可忽略），以及一条长期规则——开关关闭时的本地绿色结果必须报告为部分跳过（[dsh-pre-push-checks](../../../skills/dsh-pre-push-checks/SKILL.md) 携带报告措辞）。
