# DSH Coding Capability Execution Plan

English | [中文](coding-capability-roadmap.zh.md)

This reference defines the execution plan for improving DeepSeek Harness (dsh) as a coding agent. It covers product capabilities, runtime reliability, assembled application behavior, and the quality gates that prove them. It does not replace package READMEs, subsystem references, architecture documentation, or the testing policy.

## 1. Goal and scope

The target workflow is a recoverable loop: discover a project, understand code precisely, make a bounded change, run the relevant check, parse failures into locations, repair the change, rerun the check, and prepare a reviewable Git result.

The plan covers the Host and Client packages that provide file tools, search, LSP, shells, terminals, tasks, Git, Code Mode, subagents, MCP, session persistence, context discovery, presets, and product entry points. It also covers TypeScript and Python SDK projections where a behavior is user-visible in both SDKs.

The plan does not make the agent autonomous by bypassing approval, remove sandbox restrictions, treat worker threads as a security boundary, or promise support for every language and debugger in the first release. Each new capability must remain optional, fail loud when its prerequisites are unavailable, and preserve the model-visible-equals-logged rule.

The implementation order is capability-oriented rather than package-count-oriented. A phase is complete only when its provider, service definition, consumer, assembled example, documentation, and relevant replay or live checks are complete.

## 2. Baseline

The current coding roster already includes file read/write/edit tools, multi-file editing, string replacement, directory listing, glob and grep search, LSP navigation and diagnostics, shell and PowerShell execution, persistent terminal sessions, background jobs, task discovery and execution, structured Git actions, Code Mode, subagents, workflows, skills, and MCP tool bridging. The owning contracts are linked from the [filesystem tools](../packages/fs/tool-fs/README.md), [search tools](../packages/fs/tool-fs-search/README.md), [LSP tool](../packages/lsp/tool-lsp/README.md), [task tool](../packages/shell/tool-tasks/README.md), [Git tool](../packages/shell/tool-git/README.md), [Code Mode](../packages/core/tools/README.md), and [MCP client](../packages/mcp/mcp-client/README.md) documentation.

LSP already supports definition, references, implementation, hover, document symbols, workspace symbols, diagnostics, rename, formatting, and incoming or outgoing call hierarchy. Rename already has a host-apply path with version guards and rollback, which seeds the transaction design in Phase 2. The next LSP work is therefore an application and refactoring transaction, not a first navigation implementation.

The current task path can discover package scripts and execute them, but its failure result is primarily bounded command output. Git has useful safety controls, but several results remain text-oriented and some argument handling is stricter than valid Git path and pathspec syntax. Code Mode can batch visible tool calls, but intermediate binding values have no independent result budget.

The quality system has strong package coverage, keyless snapshots, built-asset checks, and opt-in real-API tests. Coverage ownership is incomplete for some assembled overlays and entry points, including parts of web-schedule, web-cordis, MCP memory behavior, JSON-RPC with-key behavior, and Python SDK parity. The [testing policy](testing.md) and [development guide](development.md) remain the authority for existing checks. Section 3 records the known gaps behind this baseline with their evidence and owning phase.

## 3. Known gap inventory

Each row names one known gap, the evidence that records it today, the phase that owns closing it, and its priority under the model in section 6. The Phase 0 review triages this table: rows may be split into issues, re-scoped to another phase, or retired when the evidence no longer holds, and every such decision edits this table instead of leaving it to drift.

| Area | Known gap | Evidence | Phase | Priority |
| --- | --- | --- | --- | --- |
| Documentation | LSP operation lists and tool descriptions state four operations while the seam exposes eleven, and the `docs/subsystems/lsp.md` type-equiv blocks drifted with them | `packages/lsp/lsp/src/types.ts`, `packages/lsp/tool-lsp/src/index.ts`, `packages/lsp/tool-lsp/README.md`, `docs/subsystems/lsp.md` | 0 | P0 |
| Documentation | The task tool README claims workspace-root-only execution while the implementation discovers nested workspaces | `packages/shell/tool-tasks/README.md`, `packages/shell/tool-tasks/src/index.ts` | 0 | P0 |
| Documentation | The root README describes sandbox enforcement as Linux-only while bwrap/Landlock, Seatbelt, and Windows ACL backends ship | `README.md`, `packages/sandbox/sandbox-local/README.md` | 0 | P0 |
| Documentation | Multiple package README pairs sit out of sync with their recorded translation state, and `packages/mcp/mcp-servers/README.zh.md` carries two broken anchors | `packages/*/README.i18n.yaml`, `packages/mcp/mcp-servers/README.zh.md` | 0 | P1 |
| Coverage | No gate maps runnable examples to keyless, with-key, snapshot, and built-smoke evidence, and several overlays lack an assembled replay owner | `scripts/run-gates.ts`, `docs/testing.md` | 0 | P1 |
| Tools | Task execution returns a bounded output tail with no first-class `check` workflow: no adapter detection, structured diagnostics, filters, or rerun-failed | `packages/shell/tool-tasks`, `packages/core/tools` | 1 | P0 |
| Tools | There is no first-class read-only `review` workflow that returns prioritized findings with locations and related tests | `packages/shell/tool-git`, `packages/core/tools` | 1 | P0 |
| Tools | No debugger capability exists; runtime state must be inferred from logs through shells and PTYs | — | 7 | P1 |
| Tools | LSP lacks code actions, organize imports, prepare rename, type definition, and atomic multi-file application beyond rename | `packages/lsp/lsp`, `packages/lsp/tool-lsp` | 2 | P1 |
| Tools | Canonical results do not expose a common verified follow-up action vocabulary for read, LSP, edit preview, rerun, and review | `packages/core/tools`, `packages/fs`, `packages/lsp` | 2 | P1 |
| Tools | Tool presentation does not yet route a stage-specific high-level catalog for exploration, modification, verification, and delivery | `packages/core/tools`, `packages/core/agent-tool-presentation` | 2 | P1 |
| Tools | Git composes shell command strings, rejects valid spaces and wildcards, returns text-oriented diff and log results, and lacks merge, rebase, cherry-pick, blame, and conflict workflows | `packages/shell/tool-git`, `packages/subprocess` | 3 | P1 |
| Delivery | Git has no branch, checkpoint, change-set, or pull-request object with structured review and rollback state | `packages/shell/tool-git`, `packages/host` | 3 | P1 |
| Tools | No project, dependency, or workspace-graph inspection capability | — | 4 | P1 |
| Tools | Search lacks offset pagination, context lines, case modes, and structured locations; no shared workspace index distinguishes generated or vendored trees | `packages/fs/tool-fs-search` | 4 | P2 |
| Runtime | The agent loop has no built-in step, wall-time, or tool-call budget | `packages/core/agent-loop` | 5 | P0 |
| Runtime | Code Mode binding values have no per-binding or aggregate byte budget and are fully snapshotted in memory | `packages/code-runtime` | 5 | P0 |
| Runtime | Instruction discovery drifts project root, treats provider failure as absence, and lacks an aggregate source budget | `packages/context/agent-instructions` | 5 | P1 |
| Runtime | Tool input rewrite is not transactional; policy hooks can only allow, deny, or ask | `packages/core/tools` | 5 | P1 |
| Runtime | Jobs and sessions lack a unified user-facing resume, retry, wait, and handoff entry | `packages/shell/tool-bash`, `packages/jobs`, `packages/session` | 5 | P1 |
| Runtime | Background jobs have no executor-level timeout or owned process-tree cleanup | `packages/shell/tool-bash` | 5 | P2 |
| Runtime | Session JSONL reads scan from sequence zero without checkpoints | `packages/session/session-persistence-jsonl` | 5 | P2 |
| Runtime | LSP stdio uses transient document opens and serializes queries per workspace | `packages/lsp/lsp-stdio` | 5 | P2 |
| Runtime | In-memory session retention grows with raw events even after compaction | `packages/core/session` | 5 | P2 |
| Product UX | Configuration layering is opaque; no command explains final values, sources, or overrides | `apps/cli` | 6 | P2 |
| Product UX | Plugin, preset, and skill health has no user-facing diagnosis; inventory lacks provenance and failure history | `apps/cli`, `packages/host/plugin-inventory`, `packages/skill/skill-filesystem` | 6 | P2 |
| Product UX | Telemetry mode, redaction, and delivery have no status, preview, or test command | `packages/session/session-telemetry` | 6 | P2 |
| Product UX | Approval is one-shot without persistent rules, action context, or request timeouts | `packages/interaction/user-approval`, `packages/interaction/tool-ask-user` | 6 | P1 |
| Product UX | The published site lacks CLI, profile, plugin, troubleshooting, and platform pages; unmapped links escape to GitHub source | `website/docs.ts`, `scripts/project-doc-site.ts` | 6 | P2 |
| Ecosystem | MCP bridges tools only; Resources and Prompts are deferred and HTTP failures retry per call without a supervisor | `packages/mcp/mcp-client` | 8 | P3 |
| Ecosystem | Terminal lacks resize, named keys, EOF, read-until-prompt, and TUI interaction | `packages/terminal/tool-terminal` | 8 | P2 |
| Ecosystem | Code Runtime has no process or container backend, streaming progress, or orphan-process cleanup | `packages/code-runtime` | 8 | P3 |
| Multi-agent | Subagent reports have no durable mailbox, ACP children lack replay fixtures, continuable fork is disabled by prefix drift, and declarative agent rows expose no persona or tool-presentation fields | `packages/subagent`, `packages/core/agent-loop` | 8 | P2 |

