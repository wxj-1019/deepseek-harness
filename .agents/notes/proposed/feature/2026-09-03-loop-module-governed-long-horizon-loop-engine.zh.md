# Agent Note: Loop 模块——受治理的长时程循环引擎（受 LoopX 启发）

Status: proposed

[English](2026-09-03-loop-module-governed-long-horizon-loop-engine.md) | 中文

## 问题

dsh 今天能跑长任务，但相关能力散落在彼此独立的临时原语里，没有任何一个构成 durable、受治理的*工作引擎*：

- [`goal`)](../../../../packages/goal/README.zh.md) 是每会话单一目标的持久目标，只有同会话轮次与轮次上限——没有预算、没有任务状态、没有完成验证、一次只有一个目标。
- [`ralph`)](../../../../packages/workflow/tool-ralph/README.zh.md) 是面向不可变目标的一次性前台 fresh-agent 循环——跨调用无持久化、完成靠 worker 自报、工作区是跨轮唯一的记忆、轮次数是唯一的边界。
- `schedule`、`jobs`、`workflow`、`guard` 分别覆盖提醒、后台工作、脚本化扇出与循环卫生，但没有把它们组合成一个*命名、可驾驭、带预算、跨重启跨天持续推进目标的引擎*。

缺失的是一块一等的 loop 领域：durable 的 loop 状态（目标、预算、进展）、迭代记录、模型与人类共同读写可审查的状态内核、治理（预算、检查点、新鲜度、经验证的完成）以及重启安全的续跑。

