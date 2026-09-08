# Agent Note: Loop module — a governed long-horizon loop engine (LoopX-inspired)

Status: proposed

English | [中文](2026-09-03-loop-module-governed-long-horizon-loop-engine.zh.md)

## Problem

dsh runs long tasks today, but the capability is scattered across independent ad-hoc primitives, none of which is a durable, governed *work engine*:

- [`goal`)](../../../../packages/goal/README.md) is one durable objective per session with same-session rounds and a round cap only — no budget, no task state, no completion verification, one objective at a time.
- [`ralph`)](../../../../packages/workflow/tool-ralph/README.md) is a fixed foreground loop of fresh agents toward an immutable objective — no persistence across calls, completion is worker self-declaration, the workspace is the only cross-round memory, round count is the only bound.
- `schedule`, `jobs`, `workflow`, and `guard` cover reminders, background work, scripted fan-out, and loop hygiene respectively, but nothing combines them into a *named, steerable, budgeted engine* that keeps working toward an objective across restarts and days.

The missing piece is a first-class loop domain: durable loop state (objective, budget, progress), iteration records, a reviewable state kernel the model and the human both read and write, governance (budgets, checkpoints, staleness, verified completion), and restart-safe continuation.

The reference design is [LoopX](https://github.com/huangruiteng/loopx) (huangruiteng/loopx), a Python-based, agent-loop-agnostic control plane described as a "long-horizon agent control plane for durable, governed work across Codex, Claude Code, and other harnesses" (v0.5.x; earlier: "lightweight loop engineering state kernel for long-running AI agent teams"). Its load-bearing ideas, as documented in its repo and third-party write-ups:

- **Durable, reviewable state as the kernel** — loop state lives in an inspectable store (git-backed; `git pull --ff-only` in its getting-started path), and the state-interaction model requires **validating and writing durable state before spending** model work.
- **State refresh** — each iteration's context is rebuilt from durable state (`state_refresh.py`, with a classification), plus a read-only project map the agent works from.
- **Todo freshness** — tracked items carry staleness; "Todo freshness and quota settlement recovery" is a named v0.5.4 concern.
- **Quota allocation and settlement** — budgets are allocated, settled per unit of work, and recoverable (`docs/quota-allocation.md`, `agent_scope_wait`).
- **Interaction pattern catalog** — a documented set of governed human/agent interaction patterns.
- **Per-harness goal-mode adapters** — `claude_goal_mode`, `dsh_goal_mode`: LoopX already treats dsh as a target harness and drives its goal mode from outside.

LoopX proves the shape of the problem. This proposal adopts its design natively: the state kernel becomes dsh's session log, refresh becomes a retained per-iteration prompt, quota becomes a durable budget ledger, and the adapters become unnecessary because the loop lives *inside* dsh. No external Python control plane, no second state store.

## Ecosystem and prior-art survey

Extended research across the loop-engineering field, the commercial harnesses' goal modes, open-source control planes, and the durable-execution lineage. Each subsection ends with what it contributes to this proposal.

### Loop engineering as a design field

The term "loop engineering" has consolidated into a recognized design area: designing the loops *around* the model call so long-horizon work converges instead of stalling. [AgentPatterns.ai](https://www.agentpatterns.ai/loop-engineering/) maintains the public catalog: [loop engineering that converges](https://www.agentpatterns.ai/loop-engineering/), [the three loops of agentic coding](https://www.agentpatterns.ai/loop-engineering/three-loops-agentic-coding/) (a diagnostic vocabulary separating the step-level inner loop from the stacked outer loops), [stacking outer loops around the agent](https://www.agentpatterns.ai/loop-engineering/loop-engineering/), [the Ralph Wiggum fresh-context loop](https://agentpatterns.ai/loop-engineering/ralph-wiggum-loop/), [convergence detection in iterative refinement](https://agentpatterns.ai/loop-engineering/convergence-detection/), and [the loop Go/No-Go cost gate](https://agentpatterns.ai/loop-engineering/agent-loop-go-no-go-gate/) (when looping earns its cost). The adjacent context-engineering track covers [stateful iteration state-carry — typed persistent state for long agent loops](https://raw.githubusercontent.com/agentpatterns-ai/website/refs/heads/main/context-engineering/stateful-iteration-state-carry.md) and [remember, don't re-read](https://learn.agentpatterns.ai/context-engineering/remember-dont-re-read/). Industry commentary treats this as the post-prompt center of gravity: [BAAI: Harness 之后，硅谷 AI 圈又来新词了：Loop Engineering](https://hub.baai.ac.cn/view/55505), [钛媒体: Prompt已死，Loop Engineering成了硅谷AI圈新顶流](https://www.tmtpost.com/8036245.html), and the enterprise framing in [Google's "The Outer Loop: agentic governance and self-evolution"](https://discuss.google.dev/t/the-outer-loop-how-google-cloud-and-alphaevolve-are-defining-agentic-governance-and-self-evolution/383304#p-969180-the-anatomy-of-an-enterprise-loop-1).

Contribution: the three-loops vocabulary (inner step loop / middle iteration engine / outer governance loop) is adopted directly for the subsystem doc; the Go/No-Go gate becomes a creation-time budget policy; convergence detection becomes the stall policy.

### Goal mode converged across the commercial harnesses

- **Codex** ships a long-horizon `/goal` mode with official docs: [Follow a goal (use case)](https://developers.openai.com/codex/use-cases/follow-goals) and [Using Goals in Codex (cookbook)](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex). Practitioner coverage emphasizes multi-hour unsupervised runs and a structured goal template — [the /goal template's six fields include explicit verification commands and stop conditions](https://www.ai-primer.com/engineer/stories/codex-goal-six-element-template) ([NEC's practitioner write-up, in Japanese](https://note.nec-solutioninnovators.co.jp/n/n2a14ecbf1228), [ofox: Codex Goal Mode](https://ofox.ai/blog/codex-goal-mode-remote-computer-use-2026)).
- **Claude Code** now documents its own goal mode: [Keep Claude working toward a goal](https://code.claude.com/docs/en/goal) ([中文](https://code.claude.com/docs/zh-CN/goal)). Before the official mode, the community ported Codex's semantics wholesale: [Potarix/claude-goal](https://github.com/Potarix/claude-goal), [balakumardev/claude-code-goal](https://github.com/balakumardev/claude-code-goal), [jthack/claude-goal](https://github.com/jthack/claude-goal) — all titled "Codex-style /goal for Claude Code".
- **LoopX** treats both as adapter targets (`claude_goal_mode`, `dsh_goal_mode`) — dsh is already a first-class citizen of the cross-harness goal-mode surface.

Contribution: "objective + verification + stop conditions + automatic continuation" is the de facto cross-harness goal-mode contract. The loop spec must carry **explicit verification and stop conditions**, not just an objective and a round cap; the loop domain is also the native home that LoopX's `dsh_goal_mode` adapter would otherwise drive from outside.

### Open-source control planes and goal loops

- **[LoopX](https://github.com/huangruiteng/loopx)** (covered above) — the reference state kernel.
- **[claude-code-goal-loop](https://github.com/gyujeongion/claude-code-goal-loop)** — a verified-step autonomous goal loop with **rollback snapshots and a stuck-handler**: each verified step is checkpointed, a stuck loop is detected and recovered, and rollback is available on verified failure.
- **[agent-control-plane](https://github.com/ducminhnguyen0319/agent-control-plane)** — keeps GitHub-driven coding agents running reliably "without constant human babysitting": the repo-scoped reliability framing.
- **[officeos](https://github.com/officeos-co/officeos)** — platform-scale agent launch/orchestration (hundreds of agents); out of scope for a session-scoped engine but confirms the market direction.
- **[agent-patterns](https://github.com/acoyfellow/agent-patterns)** — a library of *bounded, steerable* agent execution patterns; the two adjectives (bounded, steerable) are exactly the loop governance goals.
- **Loop guardrails as their own category**: [loopguard-runtime](https://pypi.org/project/loopguard-runtime/) (PyPI) and [openclaw's runaway-loop guards — turn/error-batch/idle-repeat bounds](https://github.com/openclaw/openclaw/pull/121063/files#2) — other harnesses ship dedicated bounds on loop runaways; dsh's `guard` group covers in-step repeats and tool timeouts, but cross-iteration stalls are currently unguarded.
- **Goal-authoring as a skill**: [goal-writer](https://raw.githubusercontent.com/muxuuu/goal-writer/main/SKILL.md) — writing a good goal is itself a known failure mode with tooling answers; the [Ralph Wiggum technique](https://agentpatterns.ai/loop-engineering/ralph-wiggum-loop/) (fresh-context iteration) now has an [official ralph-wiggum plugin in anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/pull/126) with `--fresh-context`.

Contribution: verification must be a first-class spec field with a command path (not just an LLM evaluator); rollback belongs at the prompt-policy level (git checkpoint instruction, no new subsystem); a cross-iteration **stall policy** closes a gap in dsh today; bounded + steerable is the design north star.

### The durable-execution lineage

The workflow world solved durable, recoverable long-running state machines a generation ago: [Temporal + AI SDK: building durable agents](https://temporal.io/blog/building-durable-agents-with-temporal-and-ai-sdk-by-vercel), [Temporal's LangGraph plugin for durable execution](https://temporal.io/blog/temporal-langgraph-plugin-durable-execution). The pattern: an event-sourced history is the single source of truth, workers replay it to rebuild state, and recovery is re-execution from the history.

Contribution: dsh's session log is already exactly that event history for in-process agents. The loop module needs no external orchestrator: it *is* the durable-execution layer for the agent loop, which is why all loop state lives in the session log and recovery is replay.

### The dsh ecosystem today

dsh is public ([deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness), "Everything is a Plugin"), and third parties already build on it: a [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) client (v0.8.4), the [dsh-gungnir](https://www.npmjs.com/package/dsh-gungnir) npm package, and LoopX's `dsh_goal_mode` adapter targeting dsh's goal mode. Every one of them wants a durable, queryable long-horizon work state to render or drive.

Contribution: the loop domain is not only a product feature but the **integration surface** for the emerging dsh ecosystem — the `ctx.loops` service is `@Remote`-exported (goal precedent) so TUIs, SDKs, webhooks, and external control planes like LoopX read and drive the same durable state.

## Proposal

### Concept model

A **loop** is a durable, named long-horizon work engine owned by one session. It has:

- a **spec**: objective, execution mode, budget, cadence, review policy, task policy, verification, stall policy;
- a **phase** state machine: `active | paused | blocked | checkpoint | complete` (superset of `GoalPhase`, adding `checkpoint` for governed review stops);
- a **budget ledger**: iterations settled, wall-clock consumed, tokens consumed, with durable settlement per iteration;
- a **task board**: the durable state kernel — work items with status, blockers, and freshness.

An **iteration** is one unit of driven work: either a same-session model turn (goal-round pattern) or a fresh-agent run (ralph pattern), durably attributed, and settled with an outcome.

In the loop-engineering vocabulary the module spans all three loops: the **inner loop** is the existing step/turn cycle in `agent-loop` (unchanged); the **middle loop** is this module — the durable iteration engine with budget, state kernel, and refresh; the **outer loop** is the governance ring — human checkpoints, verification, and the evaluator. All three read and write the same session log, which is dsh's durable-execution substrate: the event history that plays for in-process agents the role an orchestrator (Temporal-class) plays for workflow code.

**Invariants honored throughout** (see [architecture)](../../../../docs/architecture.md)): every model-visible fact is a session event (`model-visible ⟺ logged`); registrations are effects with disposers; ids are branded; durable state is event-sourced with compare-and-set revisions, full-snapshot events, and load-time protocol invariants; policy is config, never a hardcoded tunable; no `agent-loop` change is required — the driver is a consumer of `agent/*` and `tools/*` extension points.

### Relationship to existing primitives

| Existing | Relationship after this change |
|---|---|
| `goal` | Untouched in v1–v3. Goal stays the simple "one objective, same-session rounds" feature. Loop is the governed superset. Phase 4 decides consolidation (goal driver rebuilt on loop, or documented coexistence). |
| `ralph` | Untouched. Ralph is one foreground call, stateless across calls, round-capped. Loop is persistent, stateful, budgeted. Loop's fresh-agent mode reuses the *subagent seam*, not the workflow engine. |
| `workflow` | Untouched. Scripts are per-run, in-memory, for fan-out; loops are durable engines. |
| `schedule` | Untouched. Loop cadence is loop-owned (durable `waitUntil` in the loop snapshot) so restarts re-arm exactly; schedule remains the general reminder facility. |
| `jobs` | Untouched. Loop iteration observability flows through `loop/*` domain events; jobs stays the generic background runtime. |
| agent teams (experimental) | Loop's task snapshot borrows the [`TeamTaskSnapshot`)](../../../../docs/subsystems/agent-team.md#shared-task-dag) shape (revision CAS, acyclic `blockedBy`, advisory `writeScopes`) but is single-session, single-owner, with no roster or mailbox. |
| `subagent-codex` / `subagent-claude-code` | Loop fresh-agent iterations can run inside other harnesses through the existing provider bundles — dsh-native equivalent of LoopX's cross-harness claim. |

### Package topology

New group `packages/loop/` (a new group is a pure container; the group README maps it). Roles follow the Service Definition / Provider / Consumer seam pattern:

| Package | Role | `ctx` key |
|---|---|---|
| `loop/` | `dsh-loop` — Service Definition + domain: `LoopService`, types, `loop/*` events, `loops` session projection, log-protocol invariant | `ctx.loops` |
| `tool-loop/` | `dsh-tool-loop` — model-facing tools + system-prompt guidance | registers on `ctx.tools` |
| `command-loop/` | `dsh-command-loop` — human `/loop` command plane | registers on `ctx.commands` |
| `loop-round-driver/` | `dsh-loop-round-driver` — the driver: same-session + fresh-agent modes, budget enforcement, cadence, checkpoints, evaluator; no service key | — |
| `ui-loop/` (Phase 3) | `dsh-client-ui-loop` — browser panel from the `loops` projection + Chat iteration nodes | client |

Naming follows the role vocabulary: `ctx.loops` is a service that owns multiple named members (plural key, `Service` role — `GoalService` is the precedent).

### Domain model

Types in `packages/loop/loop/src/types.ts`, mirroring [`goal`)](../../../../docs/subsystems/goal.md) and [`agent-team`)](../../../../docs/subsystems/agent-team.md) precedents:

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

### Durable events (SessionEventMap extensions)

Full-snapshot, CAS-checked, load-time-invariant-checked — the goal/agent-team protocol:

| Event | Payload | Notes |
|---|---|---|
| `loop/change` | complete post-mutation `LoopSnapshot`, or clear tombstone `{ cleared: LoopRef, clearedAt }` | create, spec edit, pause/resume/block/complete, checkpoint enter/exit, **budget settlement**. Every mutation increments `revision`. |
| `loop/task` | complete post-mutation `LoopTaskItem` (or tombstone) | one event per task mutation; acyclic `blockedBy` and positive unique ids enforced on fold. |
| `loop/iteration` | `LoopIterationRecord` | written when an iteration settles; start is observed live (below) — settlement is the durable fact, mirroring "validate and write durable state before spending" in reverse: spend, then settle durably, and only settled work counts. |

Live extension-point events (emit, scope-filtered, contained — `goal/changed` precedent): `loop/changed`, `loop/iteration-started`, `loop/iteration-settled`, `loop/checkpoint`.

Only admitted same-session iteration prompts enter history, as `user/message` with `LoopMessageSource`; only entered messages consume `iterationsStarted`. Adding event kinds is additive — no `SESSION_FORMAT_VERSION` bump (structural format is unchanged).

### Service API (`ctx.loops` — `LoopService`)

Backed exclusively by the owning session log via the `loops` projection key (mandatory-projection precedent):

- reads: `list(agent)`, `get(agent, loopId?)` — current views including derived freshness;
- lifecycle: `create` (one or more named loops per session; creation disarms everything else that would be armed — at most **one armed loop per session** in v1), `edit` (spec partial, CAS), `pause`, `resume` (human-authorized; re-arms), `block` (policy-owned reason), `complete`, `clear` (tombstone + history retained);
- checkpoint: `enterCheckpoint(agent, loopId, trigger)`, `exitCheckpoint(agent, loopId, decision)` — `approve` resumes, `redirect` resumes with the human's input, `abort` pauses;
- driver admission: `reserveIteration(agent, loopId, revision)` (CAS reservation of `iterationsStarted + 1`), `settleIteration(agent, record)` (outcome + budget delta + report → durable `loop/iteration` + `loop/change`);
- task kernel: `createTask`, `updateTask` (CAS; status, detail, blockedBy, writeScopes; bumps `lastTouchedAt`);
- `@Remote` exports for the SDK surface mirroring `GoalService` (`remoteExportCreate` etc.).

Activation (may the driver start another iteration) is process-local, as in goal: the driver arms on create/resume, disarms on pause/block/complete/clear/unload; session resume and fork leave loops **disarmed until an explicit human-authorized resume** (the goal rule — a loop never revives work on its own).

### The driver (`dsh-loop-round-driver`)

An ordinary plugin over `ctx.loops`, `ctx.agents`, `ctx.subagents`, and the interaction seams. It takes configuration, no policy shortcuts: every cap is a spec field or a config field.

**Same-session mode** — the goal-round-driver pattern, extended:

1. At whole-agent idle with an active, armed loop, remaining budget, and cadence elapsed, the driver **reserves** `iterationsStarted + 1` for the current `{ loopId, revision }` (stale reservations never consume numbers).
2. Durability checkpoint: await `ctx.sessions.flush()` and recheck revision and competing input after the await (fail closed on flush failure).
3. Queue one retained `<loop_iteration>` prompt as a `user/message` with `LoopMessageSource`, starting a distinct request series. The prompt is the **state refresh**: objective, `iteration/maxIterations`, mode instructions, and a read-only state block rebuilt purely from durable state — task board (with staleness flags), budget ledger, cadence, latest report, any redirect note. Nothing ephemeral crosses into the refresh.
4. An `agent/pre-step` fence verifies the complete claimed record against the current loop (revision fence, human-yield: any human input that arrived before the reservation makes automatic work wait), before and after downstream listeners.
5. The iteration settles when the turn ends: a `loop_report` call provides the outcome; absent one, the policy default settles `continue` with a summary derived from the turn. Settlement writes `loop/iteration` + `loop/change` (budget delta), then the driver applies governance (checkpoint trigger, budget exhaustion, cadence wait) before the next idle.

**Fresh-agent mode** — the ralph pattern, made durable:

1. On idle (or after the previous child settles), the driver spawns one child through `ctx.subagents` (provider from config, `spawn` default; structured-output report schema identical to ralph's report vocabulary) with the same state-refresh prompt; the parent's conversation is never seeded (provider must report `inheritsParentContext: false`).
2. The child sees: objective, iteration + cap, state refresh block, shared-workspace-as-authority instruction. The child's scoped world carries `dsh-tool-loop` (task CRUD + `loop_report`) scoped to this loop, so the child writes the kernel directly; the driver folds the final structured report on the child's terminal result.
3. Iteration settlement is identical to same-session: durable record + budget delta (wall-clock always; tokens from the child's usage when telemetry is on). An ordinary child failure settles `error` and, like ralph, is terminal for the run's *next* attempt only if the loop spec says so — default: block with `error`, retain the last report, require human resume (no silent auto-retry, the goal rule).

**Governance, all in the driver:**

- **Budget settlement** — `consumed` advances monotonically on settlement; any cap crossed blocks the loop with the stable code (`iteration-cap` / `wall-clock-cap` / `token-cap` / `budget-exhausted`). Human raises the cap via `edit` + `resume`.
- **Cadence** — `minGapMs` gates the next reservation; `waitUntil` (durable) pins a scheduled wake; a resumed session re-fires an expired wait exactly.
- **Checkpoints** — on a trigger (every Nth iteration, budget threshold), the driver enters `checkpoint`, suspends admission, and asks the human through the interaction plane: `ask_user_question` when the session is live, otherwise a parked `/loop` pending state. Work resumes only on the human's `approve` / `redirect` / `abort` (durable `exitCheckpoint`).
- **Completion verification** — a `complete` report never completes the loop while `spec.verification` is set. For `kind: 'command'`, the driver requires the verification command to exit 0 in the iteration's execution context (the same-session iteration's shell tool, or the fresh-agent child before it reports), with the failure output becoming the next refresh input; for `kind: 'evaluator'`, the evaluator pass below runs with the extra instructions. Either kind is bounded by `maxPasses`; exhaustion blocks the loop with `verification-failed`.
- **Verified completion (evaluator)** — with `kind: 'evaluator'` (or when no verification is set and the deployment default enables the evaluator), the pass is one fresh-agent child (or same-session turn, per config) that sees only the objective, the state kernel, and the claimed evidence, and returns `accept` / `reject(reason)`. `accept` completes the loop; `reject` settles the evaluation and continues the loop with the rejection as the refresh input. Passes are bounded (config), then the loop blocks with `review-rejected`.
- **Stall detection** — the driver compares task-board progress across settlements (any `lastTouchedAt` change counts as progress); `maxNoProgressIterations` consecutive progress-free iterations block the loop with `stall`. This is the loop-level complement to `guard/repeat-tool-reminder` (in-step repetition) — the cross-iteration runaway guard that other harnesses ship as their own subsystem.
- **Freshness** — every refresh computes staleness from `lastTouchedAt` vs `taskPolicy.staleAfterMs`; stale items are flagged in the state block; with `blockOnStale`, the first stale `in_progress` task blocks the loop with `stale-task` (the LoopX "todo freshness" equivalent).
- **Rollback checkpoints (optional, prompt-level)** — when the spec's rollback policy is set, the refresh prompt instructs the iteration to record a workspace git checkpoint before risky changes and to revert on a verified failure (the [claude-code-goal-loop](https://github.com/gyujeongion/claude-code-goal-loop) pattern). No new subsystem: the user's workspace repo is the snapshot store, and the instruction text is a package-owned literal, so the invariant companion can verify it.
- **Teardown** — closing admission, disarming, canceling in-flight work with bounded settlement (workflow `dispose()` discipline), and quiescence await; fail-closed on every path.

**Recovery** — the whole engine is replayable: fold `loop/*` events into the `loops` projection on load; the invariant companion rejects corrupted logs at load (one create per id, monotonic revisions, sequential iterations, no mutation after complete/clear, monotonic `consumed`, acyclic task graph). A missing settlement at the log tail is valid interruption evidence, not corruption (team/task precedent).

### Model-facing surface (`dsh-tool-loop`)

| Tool | Purpose |
|---|---|
| `loop_status` | Current loop views: phase, iteration, budget ledger, task board with staleness flags, latest report. |
| `loop_create` | Create a named loop: objective, mode, budget, cadence, review, task policy, verification, stall policy. |
| `loop_update` | CAS edit of the spec (including raising budget caps). |
| `loop_report` | Settle the admitted iteration: `continue` / `complete` / `blocked` + bounded report (status-specific validation, ralph rules). |
| `loop_task` | Create/update task-board items (status, detail, blockedBy, writeScopes). |
| `loop_control` | `pause` (model may pause), `block` (model may block with a reason). `resume` / `complete` / `clear` are human-authorized (command plane) — the goal authority split, extended. |

System-prompt guidance (fixed section, prefix-stable): use loops for work that should keep going across turns, restarts, or days; `loop_status` before acting on loop work; the workspace and the task board are the durable authority, not the conversation; report every iteration outcome; do not resume or clear — the human does.

### Human surface

`/loop` command (subcommands, `ctx.commands`): `status`, `create`, `edit`, `pause`, `resume`, `block <reason>`, `complete`, `clear`, `checkpoint` (shows pending checkpoint; answers approve / redirect / abort). A checkpoint pending state renders in the web UI (Phase 3) as the primary affordance.

### Configuration (no hardcoded tunables)

- `dsh-loop`: deployment defaults applied at create — `defaults.maxIterations`, `defaults.maxWallClockMs`, `defaults.maxTokens`, `defaults.staleAfterMs`, `defaults.maxNoProgressIterations`, `report.maxChars` (bounded-report ceiling), `task.maxItemsPerLoop`, `creation.requireBudget` (the Go/No-Go cost gate: refuse loop creation that carries no budget cap).
- `dsh-loop-round-driver`: `mode` default, `subagentProvider` (fresh-agent), `evaluator.enabled`, `evaluator.provider`, `evaluator.maxPasses`, `checkpointDefaults`, `settle.tokensFromTelemetry` (token cap is opt-in; iteration + wall-clock caps always available).
- `dsh-tool-loop`: enabled tools, `maxReportChars`, `maxTasks`.

### Bundle wiring

Mount in [`dsh-base`)](../../../../packages/bundle/base/README.md) mirroring goal's rows: `loop`, `tool-loop`, `command-loop`, `loop-round-driver` as individually disable-able rows with per-row rationale comments; `ui-loop` joins the web app bundle in Phase 3. `sdk-minimal` deliberately does not mount the group (standalone minimal tree, unchanged).

### Documentation, gates, and tests

- `docs/subsystems/loop.md` (+ `.zh.md`): types, events, service API (generated cordis-surface section), driver policy.
- `packages/loop/README.md` group map (+ `.zh.md`); every package README with the canonical `Model Experience` and `Known Limitations and Deferred Work` sections.
- Update `docs/architecture.md` "Where new behavior goes" (rows: add a governed long-horizon loop → `ctx.loops`; loop checkpoint → interaction plane) and `packages/README.md` group table.
- Regenerate: `config-catalog`, `tool-catalog`, `event-producer-consumer`, `module-graph`; i18n sidecars; a `docs/user/guide/loop.md` user guide + website projection (schedule guide precedent).
- Invariants: `dsh-loop/invariant.ts` validates the `loop/*` log protocol at load; `dsh-loop-round-driver/invariant.ts` verifies admitted same-session iteration messages match the package-owned refresh prompt (goal-round-driver precedent).
- Unit tests to 100% per-file coverage: service state machine, CAS and stale-revision rejection, replay fold + corrupted-log rejection, projection freshness derivation, task DAG validation, budget settlement math, cadence math.
- Driver tests: the race matrix — stale reservation, human-yield, revision fence on mid-flight `edit`, cancel convergence, flush failure, plugin unload with in-flight iteration; fresh-agent lifecycle — child failure settlement, provider contract violation fails loud, cancellation bounds settlement; checkpoint flows; evaluator accept/reject/bounded-reject; resume/fork disarm; `waitUntil` re-fire.
- Keyless snapshot: a runnable headless example — human creates a loop (`/loop create`), two same-session iterations with task-board updates, `loop_report complete`, evaluator accept — recorded transcript replayed against the expected output (testing-policy precedent).
- SDK projection: loop is model-visible and logged, so the TypeScript and Python SDK expected outputs update in the same PRs (both SDKs project the loop).

### Delivery phases

| Phase | PR scope | Shippable state |
|---|---|---|
| 0 — Domain | `loop` package (types, events, service, projection, invariant) + `tool-loop` + `command-loop` + base-bundle rows + subsystem doc + this note → implemented | Loops exist, are durable, and are human/model-editable; nothing auto-runs. |
| 1 — Same-session driver | `loop-round-driver` (same-session mode): reservation/flush/fence, refresh prompt, budget settlement (iterations + wall-clock), cadence, recovery, unit + snapshot tests | An armed loop keeps working in its session across restarts until complete/block/cap. |
| 2 — Fresh-agent + evaluator | Fresh-agent mode (subagent seam, report fold), token settlement via telemetry, evaluator-backed completion | Multi-day, context-bounded runs with verified completion. |
| 3 — Governance + UI | Checkpoints (interaction plane), staleness policy + `stale-task` auto-block, `ui-loop` panel + Chat iteration nodes, user guide + website | Governed, reviewable loops in the web product. |
| 4 — Consolidation (decision PR) | Rebuild `goal-round-driver` on `ctx.loops` (goal = a loop preset: same-session, iteration cap, no budget) or document permanent coexistence; complete TS/Python SDK loop surface; retire per pre-release stance what consolidation obsoletes | One loop engine; goal's surface preserved or folded. |

## Alternatives considered

- **Extend `goal` into the loop domain.** Goal's contract is one objective, four phases, round-cap-only budget, same-session continuation. Layering multi-loop, budgets, a task kernel, checkpoints, evaluators, and a second execution mode onto `GoalService` would make every goal mutation pay for governance most goals never use, and fork/revision semantics would entangle two lifecycles in one event. The pre-release stance prefers the correct foundation: a separate `loop` group now, consolidation at Phase 4 when the engine is proven.
- **Build on `ralph`/`workflow` (a fixed script per loop).** Workflow scripts are per-run, in-memory, and model-authored; a durable engine's state must live in the session log, and its continuation is idle-driven across restarts — the job the goal-round-driver pattern owns. A per-loop script would re-implement reservation, fencing, and recovery inside the worker thread and lose the session's durability and invariants.
- **Adopt an external durable-execution orchestrator (Temporal-class).** The workflow world's answer to durable long-running state machines is an event-sourced orchestrator with replay. dsh's session log *is* that event history for in-process agents: adding an external engine would introduce a second source of truth beside the log the product already declares authoritative, an out-of-process dependency for what is a per-session concern, and a wire protocol for every iteration fact. The durable-execution lineage informs the design (replay-to-recover, settlement as the durable fact) without being adopted as infrastructure.
- **Wrap a community goal-mode plugin (the [claude-goal](https://github.com/Potarix/claude-goal)/[claude-code-goal](https://github.com/balakumardev/claude-code-goal) pattern).** Those ports prove demand for Codex-style `/goal` semantics, but they live in the harness's own file and state model (markdown goal files, in-session prompts). In dsh the equivalent must be durable session state with CAS, invariants, and projection — a domain package, not a prompt wrapper; and the governance half (budgets, verification, checkpoints) has no community precedent to wrap.
- **Adopt LoopX itself (external control plane, git-backed state).** LoopX is agent-loop-agnostic *by design* — it cannot see dsh's session log, so its state kernel would be a second source of truth alongside the one dsh declares authoritative, and every model-visible loop fact would violate `model-visible ⟺ logged`. Its `dsh_goal_mode` adapter drives dsh's existing goal mode from outside; this proposal internalizes what that adapter reaches for. Runtime-dependency cost (Python process, file store, sync) is not worth it when the design transfers natively.
- **Extend the experimental agent-team domain.** Teams are multi-session (roster, mailbox, lead/teammate roles) and private opt-in; a loop is a single-session, single-owner engine. Borrowing the task snapshot shape is enough; inheriting the team's identity, authority, and mailbox machinery would be the wrong grain.
- **One loop per session (mirror goal).** LoopX runs many parallel loops. dsh's driver is idle-driven per session, so N armed loops would race for one inbox. v1 allows many *named* loops but arms exactly one; multi-arm concurrency (e.g., via subagent-backed loops) is a clean extension once the kernel is durable.
- **Loop state in the storage hub or a SQLite store.** Non-session storage and `dsh-session-query` are read-side or auxiliary; the loop is model-visible conversation state. The session log is the only store that satisfies replay, fork semantics, and the model-visible invariant.

## Acceptance criteria

- A loop created via tool or `/loop` survives restart, resume, and fork: its snapshot, task board, budget ledger, and iteration history replay identically, and the invariant companion accepts the log (and rejects each corrupted variant the tests construct).
- The same-session driver continues an armed loop — reserving, flushing, refreshing, fencing — until the loop completes, blocks, exhausts a cap, or is cleared; only admitted `loop`-sourced turns consume the iteration budget, and human input always yields automatic work.
- The fresh-agent mode runs one fresh child per iteration with the state-refresh prompt; the parent conversation carries only the original call and bounded settled reports; child failure settles `error` and blocks with the last report retained.
- Budget exhaustion durably blocks the loop with a stable code; raising the cap via `loop_update` + human `resume` continues it at the next cadence point.
- A triggered checkpoint suspends all admission until the human answers through the interaction plane; `approve` / `redirect` / `abort` each produce the correct durable transition.
- With `verification` set, a `complete` report is accepted only after the command path exits 0 or the evaluator path returns `accept`; a bounded number of failures blocks with `verification-failed`.
- With the evaluator enabled, a false `complete` report is rejected and drives a continuation iteration; a bounded number of rejections blocks with `review-rejected`.
- With `maxNoProgressIterations` set, N consecutive progress-free iterations block the loop with `stall`, and the loop resumes from the next cadence point once the task board moves again after a human `resume`.
- Session resume and fork leave every loop disarmed until an explicit human-authorized resume; an expired durable `waitUntil` re-fires exactly once after resume.
- The keyless snapshot example (create → two iterations → verified complete) records and replays a real transcript; TypeScript and Python SDK expected outputs include the loop events.
- All repository gates pass for the change: `test:coverage`, `typecheck`, `lint`, `build`, `hygiene`, `doc-sync`, `test:snapshot`.

## Risks

- **Overlap sprawl with goal/ralph** — the boundary table above is the control; Phase 4 must make the consolidation decision explicit (pre-release stance favors folding goal's driver onto loop once the engine is proven) rather than letting three long-horizon primitives drift.
- **Driver races** — the reservation/flush/fence machinery is the goal-round-driver's proven pattern, but fresh-agent mode adds child-lifecycle races (cancel during spawn, unload with an in-flight child, structured-report rejection). Mitigation: the full race matrix in the test plan, fail-closed teardown, and bounded settlement everywhere.
- **Token budget accounting is only as good as telemetry** — with telemetry off, token caps have no data. Mitigation: the token cap is opt-in config; iteration and wall-clock caps are always enforceable; the `settle.tokensFromTelemetry` config names the dependency explicitly.
- **Evaluator cost and gaming** — an evaluator pass doubles per-completion cost, and a self-reporting worker can shape its evidence. Mitigation: evaluator off by default, bounded passes, fresh-agent evaluator by default (no shared context with the worker), and `review-rejected` rather than silent pass-through on exhaustion.
- **Verification commands run inside the agent's authority** — a `command` verification executes through the loop's normal tool and permission policy, so a careless spec could spend real side effects. Mitigation: the command runs under the loop's existing sandbox and approval policy (no bypass), `maxPasses` bounds repeated spending, and the spec is human- or model-authored under the same authority rules as any `loop_create`.
- **Two task lists (loop task board vs the `todo_write` tool)** — the board is loop-scoped durable state; the todo tool remains the general per-session scratch list. The guidance text tells the model which to use when; if usage blurs in practice, Phase 3 revisits the surface (possibly unifying the model-facing tools).
- **Prompt surface growth** — the state-refresh block grows with the task board. Mitigation: bounded task count and report sizes (config), read-only projection with staleness flags instead of full history, and compaction as the existing context-pressure relief.
- **Scope** — five phases is large. Each phase is independently shippable and useful (Phase 0 already gives durable, governed loop state with zero automation), so the program can stop cleanly at any phase boundary.

## Related

- [LoopX](https://github.com/huangruiteng/loopx) — the reference control plane (state kernel, state refresh, todo freshness, quota settlement, interaction patterns, per-harness goal-mode adapters including `dsh_goal_mode`).
- [Loop engineering catalog (AgentPatterns.ai)](https://www.agentpatterns.ai/loop-engineering/) — the three loops of agentic coding, stacking outer loops, the Ralph Wiggum fresh-context loop, convergence detection, and the loop Go/No-Go cost gate.
- [Codex goal mode](https://developers.openai.com/codex/use-cases/follow-goals) — [use case](https://developers.openai.com/codex/use-cases/follow-goals) + [cookbook](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex); the six-field goal template with [verification commands and stop conditions](https://www.ai-primer.com/engineer/stories/codex-goal-six-element-template).
- [Claude Code goal mode](https://code.claude.com/docs/en/goal) — "Keep Claude working toward a goal"; the community ports that preceded it ([claude-goal](https://github.com/Potarix/claude-goal), [claude-code-goal](https://github.com/balakumardev/claude-code-goal)).
- [claude-code-goal-loop](https://github.com/gyujeongion/claude-code-goal-loop) — verified-step goal loop with rollback snapshots and a stuck-handler.
- [Durable agents with Temporal](https://temporal.io/blog/building-durable-agents-with-temporal-and-ai-sdk-by-vercel) — the event-history-as-source-of-truth lineage the session log already occupies.
- The dsh ecosystem — [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI), [dsh-gungnir](https://www.npmjs.com/package/dsh-gungnir), and LoopX's `dsh_goal_mode` adapter: the third-party surface the loop domain serves.
- [Goal subsystem)](../../../../docs/subsystems/goal.md) and [same-session goal-round-driver)](../../implemented/feature/2026-07-19-same-session-goal-round-driver.md) — the durability, reservation, and fence patterns this design extends.
- [Ralph tool)](../../implemented/feature/2026-07-19-fresh-agent-ralph-workflow-tool.md) — the fresh-agent report vocabulary and its deferred evaluator/budget work, which the loop engine takes over.
- [Agent Teams)](../../implemented/feature/2026-08-05-agent-teams.md) — the task-snapshot and full-snapshot-event precedent.
- [Session projection mandatory seam)](../../implemented/architecture/2026-08-19-session-projection-mandatory-seam.md) — the `loops` projection registration pattern.
- [Session log version mechanism)](../../implemented/architecture/2026-08-10-session-log-version-mechanism.md) — why additive event kinds need no format bump.