## 4. Market benchmark and gap translation

This benchmark was collected on 2026-08-31 from official product documentation for [Claude Code](https://code.claude.com/docs/en/overview), [Claude Code permissions](https://docs.anthropic.com/en/docs/claude-code/permissions), [OpenAI Codex CLI](https://learn.chatgpt.com/docs/codex/cli), [Cursor](https://cursor.com/docs), [GitHub Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent), and [Aider usage](https://aider.chat/docs/usage.html). It records publicly documented workflows, not an exhaustive product benchmark or a claim that every feature is available on every plan. Re-verify the linked sources and every row at each minor release or quarter, whichever comes first; a stale link or changed product capability edits this section instead of aging in place.

| Capability | Mature product baseline | dsh status | Implementation priority |
| --- | --- | --- | --- |
| Local coding loop | Inspect, edit, execute, and continue in one terminal or IDE session | Already present through file tools, shells, tasks, terminal, session, and Code Mode | — |
| Automatic validation | Run lint, test, and build after edits and feed failures back into the agent | Partial: task execution returns bounded output but lacks common diagnostics and rerun tokens | P0 |
| Code review | Dedicated read-only review of working tree, commit, branch, or pull request with prioritized findings | Missing as a first-class tool; Git diff is the main primitive | P0 |
| Semantic refactoring | Rename, code actions, organize imports, prepare rename, and safe multi-file application | Partial: LSP navigation, diagnostics, rename, formatting, and call hierarchy exist; transaction and code actions remain incomplete | P1 |
| Debugging | Dedicated Debug or DAP workflow for breakpoints, stack frames, variables, and stepping | Missing; debugging relies on shell, terminal, and log inspection | P1 |
| Repository context | Repo map, persistent instructions, rules, memories, and relevant-file selection | Partial: instructions, search, LSP, presets, and session persistence exist without one project map | P1 |
| Tool routing | High-level modes such as explore, modify, verify, review, and deliver hide irrelevant low-level tools | Partial: presentation and Code Mode exist, but catalog routing is not stage-aware | P1 |
| Permissions | Parameter-aware rules, session/project persistence, risk explanations, and scoped approvals | Partial: sandbox and approval are strong, but rules and action explanations are less productized | P1 |
| Parallel and remote work | Subagents, background jobs, resumable sessions, cloud or ephemeral environments, and PR handoff | Partial: subagents, jobs, workflows, ACP, and Web exist; durable resume and change-set delivery are incomplete | P1 |
| Extension ecosystem | Skills, hooks, plugins, MCP, IDE integrations, CI, and external work trackers | Strong locally: plugins, skills, hooks, MCP tools, Web, ACP, and SDKs exist; MCP Resources/Prompts remain deferred | P2–P3 |

A dash in the priority column means the capability already meets the documented baseline and needs only maintenance; P0 through P3 carry the section 6 meanings.

The market comparison changes the optimization target. dsh does not need to copy every IDE or cloud feature before it can compete on coding quality; it needs to turn its existing low-level capabilities into reliable high-level workflows with structured results, explicit recovery, and replayable evidence.

### Competitive position and non-goals

dsh's strongest differentiators are the Cordis plugin architecture, complete capability-seam ownership, durable session events, keyless replay, platform-aware sandboxing, approval integration, and typed Code Mode dispatch. These foundations make it suitable for self-hosted and auditable deployments where a tool call must be explainable and recoverable.

The first implementation wave does not require a full IDE, cloud execution, voice input, or every third-party tracker. It also does not weaken approval, sandboxing, session logging, or provider isolation to match a product's convenience mode. Cloud and IDE integrations remain independent providers over the same service contracts.

## 5. Success measures

The first measurement pass should record a baseline before Phase 1 changes the task and diagnostic paths. Use representative TypeScript, Python, and monorepo tasks with the same prompt, workspace, model settings, and time budget. Store aggregate metrics rather than user source content.

| Measure | Baseline method | Phase 1 target | Long-term target |
| --- | --- | --- | --- |
| Task completion rate | Replay a fixed task corpus and count tasks reaching the requested checked result | Improve by 15% without increasing approval bypasses | Improve by 30% across supported project types |
| Failure localization time | Measure from first failing check result to first tool call on the owning file and location | Reduce median time by 40% | Keep median under two repair turns |
| First repair pass rate | Count failures fixed by the first diagnosis-guided edit and rerun | Reach 60% for TypeScript and ESLint fixtures | Reach 75% for supported adapters |
| Repeated tool-call rate | Count identical or semantically duplicate calls within one turn | Reduce by 20% | Reduce by 40% without reducing exploration quality |
| Long-session resource use | Record peak RSS, event-log read time, and p95 tool latency on a long fixture | Establish ceilings and alerts | Stay within configured ceilings for the reference workload |
| Cross-entry consistency | Compare normalized headless, ACP, Web, and SDK observations for shared scenarios | Every declared scenario has an owner | Shared scenarios match across all supported entry points |
| Example coverage completeness | Inventory runnable examples and map keyless, with-key, snapshot, and built-smoke evidence | No unexplained missing row | CI rejects a new uncovered runnable example |

A metric is not a release gate until its fixture, normalization, owner, and acceptable variance are recorded. Do not use model token count or raw transcript length as a proxy for coding quality.

## 6. Priority model

Prioritize work by user impact, dependency value, implementation cost, and failure risk. P0 work prevents uncontrolled behavior or makes the core loop trustworthy. P1 work directly improves diagnosis, safe editing, or project understanding. P2 work improves scale, platform ergonomics, or operational recovery. P3 work expands protocol breadth or supports advanced workflows after the core contracts are stable.

The governing rule is reliable closure before tool count. A new tool is lower priority than a structured result, a safe follow-up action, or a replay that proves an existing tool can be used correctly.

Every phase must identify its durable data changes before coding starts. Changes to session events, tool schemas, public service methods, or SDK projections require the corresponding type, documentation, replay, and compatibility work in the same change. Section 3 applies this model to each known gap and records the resulting phase assignment.

## 7. Phased roadmap

Durations are planning estimates; the definition of done, not the calendar, gates completion.

### Phase 0: Baseline, contract consistency, and coverage inventory, 1 week

**Objective:** remove known contract drift, publish the platform matrix, and create the inventory that prevents untested product compositions.

**Ownership:** `packages/lsp`, `packages/shell/tool-tasks`, `docs`, `scripts/run-gates.ts`, `examples`, `website`.

**Deliverables:** correct the LSP operation list and descriptions in `packages/lsp/lsp/src/types.ts`, `packages/lsp/tool-lsp/src/index.ts`, and the owning READMEs; regenerate the `docs/subsystems/lsp.md` and `docs/subsystems/lsp.zh.md` type-equiv blocks from the corrected source and re-record the pair; correct the nested-workspace description in `packages/shell/tool-tasks/README.md`; replace the Linux-only sandbox claim in the root README with the platform matrix covering bwrap/Landlock, Seatbelt, and Windows ACL including partial enforcement; restore the recorded pairing state of the out-of-sync package README pairs and repair the two broken anchors in `packages/mcp/mcp-servers/README.zh.md`; add the example coverage manifest or generated inventory; triage the section 3 inventory into issues; record Phase 0 metric baselines.

**Tests and evidence:** run scoped documentation and link checks; add a keyless inventory test that fails on an unexplained runnable example; add built CLI smoke coverage for any newly declared entry path; verify that the inventory distinguishes configuration-only overlays from runnable product examples.

**Acceptance:** every LSP operation has one authoritative operation list and matching model-facing description; every runnable example has an explicit keyless and with-key status; no platform README contradicts a shipped backend; the corpus-wide translation-pairing check passes; the baseline report is reproducible from a checked-in command.

**Rollback:** revert only the documentation and inventory changes; do not disable existing product tests to make the inventory green.

**Definition of done:** source and docs agree, inventory CI is required in the appropriate lanes, and the first phase review has an owner for every inventory row.

### Phase 1: Structured test and build diagnostics, 2-4 weeks

**Objective:** turn command failures into actionable, location-aware results that can drive the next read, LSP query, edit, and rerun.

**Ownership:** start in `packages/shell/tool-tasks` with shared diagnostic types in the owning task or diagnostics package; integrate with `packages/fs`, `packages/lsp`, `packages/core/tools`, and the headless and CLI examples.

**Deliverables:** define a versioned diagnostic result with source, severity, file, line, column, code, test name, message, optional stack, raw output reference, and verified follow-up actions; add a first-class `check` tool with `test`, `build_check`, and `lint_check` kinds; detect and report the selected adapter; retain bounded raw output as evidence through the existing spill mechanism; implement parsers for TypeScript, ESLint, Vitest/Jest, and one Python adapter; support test filters and rerun-failed requests (watch mode is out of scope for the first version because a long-running watch conflicts with bounded tool-call execution); expose stable `read`, `lsp`, `edit-preview`, `rerun`, and `review` actions; add a first-class read-only `review` tool scoped to working-tree diffs in this phase, with commit, base-branch, and pull-request modes activating after Phase 3 lands structured Git and the change-set consumer, returning prioritized findings, locations, suggested fixes, and related tests; keep the raw combined output available when no parser matches.

**Configuration:** make parser selection, output limits, execution timeout, and workspace selection explicit resolved configuration. Do not infer a package manager or test runner inside an execution method without reporting the selected adapter. A `check` run executes project-defined commands and inherits the task execution path's sandbox and approval semantics; wider access escalates through the same per-call sandbox flow as `bash`, with the required justification.

**Tests and snapshots:** add parser unit tests for valid, malformed, truncated, and mixed output; add real Loader integration tests; add a headless keyless snapshot for failure-to-repair-to-rerun; add with-key smoke coverage for one real model path; add built CLI acceptance for the published task entry.

**Acceptance:** a supported failing check returns at least one precise diagnostic when the tool output contains a location; a malformed or unsupported format remains visible as raw output with an explicit parse warning; the model can use a returned action to read or query LSP without reconstructing a command string; rerun-failed selects only the recorded failed tests; `review` is read-only, ranks findings deterministically, and points every actionable finding to a file location or explicitly records that no location exists.

**Rollback:** retain the existing task execution path behind the same tool action if a parser fails; never discard raw output when structured parsing is unavailable.

**Definition of done:** the reference fixtures complete a repair loop with no manual log scraping, and the result schema is documented and pinned by keyless replay.

### Phase 2: Workspace edit transaction and semantic refactoring, 3-5 weeks

**Objective:** make LSP-generated changes previewable, version-checked, approval-aware, atomic, and recoverable.

**Ownership:** extend `packages/lsp/lsp` and `packages/lsp/tool-lsp`; extract the reusable application logic beside the existing rename host-apply path; coordinate with `packages/fs`, approval, session logging, and SDK projections.

**Deliverables:** define a workspace-edit transaction containing target versions, normalized edits, preview text, approval context, applied files, and rollback status; add `prepareRename`, `codeAction`, `organizeImports`, `typeDefinition`, and the highest-value provider capability available in the fixture servers; support preview and host-side apply for safe operations; define a common verified follow-up action vocabulary for `read`, `lsp`, `edit-preview`, `rerun`, and `review`, with actions derived from canonical results and rendered by registry/presentation; add stage-aware tool catalog routing for exploration, modification, verification, and delivery while retaining low-level tools as explicit fallback; keep provider protocol details out of the model-facing schema; reuse the fs observation and version-guard mechanisms the rename path already uses. The follow-up action vocabulary and stage-aware catalog are independent contracts with their own PR and may land in either order relative to the transaction.

**Configuration:** expose result limits, transaction timeout, approval policy, and conflict behavior as validated configuration. A transaction must either apply all accepted edits or report exactly which files were not applied and why.

**Tests and snapshots:** cover overlapping edits, stale versions, missing files, cancellation, mid-batch failure, rollback, empty plans, provider capability absence, malformed follow-up actions, and unavailable stage-specific tools; add assembled snapshots for rename, code action, organize imports, and the exploration-to-verify-to-deliver catalog transition; measure schema tokens and wrong-tool selections on the fixed task corpus; add TypeScript and Python SDK projections wherever the event or result is model-visible.

**Acceptance:** a user can inspect the complete plan before application; an external file change prevents unsafe application; a failed transaction leaves the workspace in its pre-transaction state or reports a verified recovery path; the session log reconstructs the plan and outcome.

**Rollback:** keep plan-only mode as the fallback for providers or deployments without host apply; disable individual operation adapters without removing the transaction contract.

**Definition of done:** at least two semantic refactoring scenarios pass through preview, approval, apply, and replay with no hand-written file-edit conversion in the scenario.

### Phase 3: Structured Git and conflict workflows, 2-4 weeks

**Objective:** make repository inspection and history-changing operations precise, composable, and safe on valid paths.

**Ownership:** `packages/shell/tool-git`, `packages/subprocess`, approval, session logging, and Git-focused examples.

**Deliverables:** add an argv-based subprocess execution method; migrate every Git action to argv so valid spaces and wildcards stop being rejected as metacharacters; return structured status, diff files, hunks, ranges, conflicts, and blame rows while retaining bounded textual evidence; add branch and checkpoint state with change-set identifiers; add preview and explicit state transitions for merge, rebase, and cherry-pick; add continue and abort; add worktree and range-diff where the repository fixture supports them; define a `pull_request` consumer provider interface for create, update, review, and close without making GitHub or GitLab a core service dependency; return branch, commit, files, conflicts, next actions, and rollback references for every mutation. Change-set and checkpoint records are new durable objects: register them in the persistence catalog and evaluate the `SESSION_FORMAT_VERSION` impact in the same change.

**Configuration:** validate the Git executable, workspace root, output limits, and destructive-action policy at load or request resolution. Pathspecs and filenames must be values, not shell fragments.

**Tests and snapshots:** cover spaces, Unicode, wildcard pathspecs, empty repositories, detached HEAD, conflicts, cancellation, and partial failure; add keyless assembled snapshots for structured diff and conflict resolution; use with-key tests only for model/provider behavior, not as a substitute for Git semantics.

**Acceptance:** valid paths with spaces and wildcard pathspecs work; destructive actions require the configured approval; conflict state identifies files and next legal actions; continue and abort are idempotent for the same repository state; each mutation returns a reviewable change-set state and rollback reference; the pull-request provider can be disabled without affecting local Git; no Git action relies on shell metacharacter rejection as its primary safety mechanism.

**Rollback:** keep the existing read-only actions available if a write workflow is disabled; abort an in-progress Git state before removing its action adapter.

**Definition of done:** a fixture can inspect a diff, enter a conflict, report the conflict, and either continue or abort using structured results only.

### Phase 4: Project, dependency, and workspace understanding, 3-4 weeks

**Objective:** let the agent understand project topology, dependency impact, and workspace structure before changing files or installing packages.

**Ownership:** add a project inspection package under the filesystem or workspace group, then add a dependency tool consumer; integrate with workspace discovery, task adapters, approval, and the model prompt.

**Deliverables:** add `project_inspect`, `workspace_map`, and `dependency_graph` consumers; detect language, framework, package manager, workspace roots, lockfiles, scripts, compiler configuration, test/lint/build commands, and key entrypoints; implement dependency list, why, outdated, audit, and update-preview; return a graph summary and the exact files that an update would modify; support npm/pnpm first and add other ecosystems only with owned fixtures; add a workspace index that records package roots, generated and vendored trees, ignored directories, symlink identity, and project configuration; extend search with offset pagination, context lines, case modes, and structured location results (P2: these may defer behind the P1 inspection deliverables); preserve the useful parts of repo-map and rules-based context selection without bypassing event replay.

**Configuration:** use an explicit adapter allowlist, network policy, registry configuration, timeout, and maximum graph size. Installation, update, audit network access, and lockfile writes must have separate approval context.

**Tests and snapshots:** add fixture repositories for single-package and workspace projects, malformed manifests, conflicting lockfiles, missing package managers, and offline mode; add assembled keyless snapshots for inspection and update preview; add with-key coverage only for provider-driven planning behavior.

**Acceptance:** inspection never writes files; update preview lists package, version, lockfile, and script impact; unsupported ecosystems return a clear capability result; a denied approval leaves the lockfile unchanged; search results carry structured locations that feed directly into `read` and `lsp`.

**Rollback:** remove only the new dependency consumer while preserving task execution; restore a lockfile from the transaction snapshot if an approved update fails after writing.

**Definition of done:** the agent can identify the correct project command and produce a reviewable dependency update plan without guessing from directory names.

### Phase 5: Runtime reliability and resource control, 3-4 weeks

**Objective:** bound cost and memory, make policy rewrites auditable, and preserve replay, audit, and user control.

**Ownership:** `packages/core/agent-loop`, `packages/core/tools`, Code Runtime, session persistence, context instructions, workspace registry, LSP stdio, and job tools.

**Deliverables:** add explicit `maxSteps`, `maxTurnWallMs`, and `maxToolCalls` (P0); add Code Mode per-binding and aggregate byte budgets with explicit errors (P0); add `job wait/status/resume/retry/cancel` and `session resume/handoff` entry points with handles recording owner, workspace, command, process state, output locator, exit state, retry count, related turn, and cleanup state (P1); freeze the instruction project root per agent identity and record explicit replacement when the project changes (P1); treat provider-unavailable instruction probes as tri-state instead of absence (P1); add an aggregate source budget to instruction discovery (P1); make tool input rewrite a transactional allow path that records original input, final input, reason, schema validation, presentation, and executed value together (P1); add executor-level background job timeout and owned process-tree cleanup (P2); add sparse JSONL checkpoints (P2); cache LSP open documents and use incremental changes where supported (P2); bound in-memory session retention with persistence-backed projection (P2). Job and session resume handles are durable objects: register them in the persistence catalog and evaluate the `SESSION_FORMAT_VERSION` impact in the same change.

**Configuration:** every budget and policy is a validated deployment configuration with a documented unit, enforcement point, cancellation result, and observability field. Defaults must be resolved before execution and recorded when they affect model-visible behavior.

**Tests and snapshots:** cover exact-boundary and over-limit cases, cancellation races, wake-after-abort, child-process cleanup, large bindings, JSONL truncation and recovery, root-marker failure, LSP server restart, resume after restart, retry deduplication, and rewrite-then-reject ordering; add long-fixture performance checks without making wall-clock thresholds flaky.

**Acceptance:** a bounded turn ends with a structured reason; Code Mode never silently truncates a binding; a timed-out job cannot leave an owned process tree; a job or session can resume after process restart with the same durable owner and state; a retry does not duplicate completed side effects; session cold reads use a checkpoint when available and recover after an invalid checkpoint; an instruction provider outage does not load an unrelated ancestor; an executed input always equals its logged and presented input.

**Rollback:** keep the old full-scan or uncached path as a recovery mode; disable sparse-index reads when validation fails; retain the last-good context and server state on transient provider failure; reject the rewritten call and keep the original call unexecuted when rewrite validation fails.

**Definition of done:** reference workloads stay within declared ceilings, and every new limit or rewrite path has a replay proving both the enforcement and the recovery behavior.

### Phase 6: Product operability, approval, and platform surface, 2-3 weeks

**Objective:** make configuration, plugin health, telemetry, and failure recovery observable and operable for users, and upgrade approval from one-shot grants to describable rules.

**Ownership:** `apps/cli`, `website`, `packages/host/plugin-inventory`, `packages/session/session-telemetry`, `packages/interaction/user-approval`, `packages/interaction/tool-ask-user`, and the owning packages of each diagnosed surface.

**Deliverables:** add `dsh --explain-config` showing each final value, its source layer, its overrider, and disable reasons; add `dsh plugin list/why/doctor` with bundle layer, entry phase, provenance, and last failure; add preset and skills doctor commands surfacing broken reasons, roots, and trust; add telemetry status, test, and export-preview commands with an explicit redaction policy; surface recovery state for patch-watcher failures, MCP reconnect budgets, and Code Mode orphans, including failure stage, last-good time, and retry actions; publish website pages for CLI and profiles, plugins, troubleshooting by symptom, platform support, and a capability matrix above generated catalogs; show the preset tool matrix during onboarding; add a plugin author template with Windows and PowerShell examples, manifest validation, runtime compatibility, native dependency, and supply-chain checks; extend approval requests with command, path, diff, and network-target context, persistent session or project rules with parameter matching, scope and expiry, revocation, approval comments, risk explanations, and request timeouts.

**Configuration:** every doctor and status command reads the same validated configuration as the surfaces it diagnoses and reports, never guesses. Approval rule storage needs explicit scope, expiry, and audit identity before it ships.

**Tests and snapshots:** test every doctor command against broken, drifted, and healthy fixtures so failure rendering is covered, not just success paths; add approval rule lifecycle snapshots; run website link and pairing checks for new pages; add with-key coverage only where a command touches provider state.

**Acceptance:** a user can answer why a plugin, preset, skill, or MCP server is not working without reading package READMEs; a failed patch update names its stage and next action; approval rules are visible, revocable, and audited; every new command has a keyless snapshot or documented reason it is interaction-only.

**Rollback:** ship each doctor and status command independently; disable approval rule persistence and fall back to one-shot grants without changing the approval request shape.

**Definition of done:** the common failure symptoms listed in the troubleshooting page each have a doctor or status command that diagnoses them and a tested recovery path.

### Phase 7: DAP debugger capability, 6-10 weeks

**Objective:** provide controlled interactive debugging for supported runtimes instead of forcing the agent to infer state from logs.

**Ownership:** add a debugger service definition and provider under a new `packages/debug` group; integrate with subprocess, sandbox, approval, jobs, terminal, session events, and tool presentation.

**Deliverables:** implement launch and attach, breakpoints, continue, step-in, step-over, step-out, stack frames, scopes, variables, evaluate, exception threads, and disconnect for one runtime first; define adapter capability discovery and a normalized result vocabulary; bind every debug process to an owner and cleanup path.

**Configuration:** declare adapter executable, workspace roots, launch policy, attach policy, network policy, timeout, frame and variable limits, and evaluate approval rules. Attach must be disabled by default unless the deployment explicitly permits it.

**Tests and snapshots:** use a fixture debug adapter or deterministic DAP server for protocol tests; add real process lifecycle tests for launch, crash, cancellation, and disconnect; add keyless assembled snapshots for the debug transcript; add platform-specific tests for supported launchers.

**Acceptance:** the model can stop at a breakpoint, inspect a frame and variable, evaluate an allowed expression, resume, and disconnect; a crashed or cancelled session reports a terminal state and cleans up owned processes; unsupported adapter capabilities are explicit rather than guessed.

**Rollback:** ship the provider disabled while keeping the service and schema loadable; turn off attach and evaluate independently if their approval or cleanup paths are not ready.

**Definition of done:** one language runtime has a complete launch-to-disconnect scenario with process cleanup and replayed session evidence.

### Phase 8: Ecosystem and multi-agent expansion, follow-up work

**Objective:** broaden interoperability and multi-agent reliability after the core coding loop and resource limits are stable.

**Ownership:** MCP Resources and Prompts, advanced PTY controls, Code Runtime process or container backend, subagent delivery and replay, declarative agent configuration, and TypeScript/Python SDK parity.

**Deliverables:** add resource and prompt discovery with authorization and invalidation; add terminal resize, named keys, EOF, and read-until-prompt; add process-level Code Runtime isolation and streaming; define durable report delivery with acknowledgement and deduplication; add ACP child replay fixtures and re-enable continuable fork where prefixes stay byte-identical; extend declarative agent rows with persona and tool-presentation fields; mirror shared scenarios in both SDKs; add LSP multi-root routing, provider health, and capability discovery after the single-workspace cache is stable.

**Acceptance:** each addition has a provider, consumer, lifecycle owner, failure state, assembled example, and compatibility evidence. No ecosystem feature becomes a hidden dependency of the standard coding preset.

**Rollback:** keep each addition behind an independent composition row and disable it without changing the core tool roster or session format.

**Definition of done:** an extension can be enabled, diagnosed, tested, and removed without changing unrelated coding behavior.

## 8. Cross-cutting design rules

- **Model-visible equals logged.** Any value sent to the model, including rewritten arguments, diagnostics, plans, approvals, and tool capability changes, must be reconstructable from session events.
- **Parameter rewriting is an auditable transaction.** If a hook or policy rewrites input, record the original input, final input, reason, schema validation, presentation, and executed value together; never execute an unlogged post-validation value.
- **Defaults are explicit.** Resolve request to specification before execution, record the resolved values when relevant, and fail at load when a self-contained configuration is invalid.
- **Arguments use argv or structured APIs.** Shell strings are for commands intentionally authored as shell programs; paths, package names, Git options, and adapter arguments are values.
- **Structured results precede presentation.** Keep machine fields stable and render bounded text as a pure projection of the final result.
- **Limits apply to complete results.** A cap must account for all fields, metadata, and truncation markers; overflow is an explicit result, not silent data loss.
- **Approval describes the action.** Show the command, paths, diff, network target, or attach target that will be affected, with scope, expiry, and audit identity.
- **Failure is diagnosable and recoverable.** Preserve last-good state where safe, expose the failing stage and next legal action, and avoid pretending transient unavailability means absence.
- **Platform behavior is a matrix.** Every executable capability declares supported platforms, prerequisites, partial enforcement, and an assembled test path.
- **Capability seams are complete.** A service definition, at least one provider, and a consumer are reviewed and tested together; registry disposal and lifecycle ownership are part of completion.

## 9. Test and release strategy

Use four evidence tiers: package unit and integration tests for local semantics; assembled keyless snapshots for deterministic product behavior; with-key e2e for provider and model behavior; built-artifact and platform smoke tests for published entry points. A passing package test cannot substitute for an assembled example when the user observes the assembled behavior.

Behavior ownership is recorded once in the section 15 test ownership matrix; this section owns only the evidence tiers and the inventory gate.

Add an example inventory gate that maps each runnable composition to its keyless test, with-key test, snapshot owner, and built entry smoke. The gate may exempt a configuration-only overlay, but the exemption must be explicit and checked. It must also fail when a test is discovered but all cases self-skip unexpectedly.

Operability commands from Phase 6 are tested against broken and drifted fixtures so their failure rendering is covered evidence, not prose. For every phase, run the smallest relevant checks first, then the required product checks. The final change report must name commands actually run, including `pnpm run doc-sync`, `pnpm run lint`, `git diff --check`, focused unit or integration tests, snapshots, built smokes, and real-API e2e when credentials and scope require them.

## 10. Risk register

| Risk | Trigger | Mitigation | Rollback point |
| --- | --- | --- | --- |
| Session event or SDK incompatibility | A model-visible field or lifecycle event changes | Version and document the event, update TypeScript and Python projections, add replay fixtures before enabling the consumer | Disable the consumer and retain the previous event reader |
| Audit mismatch after input rewrite | Executed arguments differ from logged or presented arguments | Perform rewrite, schema validation, logging, presentation, and execution in one ordered transaction | Reject the rewritten call and keep the original call unexecuted |
| Premature budget termination | A limit stops a valid long task | Use separate step, wall-time, tool-call, binding, and output reasons; expose continuation or retry state | Increase or disable the specific deployment budget |
| Workspace root drift | Project markers change during a session | Freeze root identity and record explicit replacement when the project changes | Reuse the last-good root and require a new session for replacement |
| Child-process leakage | Worker, task, terminal, or debugger cancellation leaves descendants | Own process groups, use supervisor cleanup, and test crash and cancellation paths | Kill the owned process tree and mark the run incomplete |
| Cross-platform semantic drift | Shell, path, sandbox, or debugger behavior differs by OS | Maintain a platform matrix, use native argv APIs, and run platform-owned smoke tests | Disable only the unsupported provider or composition row |
| Dependency supply-chain exposure | An update or install reaches the network or runs lifecycle scripts | Require explicit approval, show registry and lockfile diff, restrict adapters, and retain rollback data | Restore the lockfile and disable the update adapter |
| DAP lifecycle failure | Adapter crashes, hangs, or loses the debug process | Bound every request, own adapter and debug process lifetimes, and expose terminal cleanup state | Disable attach/evaluate or the full adapter while preserving read-only tools |
| Operational blindness | A plugin, MCP server, or patch update fails without a user-visible stage, cause, or recovery action | Doctor commands, recovery UX, and last-good visibility with tested failure rendering | Ship each doctor command and its fixtures independently |
| Dynamic catalog cache invalidation | A stage transition changes the visible tool set and breaks the request prefix | Gate transitions on explicit checkpoints, record the tool-set hash, and measure completion rate before tightening routing | Revert to the full static catalog |
| High-level and low-level tool competition | The model calls a low-level tool where the high-level workflow exists | Order the catalog toward high-level tools, teach the fallback in prompt guidance, and track wrong-tool selection on the fixed corpus | Hide the high-level tool or demote the routing |
| Untrusted check execution | A project test script runs hostile or networked code | `check` inherits the task sandbox and approval semantics; escalated modes require per-call justification | Disable check kinds per deployment |
| Snapshot maintenance cost | A broad fixture changes for unrelated reasons | Assign one owner per behavior, normalize nondeterminism narrowly, and keep protocol and product snapshots separate | Revert only the new scenario or move it to its owning entry |

## 11. Issue and PR decomposition

1. Create one Phase 0 documentation and inventory PR; do not mix runtime changes into it.
2. Create a `check` contract PR (shared diagnostics, schema, action vocabulary, raw-output locator), then parser/adapter PRs, then the assembled headless and CLI snapshot PR.
3. Create a `review` PR with read-only diff inputs, finding schema, severity ranking, locations, and snapshots; scope it to working-tree diffs until Phase 3 lands.
4. Create a workspace-edit transaction PR before adding individual LSP operations; each operation gets its own provider and scenario coverage.
5. Create the follow-up action and stage-aware catalog PR against registry, presentation, and system prompt; it is independent of the transaction PR and measures schema tokens and wrong-tool selection.
6. Create the subprocess argv PR before migrating Git; follow with structured read-only Git results, branch/checkpoint state, conflict workflows, and an independent pull-request consumer.
7. Create project inspection before dependency mutation; keep update preview separate from install or upgrade execution.
8. Create each reliability budget and the job/session resume handles as independently observable contracts; do not combine session indexing, LSP caching, and turn stopping into one unreviewable change.
9. Split operability into one PR per command family — explain-config, plugin doctors, telemetry status, website pages — without a shared runtime refactor.
10. Create the debugger service definition and deterministic adapter fixture before adding a real runtime provider.
11. Create SDK projection changes with their snapshots in the same PR as the shared event or result change.

Do not place debugger, Git mutation, diagnostic parsing, operability commands, and broad documentation rewrites in one PR. A PR is ready only when its owning README, JSDoc, tests, snapshots, and relevant Agent Note are updated; a standalone planning document does not replace a feature-specific Agent Note for a non-trivial implementation.

## 12. Immediate execution checklist

- [ ] Correct LSP operation descriptions in `packages/lsp/lsp/src/types.ts`, `packages/lsp/tool-lsp/src/index.ts`, and the owning READMEs; regenerate the `docs/subsystems/lsp.md` type-equiv blocks and re-record the pair.
- [ ] Correct the nested-workspace description in `packages/shell/tool-tasks/README.md` and verify the implementation/configuration contract.
- [ ] Add the platform support matrix to user-facing documentation, including Windows PowerShell and partial ACL enforcement.
- [ ] Restore the out-of-sync package README pairs and repair the broken anchors in `packages/mcp/mcp-servers/README.zh.md`.
- [ ] Add the example coverage inventory and make unexplained missing runnable coverage fail in the appropriate CI lane.
- [ ] Triage the section 3 inventory at the Phase 0 review and file one issue per kept row.
- [ ] Record the Phase 0 metric baseline with a fixed keyless fixture corpus.
- [ ] Define the structured diagnostic result and parser adapter interface.
- [ ] Implement TypeScript, ESLint, and Vitest/Jest diagnostics with raw-output preservation.
- [ ] Add one assembled failure-to-repair-to-rerun keyless snapshot and one with-key smoke.
- [ ] Run `pnpm run doc-sync`, `pnpm run lint`, `git diff --check`, focused diagnostics tests, the owning snapshot lane, and the relevant built smoke.
- [ ] Review the Phase 1 acceptance evidence before starting workspace-edit transactions.

## 13. Suggested package layout

| Capability | Suggested home | First consumer | First proof |
| --- | --- | --- | --- |
| Structured diagnostics | `packages/shell/tool-tasks` plus a shared diagnostics package if reuse is proven | `test` and `build_check` tools | Headless repair snapshot |
| Workspace edit transaction | `packages/lsp/tool-lsp` with reusable application helper | `lsp` apply operations | Rename and code-action snapshot |
| Structured Git | `packages/shell/tool-git` and `packages/subprocess` | `git` tool | Diff and conflict fixture |
| Project inspection | `packages/workspace` or `packages/fs` | `project_inspect` | Single-package and monorepo fixture |
| Dependency inspection | New `packages/workspace/tool-dependency` consumer | `dependency` tool | Lockfile preview snapshot |
| Reliability budgets | Existing owning packages | Existing tools and agent loop | Limit and recovery snapshots |
| Operability tooling | `apps/cli`, `website`, and each diagnosed owning package | `dsh --explain-config`, `dsh plugin doctor` | Doctor fixtures over broken compositions |
| Review workflow | New `packages/shell/tool-review` consumer over the Git seam | `review` tool | Working-tree review snapshot |
| Follow-up actions and stage catalog | `packages/core/tools` with `packages/core/agent-tool-presentation` | `check`, `review`, and apply operations | Stage-transition snapshot |
| Pull-request consumer | New `packages/vcs` group | `change_set` and `pull_request` tools | Local change-set fixture |
| Resume and handoff | `packages/jobs` and `packages/session` | `job` and `session` resume tools | Restart-recovery snapshot |
| Debugger | New `packages/debug` group | `debug` tool | Deterministic DAP fixture |

The suggested home is a starting ownership decision, not permission to split a capability seam prematurely. Keep shared types with the service that owns their semantics.

## 14. Example result fields

A structured diagnostic result should carry stable fields that are sufficient for follow-up without exposing parser-specific text as the primary API; section 15 embeds these records inside complete workflow responses, and this section owns the field-level contract:

```json
{
  "source": "typescript",
  "severity": "error",
  "file": "packages/example/src/index.ts",
  "line": 42,
  "column": 8,
  "code": "TS2322",
  "testName": null,
  "message": "Type 'string' is not assignable to type 'number'.",
  "stack": null,
  "rawOutputRef": "spill://diagnostics/abc123"
}
```

A workspace-edit transaction should make concurrency and recovery explicit:

```json
{
  "transactionId": "edit-01",
  "operation": "organizeImports",
  "files": [
    {
      "uri": "file:///workspace/src/index.ts",
      "expectedVersion": 17,
      "edits": [{ "start": { "line": 0, "character": 0 }, "end": { "line": 0, "character": 20 }, "newText": "import x from 'x'" }]
    }
  ],
  "approval": { "required": true, "scope": "workspace", "expiresAt": 0 },
  "status": "preview"
}
```

These examples are illustrative field contracts. The implementation must use the repository's branded identifiers, cancellation types, event envelopes, and schema conventions rather than copying unbranded strings into public TypeScript APIs.

## 15. Market-oriented implementation blueprint

The primary product increment is a small set of high-level workflows that compose existing services rather than bypassing them. Build these workflows in the order `project_inspect → check/review → edit/refactor → rerun → change-set`, while keeping the low-level tools available as explicit fallback and preserving every action in the session log.

### `check` workflow

`check` is the first consumer of structured task diagnostics. Its request selects `kind`, `workspace`, optional `filter`, `rerunFailed`, and `watch`; its result returns `status`, selected `adapter`, `exitCode`, `diagnostics`, `failedTests`, `rerunToken`, `rawOutputRef`, and verified follow-up `actions`. The adapter selection and resolved workspace are part of the canonical result so a replay never depends on rediscovering them.

```json
{
  "kind": "test",
  "workspace": "packages/foo",
  "filter": "handles empty input",
  "rerunFailed": false
}
```

```json
{
  "status": "failed",
  "adapter": "vitest",
  "exitCode": 1,
  "diagnostics": [{ "file": "src/foo.ts", "line": 42, "column": 8, "severity": "error", "testName": "handles empty input", "message": "Expected 1, received 0" }],
  "failedTests": [{ "id": "src/foo.test.ts::handles empty input" }],
  "rerunToken": "rerun-01",
  "rawOutputRef": "spill://checks/abc123",
  "actions": [{ "kind": "read", "path": "src/foo.ts", "line": 42 }, { "kind": "lsp", "operation": "goToDefinition", "path": "src/foo.ts", "line": 42, "character": 8 }, { "kind": "rerun", "token": "rerun-01" }]
}
```

The first implementation supports TypeScript, ESLint, Vitest/Jest, and one Python adapter. It must preserve raw output when parsing fails and must never claim that an empty diagnostics array means a passing command. A rerun token is issued by one `check` result, scoped to the same workspace and check kind, and single-use: a consumed, stale, or definition-changed token fails with an explicit reason, and the model reissues a fresh check. `check` inherits the task execution path's sandbox and approval semantics; an escalated run carries the same justification contract as `bash`.

### `review` workflow

`review` is read-only and consumes a normalized diff source: working tree first, with commit, base-branch, and pull-request change-set modes activating after Phase 3 lands structured Git and the change-set consumer. Its result contains deterministic severity-ranked findings, locations when available, suggested fixes, related tests, a reviewed-file count, and explicit no-finding or unavailable states. Related tests come from the Phase 4 workspace-index import graph once it exists; before that, `review` reports related tests only when the diff itself touches a test file. It does not apply edits and does not turn a provider opinion into a durable code change without a separate edit transaction.

```json
{
  "target": "working_tree",
  "base": "origin/main",
  "focus": ["correctness", "security", "performance", "tests"],
  "severity": "all"
}
```

```json
{
  "findings": [{ "severity": "high", "file": "src/cache.ts", "line": 88, "title": "Cache entry is never invalidated", "explanation": "The write path has no matching invalidation.", "suggestedFix": "Add invalidation when the source changes.", "relatedTests": ["src/cache.test.ts"] }],
  "summary": { "filesReviewed": 12, "high": 1, "medium": 3, "low": 2 }
}
```

The first review fixture is keyless and deterministic. A provider-backed review may add model findings later, but parser and location semantics remain testable without a model key.

### Verified follow-up actions

Every high-level result may carry a small action vocabulary: `read`, `lsp`, `edit-preview`, `rerun`, and `review`. An action contains only validated paths, positions, rerun tokens, or transaction ids. The registry and presentation layer render the action, while the executor revalidates ownership, scope, and version before acting.

```json
{
  "actions": [
    { "kind": "read", "path": "src/cache.ts", "line": 88 },
    { "kind": "lsp", "operation": "findReferences", "path": "src/cache.ts", "line": 88, "character": 12 },
    { "kind": "edit-preview", "transactionId": "edit-01" },
    { "kind": "rerun", "token": "rerun-01" },
    { "kind": "review", "target": "working_tree" }
  ]
}
```

Actions are advisory capabilities, not permission bypasses. An invalid, stale, or out-of-scope action fails before execution and reports the reason in the canonical result.

### Stage-aware tool catalog

The catalog exposes a small high-level set for the current stage and retains low-level tools as explicit fallback. Exploration shows `project_inspect`, `workspace_map`, `search`, `read`, and `lsp`; modification shows `edit`, `multi_edit`, `refactor`, and the relevant LSP transaction; verification shows `check`, `diagnostics`, and `review`; delivery shows `git`, `change_set`, and the configured pull-request consumer. Stage transitions are logged with the reason and visible tool-set hash.

The routing experiment measures schema token cost, wrong-tool selection, repeated calls, and fixed-corpus completion rate. A smaller catalog is not an improvement if it increases failed exploration or hides a required fallback.

### Project inspection and change-set delivery

`project_inspect` returns project kind, package manager, workspace roots, scripts, toolchain, entrypoints, generated/vendor/ignored roots, and a reference to the dependency graph. `change_set` returns branch, base, commits, files, checks, review state, conflicts, next actions, and rollback reference. `reviewState` is a closed enum — `draft`, `pending`, `approved`, `changes_requested`, `merged`, `closed` — and providers map native states onto it, failing on unknown states instead of coercing them. Graph and rollback references are spill-backed locators recorded in the session log; a missing target is an explicit error, never a silent recompute. The local Git implementation owns these values; GitHub and GitLab integrations implement optional providers over the pull-request consumer.

```json
{
  "projectKind": "node-monorepo",
  "packageManager": "pnpm",
  "workspaceRoots": ["packages/foo", "packages/bar"],
  "scripts": { "test": "vitest run", "lint": "eslint .", "build": "tsc -b" },
  "toolchain": ["typescript", "vitest", "eslint"],
  "entrypoints": ["packages/foo/src/index.ts"],
  "generatedRoots": ["lib"],
  "vendorRoots": ["vendor"],
  "ignoredRoots": ["node_modules"],
  "dependencyGraphRef": "graph-01"
}
```

```json
{
  "branch": "dsh/check-diagnostics",
  "base": "origin/main",
  "commits": ["abc123"],
  "files": [{ "path": "src/cache.ts", "status": "modified" }],
  "checks": [{ "name": "test", "status": "passed" }],
  "reviewState": "pending",
  "conflicts": [],
  "nextActions": [{ "kind": "review", "target": "change_set" }, { "kind": "pull_request", "operation": "create" }],
  "rollbackRef": "checkpoint-01"
}
```

### Local resume and handoff

`job` and `session` resume operate on durable handles rather than replaying a prompt from memory. A handle is valid only when its owner, workspace identity, process state, and cleanup state are still consistent. Handoff transfers a session reference and pending next action, not hidden process authority.

The first local implementation does not require cloud execution. A remote provider may claim the same handle contract later, but it must report provider identity, network state, and whether the workspace is local or ephemeral.

### Runtime budget and rewrite contracts

The P0 runtime limits receive the same contract treatment as the high-level workflows: budgets resolve before execution, each budget carries its own reason code, and over-limit is an explicit result rather than a silent stop.

```json
{
  "reason": "budget_exhausted",
  "budget": "maxToolCalls",
  "limit": 40,
  "observed": 40,
  "continuation": { "kind": "new_turn", "resumeToken": "turn-42" }
}
```

A Code Mode binding that crosses its budget rejects that one call without discarding the program:

```json
{
  "kind": "binding_output_limit",
  "tool": "fs_search",
  "bindingBytes": 12582912,
  "limitBytes": 8388608,
  "guidance": "extract the needed fields inside the program instead of returning the whole value"
}
```

An input rewrite is one auditable record whose fields land together or the call does not run:

```json
{
  "original": { "path": "foo.ts" },
  "final": { "path": "packages/foo/src/foo.ts" },
  "reason": "policy:session-cwd-default",
  "schemaValidated": true,
  "presented": true,
  "executed": true
}
```

### Market-oriented acceptance targets

- Phase 0: the baseline corpus, its normalization, and its owner are recorded, and every section 3 row has an issue or an explicit retirement note.
- Phase 1: TypeScript, ESLint, and Vitest fixtures reach at least 90% precise diagnostic extraction; the localization and first-rerun thresholds are owned by the section 5 measures table.
- Phase 2: At least 95% of semantic edits pass preview, version-check, and rollback tests; no follow-up action contains an unresolvable path or position.
- Phase 3: Valid space-containing paths and wildcard pathspecs work 100% of the time in fixtures; conflict states always expose continue or abort; every mutation has a change-set and rollback reference.
- Phase 4: Project inspection selects the same adapter and workspace as the existing task runner on the reference corpus; dependency preview never writes files; search locations feed directly into `read` and `lsp`.
- Phase 5: Resume after process restart preserves owner and state, retries do not duplicate completed side effects, and configured budgets produce structured reasons.
- Phase 6: A user can diagnose the common plugin, preset, skill, MCP, configuration, telemetry, and platform symptoms without reading package source; approval rules show exact scope and expiry.
- Phase 7: One runtime completes launch, breakpoint, inspect, evaluate, continue, and disconnect with process cleanup.

### Test ownership matrix

1. Headless owning suite proves `check` failure-to-repair-to-rerun, `review`, project map, job/session resume, and stage-aware catalog behavior.
2. ACP owning suite proves handshake, session, prompt, cancellation, permission, JSON-RPC normalization, and the smallest tool/check/review protocol scenario.
3. Web owning suite proves explain-config, plugin/preset/skills doctors, telemetry, product recovery UI, and web-cordis's real `dsh web --patch` path with Cordis inspect, define, run, and stop behavior.
4. web-schedule owns schedule creation, deletion, cold-session recovery, overdue handling, time zones, and fork isolation; mcp-memory owns fixture-backed write, fresh-session recall, isolation, environment filtering, and reconnect.
5. jsonrpc-agent owns keyless and with-key entry behavior; the Python and TypeScript SDKs provide equivalent projections for the shared high-level scenarios they expose.
6. Built-artifact lane proves CLI check/review/project-inspect/resume and built Web, MCP, schedule, and Cordis overlay acceptance.
7. Real-API lane proves provider/model behavior, with-key multi-turn, file writing, and cancellation; CI reports collected test counts so an unexpected all-skip run fails.

### Competitive implementation conclusions

1. dsh does not need to copy Copilot cloud environments or Cursor's complete IDE in the first wave; it should expose their mature workflows through replayable Host and Client capabilities.
2. Adding more low-level tools is less valuable than `check`, `review`, `project_inspect`, `workspace_map`, `resume`, and stage-aware routing because those workflows directly affect completion rate.
3. dsh's defensible position is a composable, auditable, replayable, self-hosted coding agent rather than a product that only maximizes model entry points.

### Verification and delivery

1. Update the English document and its Chinese counterpart together, then run `pnpm run verify-translation-pairing --write docs/coding-capability-roadmap` and the scoped pairing check again.
2. Run `pnpm run verify-md-links`, `pnpm run verify-md-wrap`, `git diff --check`, and `pnpm run verify-doc-budgets --list`; the new roadmap must add no failure row.
3. Run `pnpm run doc-sync` and `pnpm run lint`; if existing worktree failures remain, the final report distinguishes them from errors introduced by this roadmap.
4. The document is complete when market sources are traceable, every gap has an owner phase, every high-level tool has input/output/failure/permission/replay definitions, every PR has dependencies and test ownership, and every phase has quantitative acceptance targets.

## 16. Phase review questions

- Does the change reduce time from a failure to a precise next action?
- Does the failure path render the failing stage, cause, and next legal action?
- Do verified follow-up actions carry only validated paths, positions, tokens, and transaction ids?
- Does stage-aware catalog routing preserve completion rate and keep required fallbacks visible?
- Can the model reconstruct every model-visible value from the session log?
- Are defaults, limits, approval scope, and cancellation behavior explicit?
- Does the result preserve raw evidence when structured parsing fails?
- Does an external file or process change fail closed rather than silently applying stale state?
- Which package owns the service definition, provider, consumer, lifecycle, and rollback?
- Which assembled example proves the user-visible behavior, and which protocol example proves the wire behavior?
- Are TypeScript and Python SDK projections updated when the shared behavior is visible in both?
- Does the platform matrix state prerequisites and partial enforcement honestly?
- Can the feature be disabled or rolled back without corrupting the session log or workspace?

This plan is complete when every phase has an owner, dependency order, observable acceptance evidence, and a rollback point. The plan itself does not authorize implementation; each phase still follows the repository's review, testing, documentation, and release controls.