参考设计是 [LoopX](https://github.com/huangruiteng/loopx)（huangruiteng/loopx）：一个 Python 编写、agent 循环无关的控制平面，自我描述为 "long-horizon agent control plane for durable, governed work across Codex, Claude Code, and other harnesses"（v0.5.x；早期为 "lightweight loop engineering state kernel for long-running AI agent teams"）。其承重思想，见其仓库与第三方解读：

- **Durable、可审查的状态即内核** —— loop 状态存放在可检查的存储中（git 承载；getting-started 路径里有 `git pull --ff-only`），且 state-interaction model 要求**先验证并写入 durable 状态、再花模型功夫**。
- **State refresh（状态刷新）** —— 每一迭代的上下文从 durable 状态重建（`state_refresh.py`，带 classification），外加 agent 据以工作的只读 project map。
- **Todo freshness（任务新鲜度）** —— 被跟踪条目携带过期标记；"Todo freshness and quota settlement recovery" 是 v0.5.4 的命名关注点。
- **配额分配与结算** —— 预算按工作单元分配、结算且可恢复（`docs/quota-allocation.md`、`agent_scope_wait`）。
- **Interaction pattern catalog（交互模式目录）** —— 一组成文的受治理人机交互模式。
- **Per-harness goal-mode 适配器** —— `claude_goal_mode`、`dsh_goal_mode`：LoopX 已把 dsh 当作目标 harness，从外部驱动其 goal mode。

LoopX 证明了问题的形状。本提案将其设计原生内化：状态内核变成 dsh 的 session log，refresh 变成每轮保留的 prompt，quota 变成 durable 预算账本，适配器则因 loop *住在 dsh 内部*而不复存在。不要外部 Python 控制平面，不要第二状态存储。

## 生态与先行工作调研

扩大调研覆盖 loop engineering 领域、商业 harness 的 goal mode、开源控制平面与 durable execution 谱系。每小节以对本提案的贡献收尾。

### Loop engineering 作为设计领域

"loop engineering" 已凝聚为一个公认的设计领域：设计模型调用*之外*的循环，使长时程工作收敛而非卡死。[AgentPatterns.ai](https://www.agentpatterns.ai/loop-engineering/) 维护公开目录：[让循环收敛的 loop engineering](https://www.agentpatterns.ai/loop-engineering/)、[agentic coding 的三层循环](https://www.agentpatterns.ai/loop-engineering/three-loops-agentic-coding/)（把 step 级内层循环与叠加的外层循环区分开的诊断词汇）、[在 agent 外叠加外层循环](https://www.agentpatterns.ai/loop-engineering/loop-engineering/)、[Ralph Wiggum fresh-context 循环](https://agentpatterns.ai/loop-engineering/ralph-wiggum-loop/)、[迭代精炼中的收敛检测](https://agentpatterns.ai/loop-engineering/convergence-detection/)、[循环 Go/No-Go 成本门槛](https://agentpatterns.ai/loop-engineering/agent-loop-go-no-go-gate/)（循环何时值回成本）。相邻的 context-engineering 线覆盖 [stateful iteration state-carry——长 agent 循环的类型化持久状态](https://raw.githubusercontent.com/agentpatterns-ai/website/refs/heads/main/context-engineering/stateful-iteration-state-carry.md) 与 [remember, don't re-read](https://learn.agentpatterns.ai/context-engineering/remember-dont-re-read/)。产业评论把它视为后 prompt 时代的重心：[BAAI：Harness 之后，硅谷 AI 圈又来新词了：Loop Engineering](https://hub.baai.ac.cn/view/55505)、[钛媒体：Prompt已死，Loop Engineering成了硅谷AI圈新顶流](https://www.tmtpost.com/8036245.html)，以及企业视角的 [Google "The Outer Loop: agentic governance and self-evolution"](https://discuss.google.dev/t/the-outer-loop-how-google-cloud-and-alphaevolve-are-defining-agentic-governance-and-self-evolution/383304#p-969180-the-anatomy-of-an-enterprise-loop-1)。

贡献：三层循环词汇（step 内层循环 / 中间迭代引擎 / 外层治理环）直接用于子系统文档；Go/No-Go 门槛变成创建期预算策略；收敛检测变成 stall（停滞）策略。

### 商业 harness 的 goal mode 已收敛

- **Codex** 提供长时程 `/goal` 模式并有官方文档：[Follow a goal（用例）](https://developers.openai.com/codex/use-cases/follow-goals) 与 [Using Goals in Codex（cookbook）](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex)。实践文章强调数小时无人值守运行与结构化目标模板——[/goal 模板的六个字段显式包含验证命令与停止条件](https://www.ai-primer.com/engineer/stories/codex-goal-six-element-template)（[NEC 的实践文章，日文](https://note.nec-solutioninnovators.co.jp/n/n2a14ecbf1228)、[ofox：Codex Goal Mode](https://ofox.ai/blog/codex-goal-mode-remote-computer-use-2026)）。
- **Claude Code** 现在有自己的 goal mode 官方文档：[Keep Claude working toward a goal](https://code.claude.com/docs/en/goal)（[中文](https://code.claude.com/docs/zh-CN/goal)）。官方模式出现之前，社区已整体移植了 Codex 语义：[Potarix/claude-goal](https://github.com/Potarix/claude-goal)、[balakumardev/claude-code-goal](https://github.com/balakumardev/claude-code-goal)、[jthack/claude-goal](https://github.com/jthack/claude-goal)——标题都是 "Codex-style /goal for Claude Code"。
- **LoopX** 把两者都当作适配器目标（`claude_goal_mode`、`dsh_goal_mode`）——dsh 已是跨 harness goal-mode 表面的一等公民。

贡献："目标 + 验证 + 停止条件 + 自动续跑" 是事实上的跨 harness goal-mode 契约。loop spec 必须携带**显式的验证与停止条件**，而不只是目标与轮次上限；loop 领域也是 LoopX 的 `dsh_goal_mode` 适配器本会从外部驱动的原生归属地。

### 开源控制平面与 goal loop

- **[LoopX](https://github.com/huangruiteng/loopx)**（上文已述）——参考状态内核。
- **[claude-code-goal-loop](https://github.com/gyujeongion/claude-code-goal-loop)** —— 验证步进式自主 goal loop，带**回滚快照与 stuck-handler**：每个验证过的步骤都做检查点，卡死的循环被检测并恢复，验证失败时可回滚。
- **[agent-control-plane](https://github.com/ducminhnguyen0319/agent-control-plane)** —— 让 GitHub 驱动的编码 agent 可靠运行而"无需人类时刻盯守"：仓库级的可靠性视角。
- **[officeos](https://github.com/officeos-co/officeos)** —— 平台级 agent 启动/编排（数百个 agent）；对会话级引擎超范围，但确认了市场方向。
- **[agent-patterns](https://github.com/acoyfellow/agent-patterns)** —— *有界、可驾驭*的 agent 执行模式库；两个形容词（bounded、steerable）正是 loop 治理的目标。
- **循环护栏自成品类**：[loopguard-runtime](https://pypi.org/project/loopguard-runtime/)（PyPI）与 [openclaw 的失控循环守卫——turn/error-batch/idle-repeat 边界](https://github.com/openclaw/openclaw/pull/121063/files#2)——其他 harness 为循环失控专门提供边界；dsh 的 `guard` 组覆盖步内重复与工具超时，但跨迭代停滞目前无守卫。
- **目标撰写即技能**：[goal-writer](https://raw.githubusercontent.com/muxuuu/goal-writer/main/SKILL.md)——写好目标本身是已知失败模式且有工具答案；[Ralph Wiggum 技术](https://agentpatterns.ai/loop-engineering/ralph-wiggum-loop/)（fresh-context 迭代）现在有了 [anthropics/claude-plugins-official 里的官方 ralph-wiggum 插件](https://github.com/anthropics/claude-plugins-official/pull/126)，带 `--fresh-context`。

贡献：验证必须是一等 spec 字段且有命令路径（不只是 LLM 评估器）；回滚属于 prompt 策略层（git 检查点指令，无新子系统）；跨迭代 **stall 策略**补上 dsh 当下的缺口；有界 + 可驾驭是设计北极星。

### Durable execution 谱系

工作流世界早已解决 durable、可恢复的长时程状态机：[Temporal + AI SDK：构建 durable agent](https://temporal.io/blog/building-durable-agents-with-temporal-and-ai-sdk-by-vercel)、[Temporal 的 LangGraph 插件提供 durable execution](https://temporal.io/blog/temporal-langgraph-plugin-durable-execution)。模式：事件溯源历史是唯一事实来源，worker 重放它重建状态，恢复即从历史重新执行。

贡献：dsh 的 session log 对进程内 agent 而言恰恰就是那份事件历史。loop 模块不需要外部编排器：它*就是* agent loop 的 durable-execution 层——所以全部 loop 状态住在 session log，恢复即重放。

### dsh 生态现状

dsh 已公开（[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，"Everything is a Plugin"），第三方已在上面构建：[dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) 客户端（v0.8.4）、[dsh-gungnir](https://www.npmjs.com/package/dsh-gungnir) npm 包，以及针对 dsh goal mode 的 LoopX `dsh_goal_mode` 适配器。它们都需要一份 durable、可查询的长时程工作状态来渲染或驱动。

贡献：loop 领域不只是产品特性，还是新兴 dsh 生态的**集成面**——`ctx.loops` 服务按 goal 先例做 `@Remote` 导出，使 TUI、SDK、webhook 与 LoopX 这样的外部控制平面读写同一份 durable 状态。

## 提案

### 概念模型

**loop** 是一个 durable、命名、由单会话拥有的长时程工作引擎。它有：

- 一份 **spec**：目标、执行模式、预算、节奏、审查策略、任务策略、验证、停滞策略；
- 一个 **phase** 状态机：`active | paused | blocked | checkpoint | complete`（`GoalPhase` 的超集，增加 `checkpoint` 用于受治理的审查暂停）；
- 一本**预算账本**：已结算迭代数、已耗墙钟时间、已耗 token，每迭代 durable 结算；
- 一块**任务板**：durable 状态内核——带状态、阻塞关系与新鲜度的工作条目。

**iteration（迭代）** 是一次被驱动的工作单元：同会话模型轮（goal-round 模式）或 fresh-agent 运行（ralph 模式），durable 归因，以结果结算。

用 loop engineering 的词汇，本模块横跨三层循环：**内层循环**是 `agent-loop` 中既有的 step/turn 周期（不变）；**中间循环**是本模块——带预算、状态内核与刷新的 durable 迭代引擎；**外层循环**是治理环——人类检查点、验证与评估器。三层读写同一份 session log，它是 dsh 的 durable-execution 基座：对进程内 agent 而言，它扮演编排器（Temporal 类）对工作流代码所扮演的事件历史角色。

**全程遵守的不变量**（见[架构)](../../../../docs/architecture.zh.md)）：每个模型可见事实都是 session 事件（`model-visible ⟺ logged`）；注册即带 disposer 的 effect；id 用品牌类型；durable 状态事件溯源，带 CAS 修订号、全快照事件与加载期协议不变量；策略走配置，绝不硬编码 tunable；不需要改 `agent-loop`——驱动是 `agent/*` 与 `tools/*` 扩展点的消费者。

### 与现有原语的关系

| 既有 | 本变更后的关系 |
|---|---|
| `goal` | v1–v3 不动。Goal 保持"单一目标、同会话轮次"的简单特性。Loop 是受治理的超集。Phase 4 决定整合（goal 驱动重建在 loop 之上，或文档化并存）。 |
| `ralph` | 不动。Ralph 是单次前台调用、跨调用无状态、轮次封顶。Loop 持久、有状态、带预算。Loop 的 fresh-agent 模式复用*subagent 缝*，而非 workflow 引擎。 |
| `workflow` | 不动。脚本是单次运行、内存中、模型编写、用于扇出；loop 是 durable 引擎。 |
| `schedule` | 不动。Loop 节奏由 loop 自持（loop 快照里的 durable `waitUntil`），重启精确重新武装；schedule 保持通用提醒设施。 |
| `jobs` | 不动。Loop 迭代可观测性走 `loop/*` 领域事件；jobs 保持通用后台运行时。 |
| agent teams（实验） | Loop 的任务快照借用 [`TeamTaskSnapshot`)](../../../../docs/subsystems/agent-team.zh.md#shared-task-dag) 形状（revision CAS、无环 `blockedBy`、建议性 `writeScopes`），但单会话、单属主，无花名册与邮箱。 |
| `subagent-codex` / `subagent-claude-code` | Loop 的 fresh-agent 迭代可经既有 provider bundle 跑进其他 harness——LoopX 跨 harness 声明的 dsh 原生等价物。 |

### 包拓扑

新组 `packages/loop/`（新组是纯容器；组 README 负责映射）。角色遵循 Service Definition / Provider / Consumer 缝模式：

| 包 | 角色 | `ctx` key |
|---|---|---|
| `loop/` | `dsh-loop` —— Service Definition + 领域：`LoopService`、类型、`loop/*` 事件、`loops` session 投影、日志协议不变量 | `ctx.loops` |
| `tool-loop/` | `dsh-tool-loop` —— 模型面工具 + 系统提示引导 | 注册到 `ctx.tools` |
| `command-loop/` | `dsh-command-loop` —— 人类 `/loop` 命令面 | 注册到 `ctx.commands` |
| `loop-round-driver/` | `dsh-loop-round-driver` —— 驱动：同会话 + fresh-agent 模式、预算执行、节奏、检查点、评估器；无服务 key | — |
| `ui-loop/`（Phase 3） | `dsh-client-ui-loop` —— 浏览器面板（来自 `loops` 投影）+ Chat 迭代节点 | client |

命名遵循角色词汇：`ctx.loops` 是拥有多个命名成员的服务（复数 key、`Service` 角色——`GoalService` 是先例）。

### 领域模型

类型在 `packages/loop/loop/src/types.ts`，镜像 [`goal`)](../../../../docs/subsystems/goal.zh.md) 与 [`agent-team`)](../../../../docs/subsystems/agent-team.zh.md) 先例：

```ts
/** Branded loop identity, allocated per owning session log. */
type LoopId = Branded<string, 'LoopId'>

/** Compare-and-set identity for one exact loop revision. */
interface LoopRef { readonly id: LoopId; readonly revision: number }

/** Execution mode of one loop. */
type LoopMode = 'same-session' | 'fresh-agent'

/** Durable lifecycle phase. Activation is process-local and separate (as in goal). */
type LoopPhase = 'active' | 'paused' | 'blocked' | 'checkpoint' | 'complete'

/** Machine-routable blocked explanation; stable lower-kebab-case code. */
interface LoopBlockReason { readonly code: string; readonly message: string }
// codes: iteration-cap | wall-clock-cap | token-cap | budget-exhausted
//        | review-rejected | verification-failed | stale-task | stall | error

/** Budget caps (all optional; omitted = uncapped) and their settlement ledger. */
interface LoopBudget {
  readonly maxIterations?: number
  readonly maxWallClockMs?: number
  readonly maxTokens?: number
  /** Settled consumption; monotonic, written only on iteration settlement. */
  readonly consumed: { iterations: number; wallClockMs: number; tokens: number }
}

/** Cadence between iterations; durable waitUntil makes restarts exact. */
interface LoopCadence { readonly minGapMs?: number; readonly waitUntil?: number }

/** Governed review stops. */
interface LoopReviewPolicy {
  /** Pause for human review after every Nth settled iteration (optional). */
  readonly everyIterations?: number
  /** Pause when a budget threshold is crossed (optional). */
  readonly budgetThresholds?: number[]
}

/** Staleness policy for task-board items. */
interface LoopTaskPolicy {
  /** Milliseconds an `in_progress` task may go untouched before it is stale. */
  readonly staleAfterMs?: number
  /** When true, a stale task blocks the loop instead of only flagging it. */
  readonly blockOnStale?: boolean
}

/** Completion verification (the Codex /goal "verification commands and stop conditions" equivalent). */
interface LoopVerification {
  /** How completion is verified before the loop may complete. */
  readonly kind: 'command' | 'evaluator'
  /** For `command`: the shell command that must exit 0 before completion is accepted. */
  readonly command?: string
  /** For `evaluator`: extra instructions on top of objective + state kernel + evidence. */
  readonly prompt?: string
  /** Bounded passes before the loop blocks with `verification-failed`. */
  readonly maxPasses?: number
}

/** Cross-iteration stall (non-convergence) policy. */
interface LoopStallPolicy {
  /** Consecutive settled iterations with no task-board progress before the loop stalls. */
  readonly maxNoProgressIterations?: number
}

/** Full durable state written by every non-clear loop mutation. */
interface LoopSnapshot extends LoopRef {
  readonly name: string
  readonly objective: string
  readonly mode: LoopMode
  readonly phase: LoopPhase
  readonly blockedReason?: LoopBlockReason
  readonly budget: LoopBudget
  readonly cadence: LoopCadence
  readonly review: LoopReviewPolicy
  readonly taskPolicy: LoopTaskPolicy
  readonly verification?: LoopVerification
  readonly stall: LoopStallPolicy
  /** Highest admitted iteration number for this loop. */
  readonly iterationsStarted: number
  /** Latest settled iteration outcome (bounded structured report). */
  readonly lastReport?: LoopReport
  readonly createdAt: number
  readonly updatedAt: number
}

/** One work item on the loop's state kernel; every mutation is a full snapshot. */
interface LoopTaskItem {
  readonly id: string            // loop-local, monotonically allocated `task-<n>`
  readonly revision: number
  readonly subject: string
  readonly detail?: string
  readonly status: 'pending' | 'in_progress' | 'done' | 'blocked'
  readonly blockedBy: string[]   // must stay acyclic
  readonly writeScopes: string[] // advisory path prefixes (team-task shape)
  readonly lastTouchedAt: number // freshness basis
}

/** Bounded structured outcome of one iteration (ralph report vocabulary). */
interface LoopReport {
  readonly status: 'continue' | 'complete' | 'blocked'
  readonly summary: string
  readonly evidence?: string
  readonly nextSteps?: string
  readonly blocker?: string
}

/** Settled-iteration record, one durable event per settlement. */
interface LoopIterationRecord {
  readonly loopId: LoopId
  readonly iteration: number     // positive, sequential per loop
  readonly mode: LoopMode
  readonly startedAt: number
  readonly settledAt: number
  readonly outcome: 'continue' | 'complete' | 'blocked' | 'error'
  readonly budgetDelta: { wallClockMs: number; tokens: number }
  readonly report: LoopReport
}

/** Message attribution for admitted same-session iterations (goal-source precedent). */
interface LoopMessageSource {
  readonly kind: 'loop'
  readonly loopId: LoopId
  readonly revision: number
  readonly iteration: number
}
```

### 持久事件（SessionEventMap 扩展）

全快照、CAS 校验、加载期不变量校验——goal/agent-team 协议：

| 事件 | 载荷 | 说明 |
|---|---|---|
| `loop/change` | 完整变更后的 `LoopSnapshot`，或 clear 墓碑 `{ cleared: LoopRef, clearedAt }` | 创建、spec 编辑、暂停/恢复/阻塞/完成、检查点进出、**预算结算**。每次变更递增 `revision`。 |
| `loop/task` | 完整变更后的 `LoopTaskItem`（或墓碑） | 每次任务变更一个事件；折叠时强制 `blockedBy` 无环、id 正数且唯一。 |
| `loop/iteration` | `LoopIterationRecord` | 迭代结算时写入；开始仅实时可见（见下）——结算是 durable 事实，与"先验证并写入 durable 状态再花钱"互为镜像：先花，再 durable 结算，只有结算过的工作计数。 |

实时扩展点事件（emit、作用域过滤、异常隔离——`goal/changed` 先例）：`loop/changed`、`loop/iteration-started`、`loop/iteration-settled`、`loop/checkpoint`。

只有被接纳的同会话迭代 prompt 以 `LoopMessageSource` 进入历史，且只有进入的消息消耗 `iterationsStarted`。新增事件种类是加性的——不 bump `SESSION_FORMAT_VERSION`（结构性格式不变）。

### 服务 API（`ctx.loops` —— `LoopService`）

仅由所属 session log 经 `loops` 投影 key 支撑（强制投影先例）：

- 读取：`list(agent)`、`get(agent, loopId?)` —— 含派生新鲜度的当前视图；
- 生命周期：`create`（每会话一个或多个命名 loop；创建会解除其他将被武装者的武装——v1 每会话至多**一个武装 loop**）、`edit`（spec 部分替换，CAS）、`pause`、`resume`（人类授权；重新武装）、`block`（策略归因的理由）、`complete`、`clear`（墓碑 + 历史保留）；
- 检查点：`enterCheckpoint(agent, loopId, trigger)`、`exitCheckpoint(agent, loopId, decision)` —— `approve` 恢复、`redirect` 带人类输入恢复、`abort` 暂停；
- 驱动准入：`reserveIteration(agent, loopId, revision)`（对 `iterationsStarted + 1` 的 CAS 预留）、`settleIteration(agent, record)`（结果 + 预算增量 + 报告 → durable `loop/iteration` + `loop/change`）；
- 任务内核：`createTask`、`updateTask`（CAS；状态、详情、blockedBy、writeScopes；刷新 `lastTouchedAt`）；
- 镜像 `GoalService`（`remoteExportCreate` 等）的 SDK 面 `@Remote` 导出。

武装（是否允许驱动开启下一迭代）是进程局部的，同 goal：驱动在创建/恢复时武装，在暂停/阻塞/完成/清除/卸载时解除；session 恢复与 fork 后 loop 保持**解除武装，直到显式的人类授权恢复**（goal 规则——loop 从不自我复活工作）。

### 驱动（`dsh-loop-round-driver`）

一个普通插件，建在 `ctx.loops`、`ctx.agents`、`ctx.subagents` 与交互缝之上。它只取配置，不做策略捷径：每个上限都是 spec 字段或配置字段。

**同会话模式** —— goal-round-driver 模式的扩展：

1. 在整个 agent 空闲、loop 活跃且武装、预算未耗尽、节奏已到点时，驱动**预留**当前 `{ loopId, revision }` 的 `iterationsStarted + 1`（过期预留永不消耗编号）。
2. Durable 检查点：await `ctx.sessions.flush()`，await 之后复查 revision 与竞争输入（flush 失败即封闭失败）。
3. 排入一个保留的 `<loop_iteration>` prompt，作为带 `LoopMessageSource` 的 `user/message`，开启独立的请求系列。该 prompt 就是**状态刷新**：目标、`iteration/maxIterations`、模式指令，以及纯粹从 durable 状态重建的只读状态块——任务板（带过期标记）、预算账本、节奏、最新报告、任何 redirect 备注。任何临时内容都不进入刷新。
4. `agent/pre-step` 围栏把完整认领记录对照当前 loop 校验（revision 围栏、人类让位：预留前到达的任何人类输入都让自动工作等待），对下游监听器前后都校验。
5. 轮次结束即结算迭代：`loop_report` 调用给出结果；没有则按策略默认以从该轮派生的摘要结算 `continue`。结算写入 `loop/iteration` + `loop/change`（预算增量），随后驱动在进入下一空闲前应用治理（检查点触发、预算耗尽、节奏等待）。

**Fresh-agent 模式** —— 把 ralph 模式 durable 化：

1. 空闲时（或前一子代理结算后），驱动经 `ctx.subagents` 生成一个子代理（provider 取自配置，默认 `spawn`；结构化输出报告 schema 与 ralph 的报告词汇相同），携带同一份状态刷新 prompt；父会话永不播种（provider 必须报告 `inheritsParentContext: false`）。
2. 子代理看到：目标、迭代号 + 上限、状态刷新块、共享工作区即权威的指令。子代理的 scoped 世界携带 scoped 到该 loop 的 `dsh-tool-loop`（任务 CRUD + `loop_report`），使子代理直接写内核；驱动在子代理终态结果上折叠最终结构化报告。
3. 迭代结算与同会话相同：durable 记录 + 预算增量（墙钟恒有；telemetry 开启时 token 来自子代理用量）。普通子代理失败结算 `error`，与 ralph 相同，仅当 loop spec 如此规定时才终结*下一次*尝试——默认：以 `error` 阻塞、保留最后报告、要求人类恢复（不静默自动重试，goal 规则）。

**治理，全部在驱动内：**

- **预算结算** —— `consumed` 在结算时单调推进；越过任一上限即以稳定码阻塞 loop（`iteration-cap` / `wall-clock-cap` / `token-cap` / `budget-exhausted`）。人类经 `edit` + `resume` 提高上限。
- **节奏** —— `minGapMs` 门控下一预留；`waitUntil`（durable）固定计划唤醒；恢复的会话精确重放过期等待。
- **检查点** —— 触发（每 N 次迭代、预算阈值）时驱动进入 `checkpoint`、暂停准入，并经交互面询问人类：会话在线时用 `ask_user_question`，否则挂起 `/loop` 待答状态。只有人类的 `approve` / `redirect` / `abort`（durable `exitCheckpoint`）才恢复工作。
- **完成验证** —— 只要设置了 `spec.verification`，`complete` 报告就永不完成 loop。`kind: 'command'` 时，驱动要求验证命令在迭代的执行上下文中 exit 0（同会话迭代用 shell 工具，或 fresh-agent 子代理报告前执行），失败输出成为下一次刷新输入；`kind: 'evaluator'` 时，下述评估器轮以附加指令运行。两种类型都由 `maxPasses` 设限；耗尽即以 `verification-failed` 阻塞 loop。
- **经验证的完成（评估器）** —— `kind: 'evaluator'` 时（或未设验证且部署默认开启评估器时），评估轮是一个 fresh-agent 子代理（或按配置的同会话轮），只看到目标、状态内核与所声称的证据，返回 `accept` / `reject(reason)`。`accept` 完成 loop；`reject` 结算评估并以拒绝理由作为刷新输入继续 loop。轮次有界（配置），随后以 `review-rejected` 阻塞。
- **停滞检测** —— 驱动跨结算比较任务板进展（任何 `lastTouchedAt` 变化都算进展）；`maxNoProgressIterations` 连续无进展迭代即以 `stall` 阻塞 loop。这是 `guard/repeat-tool-reminder`（步内重复）的 loop 级补充——其他 harness 作为独立子系统提供的跨迭代失控守卫。
- **新鲜度** —— 每次刷新从 `lastTouchedAt` 对比 `taskPolicy.staleAfterMs` 计算过期；过期条目在状态块中标记；`blockOnStale` 时第一个过期的 `in_progress` 任务即以 `stale-task` 阻塞 loop（LoopX "todo freshness" 的等价物）。
- **回滚检查点（可选，prompt 级）** —— 当 spec 的回滚策略开启时，刷新 prompt 指示迭代在危险变更前后记录工作区 git 检查点、验证失败时回滚（[claude-code-goal-loop](https://github.com/gyujeongion/claude-code-goal-loop) 模式）。无新子系统：用户工作区仓库即快照存储，指令文本是包自有字面量，故不变量伴生可校验。
- **拆除** —— 关闭准入、解除武装、以有界结算取消在途工作（workflow `dispose()` 纪律）、等待静默；每条路径封闭失败。

**恢复** —— 整个引擎可重放：加载时把 `loop/*` 事件折叠进 `loops` 投影；不变量伴生在加载时拒绝损坏日志（每 id 一次创建、revision 单调、迭代顺序、complete/clear 后无变更、`consumed` 单调、任务图无环）。日志尾缺失结算是有效的中断证据，而非损坏（team/task 先例）。

### 模型面（`dsh-tool-loop`）

| 工具 | 用途 |
|---|---|
| `loop_status` | 当前 loop 视图：phase、迭代、预算账本、带过期标记的任务板、最新报告。 |
| `loop_create` | 创建命名 loop：目标、模式、预算、节奏、审查、任务策略、验证、停滞策略。 |
| `loop_update` | spec 的 CAS 编辑（含提高预算上限）。 |
| `loop_report` | 结算被接纳的迭代：`continue` / `complete` / `blocked` + 有界报告（按状态校验，ralph 规则）。 |
| `loop_task` | 创建/更新任务板条目（状态、详情、blockedBy、writeScopes）。 |
| `loop_control` | `pause`（模型可暂停）、`block`（模型可带理由阻塞）。`resume` / `complete` / `clear` 人类授权（命令面）——goal 权限划分的扩展。 |

系统提示引导（固定段、前缀稳定）：对跨轮次、跨重启或跨天持续的工作使用 loop；对 loop 工作动手前先 `loop_status`；工作区与任务板是 durable 权威，不是对话；每次迭代都报告结果；不要 resume 或 clear——人类做。

### 人类面

`/loop` 命令（子命令，`ctx.commands`）：`status`、`create`、`edit`、`pause`、`resume`、`block <reason>`、`complete`、`clear`、`checkpoint`（展示待答检查点；回答 approve / redirect / abort）。检查点待答状态在 Web UI（Phase 3）中作为首要操作面渲染。

### 配置（无硬编码 tunable）

- `dsh-loop`：创建时应用的部署默认——`defaults.maxIterations`、`defaults.maxWallClockMs`、`defaults.maxTokens`、`defaults.staleAfterMs`、`defaults.maxNoProgressIterations`、`report.maxChars`（有界报告上限）、`task.maxItemsPerLoop`、`creation.requireBudget`（Go/No-Go 成本门槛：拒绝不带任何预算上限的 loop 创建）。
- `dsh-loop-round-driver`：`mode` 默认、`subagentProvider`（fresh-agent）、`evaluator.enabled`、`evaluator.provider`、`evaluator.maxPasses`、`checkpointDefaults`、`settle.tokensFromTelemetry`（token 上限 opt-in；迭代 + 墙钟上限恒可用）。
- `dsh-tool-loop`：启用的工具、`maxReportChars`、`maxTasks`。

### Bundle 接线

按 goal 的行镜像挂载进 [`dsh-base`)](../../../../packages/bundle/base/README.zh.md)：`loop`、`tool-loop`、`command-loop`、`loop-round-driver` 为可单独禁用的行，带逐行理由注释；`ui-loop` 在 Phase 3 加入 web app bundle。`sdk-minimal` 刻意不挂载该组（独立最小树，不变）。

### 文档、门禁与测试

- `docs/subsystems/loop.md`（+ `.zh.md`）：类型、事件、服务 API（生成的 cordis-surface 段）、驱动策略。
- `packages/loop/README.md` 组映射（+ `.zh.md`）；每个包 README 带规范的 `Model Experience` 与 `Known Limitations and Deferred Work` 段。
- 更新 `docs/architecture.md` "Where new behavior goes"（行：添加受治理长时程循环 → `ctx.loops`；loop 检查点 → 交互面）与 `packages/README.md` 组表。
- 重新生成：`config-catalog`、`tool-catalog`、`event-producer-consumer`、`module-graph`；i18n sidecar；`docs/user/guide/loop.md` 用户指南 + 网站投影（schedule 指南先例）。
- 不变量：`dsh-loop/invariant.ts` 加载时校验 `loop/*` 日志协议；`dsh-loop-round-driver/invariant.ts` 校验被接纳的同会话迭代消息与包自有刷新 prompt 一致（goal-round-driver 先例）。
- 单测达每文件 100% 覆盖：服务状态机、CAS 与过期 revision 拒绝、重放折叠 + 损坏日志拒绝、投影新鲜度派生、任务 DAG 校验、预算结算数学、节奏数学。
- 驱动测试：竞态矩阵——过期预留、人类让位、在途 `edit` 的 revision 围栏、取消收敛、flush 失败、插件卸载时的在途迭代；fresh-agent 生命周期——子代理失败结算、provider 契约违例响亮失败、取消有界结算；检查点流程；评估器接受/拒绝/有界拒绝；恢复/fork 解除武装；`waitUntil` 重放。
- 无 key 快照：可运行的 headless 示例——人类创建 loop（`/loop create`）、两次同会话迭代带任务板更新、`loop_report complete`、评估器接受——录制转录并对照期望输出重放（测试策略先例）。
- SDK 投影：loop 是模型可见且已记录的，故 TypeScript 与 Python SDK 期望输出在同一 PR 更新（两个 SDK 都投影 loop）。

### 交付阶段

| 阶段 | PR 范围 | 可发布状态 |
|---|---|---|
| 0 —— 领域 | `loop` 包（类型、事件、服务、投影、不变量）+ `tool-loop` + `command-loop` + base-bundle 行 + 子系统文档 + 本 note → implemented | Loop 存在、durable、人类/模型可编辑；无自动运行。 |
| 1 —— 同会话驱动 | `loop-round-driver`（同会话模式）：预留/flush/围栏、刷新 prompt、预算结算（迭代 + 墙钟）、节奏、恢复、单测 + 快照测试 | 武装的 loop 在会话内跨重启持续推进，直到完成/阻塞/上限/清除。 |
| 2 —— Fresh-agent + 评估器 | Fresh-agent 模式（subagent 缝、报告折叠）、经 telemetry 的 token 结算、评估器支撑的完成 | 多日、上下文有界的运行，带经验证的完成。 |
| 3 —— 治理 + UI | 检查点（交互面）、新鲜度策略 + `stale-task` 自动阻塞、`ui-loop` 面板 + Chat 迭代节点、用户指南 + 网站 | Web 产品中的受治理、可审查 loop。 |
| 4 —— 整合（决策 PR） | 把 `goal-round-driver` 重建在 `ctx.loops` 之上（goal = loop 预设：同会话、迭代上限、无预算）或文档化永久并存；完成 TS/Python SDK loop 面；按 pre-release 姿态清退整合所过时的部分 | 一个 loop 引擎；goal 的表面保留或并入。 |

## 曾考虑的替代方案

- **把 `goal` 扩展成 loop 领域。** Goal 的契约是单一目标、四个 phase、仅轮次上限的预算、同会话续跑。把多 loop、预算、任务内核、检查点、评估器与第二执行模式叠加到 `GoalService` 上，会让每次 goal 变更都为大多数 goal 用不到的治理付费，且 fork/revision 语义会把两个生命周期纠缠进一个事件。Pre-release 姿态偏好正确的基础：现在独立的 `loop` 组，引擎被证明后在 Phase 4 整合。
- **建在 `ralph`/`workflow` 上（每 loop 一个固定脚本）。** Workflow 脚本是单次运行、内存中、模型编写；durable 引擎的状态必须住在 session log，其续跑跨重启由空闲驱动——那是 goal-round-driver 模式的工作。每 loop 一个脚本会在 worker 线程里重造预留、围栏与恢复，丢掉 session 的 durable 与不变量。
- **采用外部 durable-execution 编排器（Temporal 类）。** 工作流世界对 durable 长时程状态机的答案是带重放的事件溯源编排器。dsh 的 session log 对进程内 agent 而言*就是*那份事件历史：加一个外部引擎会在产品已声明权威日志之旁引入第二事实来源、为一个会话级关切引入进程外依赖、为每个迭代事实引入一套 wire 协议。Durable-execution 谱系影响设计（重放即恢复、结算是 durable 事实），但不作为基础设施被采用。
- **封装社区 goal-mode 插件（[claude-goal](https://github.com/Potarix/claude-goal)/[claude-code-goal](https://github.com/balakumardev/claude-code-goal) 模式）。** 这些移植证明了 Codex 风格 `/goal` 语义的需求，但它们活在 harness 自己的文件与状态模型里（markdown 目标文件、会话内 prompt）。在 dsh 中等价物必须是带 CAS、不变量与投影的 durable session 状态——一个领域包，而非 prompt 封装；且治理半边（预算、验证、检查点）没有社区先例可封装。
- **直接采用 LoopX 本体（外部控制平面，git 承载状态）。** LoopX *设计上*就是 agent 循环无关——它看不到 dsh 的 session log，其状态内核会成为与 dsh 声明权威并存的第二事实来源，每个模型可见的 loop 事实都会违反 `model-visible ⟺ logged`。其 `dsh_goal_mode` 适配器从外部驱动 dsh 既有 goal mode；本提案把那个适配器所求的东西内化了。当设计可原生移植时，运行时依赖成本（Python 进程、文件存储、同步）不值。
- **扩展实验性 agent-team 领域。** Team 是多会话（花名册、邮箱、lead/teammate 角色）且私有 opt-in；loop 是单会话、单属主引擎。借用任务快照形状就够；继承 team 的身份、权限与邮箱机制是错误粒度。
- **每会话一个 loop（镜像 goal）。** LoopX 跑多个并行 loop。dsh 的驱动按会话空闲驱动，N 个武装 loop 会竞争一个收件箱。v1 允许多个*命名* loop 但恰好武装一个；多武装并发（例如经 subagent 支撑的 loop）在内核 durable 之后是干净的扩展。
- **loop 状态放 storage hub 或 SQLite。** 非 session 存储与 `dsh-session-query` 是读侧或辅助；loop 是模型可见的会话状态。Session log 是唯一同时满足重放、fork 语义与 model-visible 不变量的存储。

## 验收标准

- 经工具或 `/loop` 创建的 loop 在重启、恢复与 fork 后存活：其快照、任务板、预算账本与迭代历史重放一致，不变量伴生接受该日志（并拒绝测试构造的每种损坏变体）。
- 同会话驱动持续武装的 loop——预留、flush、刷新、围栏——直到 loop 完成、阻塞、耗尽上限或被清除；只有被接纳的 `loop` 源轮次消耗迭代预算，人类输入始终让位于自动工作。
- Fresh-agent 模式每迭代运行一个 fresh 子代理，携带状态刷新 prompt；父会话只携带原始调用与有界结算报告；子代理失败结算 `error` 并阻塞且保留最后报告。
- 预算耗尽以稳定码 durable 阻塞 loop；经 `loop_update` 提高上限 + 人类 `resume` 后在下一节奏点继续。
- 触发的检查点挂起一切准入，直到人类经交互面作答；`approve` / `redirect` / `abort` 各自产生正确的 durable 迁移。
- 设置 `verification` 时，`complete` 报告仅在命令路径 exit 0 或评估器路径返回 `accept` 后被接受；有界次失败以 `verification-failed` 阻塞。
- 启用评估器时，虚假的 `complete` 报告被拒绝并驱动续跑迭代；有界次拒绝以 `review-rejected` 阻塞。
- 设置 `maxNoProgressIterations` 时，N 次连续无进展迭代以 `stall` 阻塞 loop，人类 `resume` 后任务板再次移动即从下一节奏点继续。
- Session 恢复与 fork 后所有 loop 保持解除武装，直到显式的人类授权恢复；过期的 durable `waitUntil` 在恢复后恰好重放一次。
- 无 key 快照示例（创建 → 两次迭代 → 经验证的完成）录制并重放真实转录；TypeScript 与 Python SDK 期望输出包含 loop 事件。
- 本变更的全部仓库门禁通过：`test:coverage`、`typecheck`、`lint`、`build`、`hygiene`、`doc-sync`、`test:snapshot`。

## 风险

- **与 goal/ralph 的重叠蔓延** —— 上文边界表是控制手段；Phase 4 必须显式做出整合决策（pre-release 姿态倾向引擎被证明后把 goal 驱动并入 loop），而不是让三个长时程原语各自漂移。
- **驱动竞态** —— 预留/flush/围栏机制是 goal-round-driver 的成熟模式，但 fresh-agent 模式增加子代生命周期竞态（生成中取消、卸载时在途子代、结构化报告拒绝）。缓解：测试计划里的完整竞态矩阵、封闭失败拆除、处处有界结算。
- **Token 预算记账与 telemetry 同命** —— telemetry 关闭时 token 上限没有数据。缓解：token 上限 opt-in 配置；迭代与墙钟上限恒可执行；`settle.tokensFromTelemetry` 配置显式命名该依赖。
- **评估器成本与被操纵** —— 评估器轮把完成时成本翻倍，且自报的 worker 可以粉饰证据。缓解：评估器默认关、有界轮次、默认 fresh-agent 评估器（与 worker 不共享上下文）、耗尽时 `review-rejected` 而非静默放过。
- **验证命令在 agent 权限内运行** —— `command` 验证经 loop 的常规工具与权限策略执行，草率的 spec 可能花掉真实副作用。缓解：命令在 loop 既有 sandbox 与审批策略下运行（不绕过）、`maxPasses` 限制重复花费、spec 由人类或模型按任何 `loop_create` 相同的权限规则撰写。
- **两份任务列表（loop 任务板 vs `todo_write` 工具）** —— 任务板是 loop 范围的 durable 状态；todo 工具保持通用每会话草稿列表。引导文本告诉模型何时用哪个；实践中若用途混淆，Phase 3 重新审视该表面（可能统一模型面工具）。
- **Prompt 表面增长** —— 状态刷新块随任务板增长。缓解：任务数与报告尺寸有界（配置）、只读投影带过期标记而非完整历史、compaction 作为既有的上下文压力缓解。
- **范围** —— 五个阶段不小。每个阶段独立可发布且有用（Phase 0 已给出零自动化下的 durable 受治理 loop 状态），故工程可在任何阶段边界干净停止。

## 相关

- [LoopX](https://github.com/huangruiteng/loopx) —— 参考控制平面（状态内核、状态刷新、todo 新鲜度、配额结算、交互模式、含 `dsh_goal_mode` 的 per-harness goal-mode 适配器）。
- [Loop engineering 目录（AgentPatterns.ai）](https://www.agentpatterns.ai/loop-engineering/) —— agentic coding 三层循环、外循环叠加、Ralph Wiggum fresh-context 循环、收敛检测、循环 Go/No-Go 成本门槛。
- [Codex goal mode](https://developers.openai.com/codex/use-cases/follow-goals) —— [用例](https://developers.openai.com/codex/use-cases/follow-goals) + [cookbook](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex)；带[验证命令与停止条件](https://www.ai-primer.com/engineer/stories/codex-goal-six-element-template)的六字段目标模板。
- [Claude Code goal mode](https://code.claude.com/docs/en/goal) —— "Keep Claude working toward a goal"；此前出现它的社区移植（[claude-goal](https://github.com/Potarix/claude-goal)、[claude-code-goal](https://github.com/balakumardev/claude-code-goal)）。
- [claude-code-goal-loop](https://github.com/gyujeongion/claude-code-goal-loop) —— 带回滚快照与 stuck-handler 的验证步进 goal loop。
- [用 Temporal 构建 durable agent](https://temporal.io/blog/building-durable-agents-with-temporal-and-ai-sdk-by-vercel) —— session log 已占据的"事件历史即事实来源"谱系。
- dsh 生态 —— [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI)、[dsh-gungnir](https://www.npmjs.com/package/dsh-gungnir)、LoopX 的 `dsh_goal_mode` 适配器：loop 领域服务的第三方表面。
- [Goal 子系统)](../../../../docs/subsystems/goal.zh.md) 与[同会话 goal-round-driver)](../../implemented/feature/2026-07-19-same-session-goal-round-driver.zh.md) —— 本设计扩展的 durable、预留与围栏模式。
- [Ralph 工具)](../../implemented/feature/2026-07-19-fresh-agent-ralph-workflow-tool.zh.md) —— fresh-agent 报告词汇及其延后的评估器/预算工作，由 loop 引擎接管。
- [Agent Teams)](../../implemented/feature/2026-08-05-agent-teams.zh.md) —— 任务快照与全快照事件先例。
- [Session 投影强制缝)](../../implemented/architecture/2026-08-19-session-projection-mandatory-seam.zh.md) —— `loops` 投影注册模式。
- [Session log 版本机制)](../../implemented/architecture/2026-08-10-session-log-version-mechanism.zh.md) —— 为何加性事件种类无需格式 bump。
