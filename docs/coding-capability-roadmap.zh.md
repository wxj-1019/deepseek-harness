# DSH Coding 能力执行计划

[English](coding-capability-roadmap.md) | 中文

本文档定义提升 DeepSeek Harness（dsh）coding agent（编码智能体）能力的执行计划，覆盖产品能力、运行时可靠性、完整应用行为以及证明这些能力的质量门禁。本文档不替代包 README、子系统参考、架构文档或测试约定。

## 1. 目标与范围

目标工作流是可恢复的闭环：发现项目、精确理解代码、执行有界修改、运行相关检查、将失败解析为位置、修复修改、重新运行检查，并准备可审查的 Git 结果。

本计划覆盖提供文件工具、搜索、LSP、Shell、终端、任务、Git、Code Mode、子代理、MCP、会话持久化、上下文发现、preset（预设）和产品入口的 Host 与 Client 包。某项行为同时对两种 SDK 可见时，本计划也覆盖 TypeScript 与 Python SDK 的投影。

本计划不通过绕过审批来实现自主化，不移除沙箱限制，不把 worker thread（工作线程）当作安全边界，也不承诺首个版本支持所有语言和调试器。每项新能力都必须可选，在前置条件不可用时明确失败，并保留「模型可见等于已落账」的规则。

执行顺序按能力而不是包数量组织。只有当提供方、服务定义、消费者、完整示例、文档以及相关回放或实时检查都完成时，一个阶段才算完成。

## 2. 当前基线

当前 coding roster（编码能力清单）已经包含文件读写编辑工具、多文件编辑、字符串替换、目录列表、glob 与 grep 搜索、LSP 导航和诊断、Shell 与 PowerShell 执行、持久终端会话、后台任务、任务发现与执行、结构化 Git 操作、Code Mode、子代理、工作流、skills（技能）和 MCP 工具桥接。相关所属约定见[文件系统工具](../packages/fs/tool-fs/README.zh.md)、[搜索工具](../packages/fs/tool-fs-search/README.zh.md)、[LSP 工具](../packages/lsp/tool-lsp/README.zh.md)、[任务工具](../packages/shell/tool-tasks/README.zh.md)、[Git 工具](../packages/shell/tool-git/README.zh.md)、[Code Mode](../packages/core/tools/README.zh.md)和[MCP 客户端](../packages/mcp/mcp-client/README.zh.md)文档。

LSP 已支持 definition、references、implementation、hover、document symbols、workspace symbols、diagnostics、rename、formatting 以及 incoming 或 outgoing call hierarchy。rename 已拥有带版本保护和回滚的 host-apply 路径，为 Phase 2 的事务设计提供基础。下一阶段的 LSP 工作因此是应用与重构事务，而不是首次实现导航。

当前任务路径可以发现 package script 并执行它们，但失败结果主要是有界的命令输出。Git 已有实用的安全控制，但一些结果仍面向文本，部分参数处理也比合法 Git 路径和 pathspec 语法更严格。Code Mode 可以批量调用可见工具，但中间 binding（绑定）值没有独立结果预算。

当前质量系统已经有较强的包级覆盖率、keyless 快照、构建产物检查和可选的真实 API 测试。部分完整装配 overlay（覆盖配置）和入口的覆盖归属仍不完整，包括 web-schedule、web-cordis、MCP memory 行为、JSON-RPC with-key 行为和 Python SDK 对称性。[测试约定](testing.zh.md)与[开发指南](development.zh.md)仍是现有检查的权威来源。第 3 节记录该基线背后的已知缺口及其证据和所属阶段。

## 3. 已知缺口清单

每行记录一个已知缺口、当前记录它的证据、负责关闭它的阶段，以及第 6 节模型下的优先级。Phase 0 评审对本表进行分诊：行可以拆分为 issue、重新划定到其他阶段，或在证据不再成立时移除；每个这类决策都通过编辑本表完成，而不是任其漂移。

| 领域 | 已知缺口 | 证据 | 阶段 | 优先级 |
| --- | --- | --- | --- | --- |
| 文档 | LSP 操作列表和工具描述仍写四个操作，而 seam 已暴露十一个，`docs/subsystems/lsp.md` 的 type-equiv 块随之漂移 | `packages/lsp/lsp/src/types.ts`、`packages/lsp/tool-lsp/src/index.ts`、`packages/lsp/tool-lsp/README.md`、`docs/subsystems/lsp.md` | 0 | P0 |
| 文档 | 任务工具 README 声称仅支持 workspace 根执行，而实现已发现嵌套 workspace | `packages/shell/tool-tasks/README.md`、`packages/shell/tool-tasks/src/index.ts` | 0 | P0 |
| 文档 | 根 README 将沙箱执行描述为仅 Linux，而 bwrap/Landlock、Seatbelt 和 Windows ACL backend 均已发布 | `README.md`、`packages/sandbox/sandbox-local/README.md` | 0 | P0 |
| 文档 | 多个包 README 配对与已记录的翻译状态失同步，且 `packages/mcp/mcp-servers/README.zh.md` 有两个断链锚点 | `packages/*/README.i18n.yaml`、`packages/mcp/mcp-servers/README.zh.md` | 0 | P1 |
| 覆盖 | 没有门禁将可运行示例映射到 keyless、with-key、快照和构建冒烟证据，多个 overlay 缺少完整装配回放所属方 | `scripts/run-gates.ts`、`docs/testing.md` | 0 | P1 |
| 工具 | 任务执行返回有界输出尾部，没有一等 `check` 工作流：无适配器检测、结构化诊断、过滤或 rerun-failed | `packages/shell/tool-tasks`、`packages/core/tools` | 1 | P0 |
| 工具 | 没有一等的只读 `review` 工作流来返回带位置和相关测试的按优先级排序的问题 | `packages/shell/tool-git`、`packages/core/tools` | 1 | P0 |
| 工具 | 尚无调试器能力；运行时状态只能通过 Shell 和 PTY 从日志推断 | — | 7 | P1 |
| 工具 | LSP 缺少 code actions、organize imports、prepare rename、type definition，以及 rename 之外的原子多文件应用 | `packages/lsp/lsp`、`packages/lsp/tool-lsp` | 2 | P1 |
| 工具 | 规范结果没有为 read、LSP、编辑预览、重跑和 review 暴露通用的已验证后续动作词汇 | `packages/core/tools`、`packages/fs`、`packages/lsp` | 2 | P1 |
| 工具 | 工具呈现还不能按探索、修改、验证和交付阶段路由高层工具目录 | `packages/core/tools`、`packages/core/agent-tool-presentation` | 2 | P1 |
| 工具 | Git 拼接 Shell 命令字符串、拒绝合法空格与通配符、返回面向文本的 diff 和 log 结果，缺少 merge、rebase、cherry-pick、blame 和冲突工作流 | `packages/shell/tool-git`、`packages/subprocess` | 3 | P1 |
| 交付 | Git 没有带结构化审查和回滚状态的 branch、checkpoint、change-set 或 pull-request 对象 | `packages/shell/tool-git`、`packages/host` | 3 | P1 |
| 工具 | 没有项目、依赖或 workspace 图检查能力 | — | 4 | P1 |
| 工具 | 搜索缺少 offset 分页、上下文行、大小写模式和结构化位置；没有共享 workspace 索引区分生成或 vendored 目录 | `packages/fs/tool-fs-search` | 4 | P2 |
| 运行时 | agent loop 没有内建 step、wall-time 或 tool-call 预算 | `packages/core/agent-loop` | 5 | P0 |
| 运行时 | Code Mode binding 值没有单 binding 或聚合字节预算，并在内存中完整快照 | `packages/code-runtime` | 5 | P0 |
| 运行时 | instruction discovery 的 project root 会漂移、把 provider 故障当作不存在，且缺少聚合源预算 | `packages/context/agent-instructions` | 5 | P1 |
| 运行时 | 工具输入重写不是事务性的；策略 hook 只能 allow、deny 或 ask | `packages/core/tools` | 5 | P1 |
| 运行时 | 任务和会话缺少统一的用户可见 resume、retry、wait 和 handoff 入口 | `packages/shell/tool-bash`、`packages/jobs`、`packages/session` | 5 | P1 |
| 运行时 | 后台任务没有执行器级超时或归属进程树清理 | `packages/shell/tool-bash` | 5 | P2 |
| 运行时 | 会话 JSONL 读取从序列零开始扫描，没有 checkpoint | `packages/session/session-persistence-jsonl` | 5 | P2 |
| 运行时 | LSP stdio 使用临时文档打开，并按 workspace 串行查询 | `packages/lsp/lsp-stdio` | 5 | P2 |
| 运行时 | 内存中的会话保留随原始事件增长，compaction 之后仍然如此 | `packages/core/session` | 5 | P2 |
| 产品体验 | 配置分层不透明；没有命令解释最终值、来源或覆盖关系 | `apps/cli` | 6 | P2 |
| 产品体验 | 插件、preset 和 skill 健康状态没有面向用户的诊断；inventory 缺少来源与失败历史 | `apps/cli`、`packages/host/plugin-inventory`、`packages/skill/skill-filesystem` | 6 | P2 |
| 产品体验 | telemetry 模式、脱敏和投递没有 status、preview 或 test 命令 | `packages/session/session-telemetry` | 6 | P2 |
| 产品体验 | 审批是一次性的，没有持久规则、动作上下文或请求超时 | `packages/interaction/user-approval`、`packages/interaction/tool-ask-user` | 6 | P1 |
| 产品体验 | 发布站点缺少 CLI、profile、插件、故障排查和平台页面；未映射链接会跳转到 GitHub 源码 | `website/docs.ts`、`scripts/project-doc-site.ts` | 6 | P2 |
| 生态 | MCP 仅桥接工具；Resources 和 Prompts 被延后，HTTP 失败按调用重试而没有 supervisor | `packages/mcp/mcp-client` | 8 | P3 |
| 生态 | 终端缺少 resize、named keys、EOF、read-until-prompt 和 TUI 交互 | `packages/terminal/tool-terminal` | 8 | P2 |
| 生态 | Code Runtime 没有进程或容器 backend、流式进度或孤儿进程清理 | `packages/code-runtime` | 8 | P3 |
| 多代理 | 子代理报告没有持久 mailbox、ACP 子代理缺少回放 fixture、continuable fork 因前缀漂移被禁用，声明式 agent 行没有 persona 或 tool-presentation 字段 | `packages/subagent`、`packages/core/agent-loop` | 8 | P2 |

## 4. 市场基准与差距转译

本次基准于 2026-08-31 从 [Claude Code](https://code.claude.com/docs/en/overview)、[Claude Code 权限](https://docs.anthropic.com/en/docs/claude-code/permissions)、[OpenAI Codex CLI](https://learn.chatgpt.com/docs/codex/cli)、[Cursor](https://cursor.com/docs)、[GitHub Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent) 和 [Aider 使用文档](https://aider.chat/docs/usage.html)的官方产品文档采集。它记录公开说明的工作流，不是完整产品基准，也不声称每个功能在每个方案中都可用。每次次要发布或每季度（以先到者为准）复核链接与每一行结论；链接失效或产品能力变化时直接编辑本节，而不是让内容原地过期。

| 能力 | 成熟产品基线 | dsh 状态 | 实施优先级 |
| --- | --- | --- | --- |
| 本地 coding 闭环 | 在一个终端或 IDE 会话中检查、编辑、执行并继续 | 已有：文件工具、Shell、任务、终端、会话和 Code Mode | — |
| 自动验证 | 编辑后运行 lint、test 和 build，并把失败反馈给 agent | 部分具备：任务执行返回有界输出，但没有通用诊断和重跑 token | P0 |
| 代码审查 | 对工作树、commit、branch 或 pull request 进行专用只读审查并返回优先级问题 | 缺少一等工具；Git diff 是主要基础能力 | P0 |
| 语义重构 | rename、code actions、organize imports、prepare rename 和安全多文件应用 | 部分具备：LSP 导航、诊断、rename、formatting 和调用层级已有；事务和 code actions 不完整 | P1 |
| 调试 | 为断点、栈帧、变量和单步提供专用 Debug 或 DAP 工作流 | 缺少；调试依赖 Shell、终端和日志检查 | P1 |
| 仓库上下文 | repo map、持久指令、规则、记忆和相关文件选择 | 部分具备：instructions、搜索、LSP、preset 和会话持久化已有，但没有一个项目地图 | P1 |
| 工具路由 | 用探索、修改、验证、审查和交付等高层模式隐藏无关低层工具 | 部分具备：有 presentation 和 Code Mode，但目录没有按阶段路由 | P1 |
| 权限 | 按参数匹配的规则、会话/项目持久化、风险解释和范围审批 | 部分具备：sandbox 与 approval 较强，但规则和动作解释产品化不足 | P1 |
| 并行与远程工作 | 子代理、后台任务、可恢复会话、云或临时环境和 PR 交接 | 部分具备：子代理、任务、工作流、ACP 和 Web 已有；持久 resume 和 change-set 交付不完整 | P1 |
| 扩展生态 | Skills、hooks、plugins、MCP、IDE 集成、CI 和外部工作跟踪 | 本地能力较强：plugins、skills、hooks、MCP tools、Web、ACP 和 SDK 已有；MCP Resources/Prompts 延后 | P2–P3 |

优先级列中的短横线表示该能力已达到记录的基线，只需维护；P0 到 P3 的含义见第 6 节。

市场对照改变了优化目标。dsh 不需要在具备 coding 竞争力前复制每个 IDE 或云端功能，而应把已有低层能力变成带结构化结果、明确恢复路径和可回放证据的可靠高层工作流。

### 竞争定位与非目标

dsh 最强的差异化是 Cordis 插件架构、完整能力 seam 所属、持久会话事件、keyless 回放、平台感知沙箱、审批集成和类型化 Code Mode 调度。这些基础适合要求工具调用可解释、可审计和可恢复的自托管部署。

第一轮实现不要求完整 IDE、云端执行、语音输入或所有第三方工作跟踪器，也不通过放宽审批、沙箱、会话落账或 provider 隔离来追求便利模式。云端和 IDE 集成应作为独立 provider，复用相同的服务约定。

## 5. 成功指标

第一轮测量应在 Phase 1 改变任务和诊断路径之前记录基线。使用相同的提示、工作区、模型设置和时间预算运行有代表性的 TypeScript、Python 与 monorepo 任务。只保存聚合指标，不保存用户源代码内容。

| 指标 | 基线方法 | Phase 1 目标 | 长期目标 |
| --- | --- | --- | --- |
| 任务完成率 | 回放固定任务集，统计达到请求检查结果的任务数 | 在不增加审批绕过的情况下提升 15% | 在支持的项目类型上提升 30% |
| 失败定位时间 | 测量从首次失败检查结果到首次针对所属文件和位置的工具调用 | 中位数降低 40% | 中位数保持在两个修复轮次内 |
| 首次修复通过率 | 统计由第一轮诊断引导的编辑和重跑修复的失败数 | TypeScript 与 ESLint fixture 达到 60% | 支持的适配器达到 75% |
| 重复工具调用率 | 统计一个轮次内相同或语义重复的调用 | 降低 20% | 在不降低探索质量的情况下降低 40% |
| 长会话资源使用 | 在长 fixture 上记录峰值 RSS、事件日志读取时间和工具延迟 p95 | 建立上限和告警 | 参考工作负载保持在配置上限内 |
| 跨入口一致性 | 比较共享场景在 headless、ACP、Web 和 SDK 中的规范化观察结果 | 每个声明场景都有所属方 | 所有支持的入口对共享场景给出一致结果 |
| 示例覆盖完整性 | 清点可运行示例，映射 keyless、with-key、快照和构建冒烟证据 | 不存在未解释的缺失行 | CI 拒绝新增的未覆盖可运行示例 |

只有在 fixture、规范化方式、所属方和可接受偏差都已记录后，指标才可以成为发布门禁。不要把模型 token 数量或原始 transcript 长度作为 coding 质量的代理指标。

## 6. 优先级模型

按用户影响、依赖价值、实现成本和失败风险排序。P0 工作用于防止失控行为或使核心闭环可信。P1 工作直接改善诊断、安全编辑或项目理解。P2 工作改善规模、平台体验或运维恢复。P3 工作在核心约定稳定后扩展协议范围或高级工作流。

总原则是在工具数量之前保证可靠闭环。结构化结果、安全的后续动作或证明现有工具能够正确使用的回放，其优先级高于新增一个孤立工具。

每个阶段都必须在开始编码前标明持久化数据变化。会话事件、工具 schema、公共服务方法或 SDK 投影的变化，需要在同一变更中完成对应的类型、文档、回放和兼容性工作。第 3 节将该模型应用到每个已知缺口，并记录由此得出的阶段归属。

## 7. 分阶段路线

时长是规划估计；门禁依据是完成定义，而不是日历。

### Phase 0：基线、约定一致性与覆盖清单，1 周

**目标：** 消除已知约定漂移，发布平台矩阵，并建立防止未测试产品组合的清单。

**所属方：** `packages/lsp`、`packages/shell/tool-tasks`、`docs`、`scripts/run-gates.ts`、`examples`、`website`。

**交付物：** 修正 `packages/lsp/lsp/src/types.ts`、`packages/lsp/tool-lsp/src/index.ts` 和所属 README 中的 LSP 操作列表与描述；用修正后的源码重新生成 `docs/subsystems/lsp.md` 与 `docs/subsystems/lsp.zh.md` 的 type-equiv 块并重录配对；修正 `packages/shell/tool-tasks/README.md` 中关于嵌套 workspace 的描述；将根 README 中仅 Linux 的沙箱说法替换为覆盖 bwrap/Landlock、Seatbelt 和 Windows ACL（含部分执行说明）的平台矩阵；恢复失同步包 README 配对的已记录状态，并修复 `packages/mcp/mcp-servers/README.zh.md` 中的两个断链锚点；增加示例覆盖 manifest 或生成清单；对第 3 节清单进行分诊并拆分 issue；记录 Phase 0 指标基线。

**测试与证据：** 运行限定范围的文档和链接检查；增加 keyless 清单测试，对未解释的可运行示例失败；为新声明的入口增加构建后的 CLI 冒烟；确认清单能区分仅配置 overlay 与可运行产品示例。

**验收：** 每个 LSP 操作都有一个权威操作列表以及匹配的模型可见描述；每个可运行示例都有明确的 keyless 与 with-key 状态；没有平台 README 与已发布 backend 矛盾；全仓翻译配对检查通过；基线报告可以通过已提交命令复现。

**回滚：** 只回滚文档和清单变更；不要为了让清单变绿而禁用现有产品测试。

**完成定义：** 源码和文档一致，清单 CI 已在适当 lane 中设为必需，并且第一阶段评审为每个清单行指定了所属方。

### Phase 1：结构化测试与构建诊断，2-4 周

**目标：** 将命令失败转为可操作、带位置的结果，使结果能够驱动下一次 read、LSP 查询、编辑和重跑。

**所属方：** 从 `packages/shell/tool-tasks` 开始，在所属任务或诊断包中放置共享诊断类型；与 `packages/fs`、`packages/lsp`、`packages/core/tools` 以及 headless 和 CLI 示例集成。

**交付物：** 定义带版本的诊断结果，包括 source、severity、file、line、column、code、test name、message、可选 stack、原始输出引用和已验证的后续 actions；增加一等 `check` 工具，支持 `test`、`build_check` 和 `lint_check` 类型；检测并报告所选适配器；通过现有 spill 机制保留有界原始输出作为证据；实现 TypeScript、ESLint、Vitest/Jest 和一个 Python 适配器的解析器；支持测试过滤和 rerun-failed 请求（watch 模式不在首版范围内：长期运行的 watch 与有界 tool-call 执行冲突）；提供稳定的 `read`、`lsp`、`edit-preview`、`rerun` 和 `review` action；增加一等只读 `review` 工具，本阶段限定于 working-tree diff，commit、base-branch 和 pull-request 模式在 Phase 3 落地结构化 Git 与 change-set consumer 后启用，返回按优先级排序的问题、位置、建议修复和相关测试；没有解析器匹配时保留原始组合输出。

**配置：** 让解析器选择、输出上限、执行超时和 workspace 选择成为明确的已解析配置。不要在执行方法内部推断 package manager 或 test runner 而不报告所选适配器。`check` 运行执行项目定义的命令，并继承任务执行路径的沙箱与审批语义；需要更大权限时通过与 `bash` 相同的按调用沙箱流程升级，并携带相应理由。

**测试与快照：** 为有效、畸形、截断和混合输出增加解析器单元测试；增加真实 Loader 集成测试；增加从失败到修复再到重跑的 headless keyless 快照；增加一条真实模型路径的 with-key 冒烟；为发布的任务入口增加构建后 CLI 验收。

**验收：** 当工具输出含有位置时，支持的失败检查至少返回一个精确诊断；畸形或不支持的格式仍以原始输出呈现，并带有明确解析警告；模型可以使用返回的位置读取文件或查询 LSP，而无需重建命令字符串；rerun-failed 只选择已记录的失败测试。

**回滚：** 如果解析器失败，在相同工具 action 下保留现有任务执行路径；结构化解析不可用时绝不丢弃原始输出。

**完成定义：** 参考 fixture 无需手工翻日志即可完成修复闭环，结果 schema 已记录并由 keyless 回放固定。

### Phase 2：Workspace edit 事务与语义重构，3-5 周

**目标：** 使 LSP 生成的修改可预览、经过版本检查、受审批控制、原子化且可恢复。

**所属方：** 扩展 `packages/lsp/lsp` 与 `packages/lsp/tool-lsp`；在现有 rename host-apply 路径旁提取可复用的应用逻辑；与 `packages/fs`、审批、会话落账和 SDK 投影协同。

**交付物：** 定义 workspace-edit 事务，包含目标版本、规范化编辑、预览文本、审批上下文、已应用文件和回滚状态；增加 `prepareRename`、`codeAction`、`organizeImports`、`typeDefinition` 以及 fixture server 可提供的最高价值能力；为安全操作支持预览和 host-side apply；定义通用的已验证后续 action 词汇，包括 `read`、`lsp`、`edit-preview`、`rerun` 和 `review`，由规范结果生成并由 registry/presentation 呈现；增加按探索、修改、验证和交付阶段路由的工具目录，同时保留低层工具作为显式 fallback；不要把 provider 协议细节放进模型可见 schema；复用 rename 路径已使用的 fs observation 和版本保护机制。后续 action 词汇与按阶段工具目录是独立约定，拥有各自的 PR，与事务的落地顺序可以互换。

**配置：** 将结果上限、事务超时、审批策略和冲突行为暴露为已验证配置。事务必须要么应用所有已接受的编辑，要么准确报告哪些文件未应用以及原因。

**测试与快照：** 覆盖重叠编辑、过期版本、缺失文件、取消、中途失败、回滚、空计划、provider capability 缺失、畸形后续 action 和阶段工具不可用；增加 rename、code action、organize imports 以及探索到验证再到交付的工具目录转换完整装配快照；在固定任务集上测量 schema token 和错误工具选择；只要事件或结果对模型可见，就增加 TypeScript 与 Python SDK 投影。

**验收：** 用户可以在应用前检查完整计划；外部文件变化会阻止不安全应用；事务失败时工作区保持事务前状态，或报告经过验证的恢复路径；会话日志可以重建计划和结果。

**回滚：** 对不支持 host apply 的 provider 或部署保留 plan-only 模式；可以单独禁用操作适配器，而不删除事务约定。

**完成定义：** 至少两个语义重构场景通过预览、审批、应用和回放，场景中不再手写 LSP edit 到文件编辑工具的转换。

### Phase 3：结构化 Git 与冲突工作流，2-4 周

**目标：** 让仓库检查和会改变历史的操作在合法路径上精确、可组合且安全。

**所属方：** `packages/shell/tool-git`、`packages/subprocess`、审批、会话落账和 Git 示例。

**交付物：** 增加基于 argv 的 subprocess 执行方法；将每个 Git action 迁移到 argv，使合法空格与通配符不再作为元字符被拒绝；返回结构化 status、diff 文件、hunk、range、conflict 和 blame 行，同时保留有界文本证据；增加带 change-set 标识的 branch 和 checkpoint 状态；为 merge、rebase 和 cherry-pick 增加 preview 与明确状态转换；增加 continue 与 abort；在仓库 fixture 支持时增加 worktree 和 range-diff；定义 `pull_request` consumer provider 接口，支持 create、update、review 和 close，但不让 GitHub 或 GitLab 成为核心服务依赖；每个 mutation 返回 branch、commit、files、conflicts、next actions 和 rollback reference。change-set 与 checkpoint 记录是新的持久化对象：在同一变更中登记 persistence catalog 并评估 `SESSION_FORMAT_VERSION` 影响。

**配置：** 在加载或请求解析阶段验证 Git 可执行文件、workspace root、输出上限和破坏性操作策略。pathspec 与文件名必须是值，而不是 Shell 片段。

**测试与快照：** 覆盖空格、Unicode、通配 pathspec、空仓库、detached HEAD、冲突、取消和部分失败；增加结构化 diff 与冲突解决的 keyless 完整装配快照；with-key 测试只用于模型和 provider 行为，不能代替 Git 语义测试。

**验收：** 带空格的合法路径和通配 pathspec 可用；破坏性操作需要配置的审批；冲突状态标明文件和下一步合法动作；对相同仓库状态，continue 与 abort 幂等；每个 mutation 返回可审查的 change-set 状态和 rollback reference；pull-request provider 可以禁用而不影响本地 Git；任何 Git 操作不再把拒绝 Shell 元字符作为主要安全机制。

**回滚：** 如果写入工作流被禁用，保留现有只读 action；移除 action 适配器前，先终止进行中的 Git 状态。

**完成定义：** fixture 可以检查 diff、进入冲突、报告冲突，并且只使用结构化结果 continue 或 abort。

### Phase 4：项目、依赖与 workspace 理解，3-4 周

**目标：** 让 agent 在修改文件或安装包之前理解项目拓扑、依赖影响和 workspace 结构。

**所属方：** 在 filesystem 或 workspace 组下增加项目检查包，再增加依赖工具消费者；与 workspace discovery、任务适配器、审批和模型 prompt 集成。

**交付物：** 增加 `project_inspect`、`workspace_map` 和 `dependency_graph` 消费者；检测语言、框架、package manager、workspace root、lockfile、script、编译配置、test/lint/build 命令和关键入口；实现 dependency list、why、outdated、audit 和 update-preview；返回图摘要及更新会修改的确切文件；先支持 npm/pnpm，其他生态只有在拥有对应 fixture 后再增加；增加记录包根、生成与 vendored 目录、ignored 目录、symlink 身份和项目配置的 workspace 索引；为搜索扩展 offset 分页、上下文行、大小写模式和结构化位置结果（P2：可排在 P1 检查交付物之后）；吸收 repo-map 与基于规则的上下文选择的有效部分，同时不绕过事件回放。

**配置：** 使用明确的适配器 allowlist、网络策略、registry 配置、超时和最大图规模。安装、更新、需要网络的 audit 以及 lockfile 写入必须拥有独立审批上下文。

**测试与快照：** 增加单包和 workspace 项目、畸形 manifest、冲突 lockfile、缺少 package manager 和离线模式的 fixture；增加检查与更新预览的完整装配 keyless 快照；with-key 只覆盖 provider 驱动的规划行为。

**验收：** 检查操作绝不写文件；更新预览列出包、版本、lockfile 和 script 影响；不支持的生态返回明确能力结果；审批被拒绝时 lockfile 不变；搜索结果携带可直接送入 `read` 和 `lsp` 的结构化位置。

**回滚：** 只移除新的依赖消费者，保留任务执行；已批准的更新在写入后失败时，从事务快照恢复 lockfile。

**完成定义：** agent 可以识别正确的项目命令，并生成可审查的依赖更新计划，而不根据目录名称猜测。

### Phase 5：运行时可靠性与资源控制，3-4 周

**目标：** 限制成本和内存，使策略重写可审计，并保留回放、审计和用户控制。

**所属方：** `packages/core/agent-loop`、`packages/core/tools`、Code Runtime、会话持久化、上下文 instructions、workspace registry、LSP stdio 和任务工具。

**交付物：** 增加明确的 `maxSteps`、`maxTurnWallMs` 和 `maxToolCalls`（P0）；增加 Code Mode 单 binding 与聚合字节预算，并返回明确错误（P0）；增加 `job wait/status/resume/retry/cancel` 与 `session resume/handoff` 入口，句柄记录 owner、workspace、command、process state、output locator、exit state、retry count、related turn 和 cleanup state（P1）；按 agent identity 冻结 instruction project root，并在项目变化时记录显式替换（P1）；将 provider 不可用的 instruction probe 作为 tri-state 处理而不是不存在（P1）；为 instruction discovery 增加聚合源预算（P1）；使工具输入重写成为事务性 allow 路径，将原始输入、最终输入、原因、schema 校验、呈现内容和执行值记录在一起（P1）；增加后台任务的执行器级超时和归属进程树清理（P2）；增加稀疏 JSONL checkpoint（P2）；缓存 LSP 打开的文档，并在支持时使用增量变更（P2）；用持久化投影限制内存中的会话保留（P2）。job 与 session resume 句柄是持久化对象：在同一变更中登记 persistence catalog 并评估 `SESSION_FORMAT_VERSION` 影响。

**配置：** 每个预算和策略都是经过验证的部署配置，具有明确单位、执行点、取消结果和可观测字段。影响模型可见行为的默认值必须在执行前解析，并记录已解析值。

**测试与快照：** 覆盖精确边界和超限、取消竞态、abort 后唤醒、子进程清理、大 binding、JSONL 截断和恢复、root marker 失败、LSP server 重启、重启后 resume、重试去重以及重写后拒绝的顺序；增加长 fixture 性能检查，但不要使用易波动的 wall-clock 阈值。

**验收：** 有界轮次以结构化原因结束；Code Mode 绝不静默截断 binding；超时任务不能留下归属进程树；任务或会话在进程重启后可以用相同的持久 owner 和状态恢复；重试不会重复已完成的副作用；可用时会话冷读使用 checkpoint，并能从无效 checkpoint 恢复；instruction provider 故障不会加载无关的祖先 instructions；执行输入始终等于其落账与呈现的输入。

**回滚：** 保留旧的全量扫描或未缓存路径作为恢复模式；checkpoint 校验失败时禁用稀疏索引读取；瞬时 provider 故障时保留 last-good context 与 server 状态；重写校验失败时拒绝重写调用，不执行原调用。

**完成定义：** 参考工作负载保持在声明的上限内，每个新限制或重写路径都有一个同时证明执行与恢复行为的回放。

### Phase 6：产品可运维性、审批与平台界面，2-3 周

**目标：** 让配置、插件健康、telemetry 和失败恢复对用户可观察、可操作，并把审批从一次性授权升级为可描述的规则。

**所属方：** `apps/cli`、`website`、`packages/host/plugin-inventory`、`packages/session/session-telemetry`、`packages/interaction/user-approval`、`packages/interaction/tool-ask-user`，以及每个被诊断界面的所属包。

**交付物：** 增加 `dsh --explain-config`，显示每个最终值、其来源层、覆盖者和禁用原因；增加 `dsh plugin list/why/doctor`，显示 bundle 层、entry phase、来源和最近失败；增加 preset 与 skills doctor 命令，暴露 broken 原因、来源根和 trust；增加 telemetry status、test 和 export-preview 命令及明确脱敏策略；为 patch-watcher 失败、MCP 重连预算和 Code Mode 孤儿进程暴露恢复状态，包括失败阶段、last-good 时间和重试动作；发布 CLI 与 profile、插件、按症状排查、平台支持以及生成目录之上的能力矩阵网站页面；在 onboarding 中显示 preset 工具矩阵；增加插件作者模板，包含 Windows 与 PowerShell 示例、manifest 校验、运行时兼容性、原生依赖和供应链检查；为审批请求扩展命令、路径、diff 和网络目标上下文、带参数匹配、范围、过期、撤销和审批注释的会话或项目级持久规则、风险解释以及请求超时。

**配置：** 每个 doctor 和 status 命令读取其诊断对象所用的同一份已验证配置并如实报告，绝不猜测。审批规则存储在发布前需要明确的范围、过期和审计身份。

**测试与快照：** 用损坏、漂移和健康 fixture 测试每个 doctor 命令，使失败呈现成为受测证据而不是散文；增加审批规则生命周期快照；为新页面运行网站链接和配对检查；只有命令触碰 provider 状态时才增加 with-key 覆盖。

**验收：** 用户无需翻包 README 就能回答插件、preset、skill 或 MCP server 为何不工作；失败的 patch 更新会标明阶段和下一步动作；审批规则可见、可撤销、可审计；每个新命令都有 keyless 快照或记录在案的仅交互理由。

**回滚：** 每个 doctor 和 status 命令独立发布；禁用审批规则持久化并回退到一次性授权，而不改变审批请求结构。

**完成定义：** 故障排查页列出的常见症状，每个都有能诊断它的 doctor 或 status 命令和经过测试的恢复路径。

### Phase 7：DAP 调试器能力，6-10 周

**目标：** 为支持的运行时提供受控交互式调试，而不是要求 agent 从日志推断状态。

**所属方：** 在新的 `packages/debug` 组下增加 debugger 服务定义和 provider；与 subprocess、sandbox、approval、jobs、terminal、session events 和 tool presentation 集成。

**交付物：** 先为一个运行时实现 launch、attach、breakpoints、continue、step-in、step-over、step-out、stack frames、scopes、variables、evaluate、exception threads 和 disconnect；定义适配器能力发现和规范化结果词汇；将每个调试进程绑定到所属方和清理路径。

**配置：** 声明适配器可执行文件、workspace root、launch 策略、attach 策略、网络策略、超时、frame 和 variable 上限以及 evaluate 审批规则。除非部署明确允许，attach 默认必须禁用。

**测试与快照：** 使用 fixture debug adapter 或确定性的 DAP server 进行协议测试；增加 launch、崩溃、取消和 disconnect 的真实进程生命周期测试；增加调试 transcript 的 keyless 完整装配快照；为支持的 launcher 增加平台测试。

**验收：** 模型可以在断点停止、检查 frame 和变量、求值获准表达式、继续执行并 disconnect；崩溃或取消的会话会报告终止状态并清理所属进程；不支持的 adapter capability 会明确报告而不是猜测。

**回滚：** provider 可在保持服务和 schema 可加载的同时禁用；如果审批或清理路径尚未完成，可以单独关闭 attach 和 evaluate。

**完成定义：** 至少一个语言运行时拥有完整的 launch 到 disconnect 场景、进程清理和会话证据回放。

### Phase 8：生态与多代理扩展，后续工作

**目标：** 在核心 coding 闭环和资源限制稳定后，扩大互操作性与多代理可靠性。

**所属方：** MCP Resources 与 Prompts、高级 PTY 控制、Code Runtime 进程或容器 backend、子代理投递与回放、声明式 agent 配置，以及 TypeScript/Python SDK 对称性。

**交付物：** 增加带授权和失效通知的 resource 与 prompt discovery；增加终端 resize、named keys、EOF 和 read-until-prompt；增加进程级 Code Runtime 隔离与流式输出；定义带确认和去重的持久化报告投递；增加 ACP 子代理回放 fixture，并在前缀保持字节一致时重新启用 continuable fork；为声明式 agent 行扩展 persona 与 tool-presentation 字段；在两种 SDK 中镜像共享场景；在单 workspace 缓存稳定后增加 LSP 多根路由、provider 健康状态和能力发现。

**验收：** 每项新增能力都有 provider、consumer、生命周期所属方、失败状态、完整装配示例和兼容性证据。生态能力不得成为 standard coding preset 的隐藏依赖。

**回滚：** 每项新增能力使用独立 composition 行，可以禁用而不改变核心工具清单或会话格式。

**完成定义：** 扩展可以启用、诊断、测试和移除，而不改变无关的 coding 行为。

## 8. 横向设计规则

- **模型可见等于已落账。** 发送给模型的任何值，包括重写参数、诊断、计划、审批和工具能力变化，都必须可以从会话事件重建。
- **参数重写是可审计事务。** 如果 hook 或策略重写输入，要一起记录原始输入、最终输入、原因、schema 校验、呈现内容和执行值；绝不执行未落账的校验后值。
- **默认值必须显式。** 在执行前将请求解析为规格，相关值要记录，并在自包含配置无效时于加载阶段失败。
- **参数使用 argv 或结构化 API。** Shell 字符串只用于有意编写的 Shell 程序；路径、包名、Git 选项和适配器参数都是值。
- **结构化结果先于呈现。** 保持机器字段稳定，将有界文本作为最终结果的纯投影。
- **上限作用于完整结果。** 上限必须计算所有字段、元数据和截断标记；超限应是明确结果，而不是静默丢数据。
- **审批要描述动作。** 显示将受影响的命令、路径、diff、网络目标或 attach 目标，并带有范围、过期时间和审计身份。
- **失败必须可诊断且可恢复。** 在安全时保留 last-good 状态，暴露失败阶段和下一步合法动作，不要把瞬时不可用伪装成不存在。
- **平台行为使用矩阵。** 每项可执行能力都声明支持平台、前置条件、部分执行情况和完整装配测试路径。
- **能力 seam 必须完整。** 服务定义、至少一个 provider 和一个 consumer 要一起评审和测试；registry disposal 与生命周期所属也是完成条件。

## 9. 测试与发布策略

使用四个证据层级：包级单元与集成测试证明局部语义；完整装配 keyless 快照证明确定性产品行为；with-key e2e 证明 provider 与模型行为；构建产物和平台冒烟证明发布入口。用户观察的是完整装配行为时，包测试不能替代完整示例。

行为所属方只在第 15 节测试责任矩阵中记录一次；本节只拥有证据层级与清单门禁。

增加示例清单门禁，将每个可运行组合映射到 keyless 测试、with-key 测试、快照所属方和构建入口冒烟。配置专用 overlay 可以豁免，但豁免必须明确并经过检查。当发现测试但所有用例异常自跳过时，门禁也必须失败。

Phase 6 的可运维性命令要针对损坏与漂移 fixture 测试，使失败呈现成为受测证据而不是散文。每个阶段先运行覆盖变更表面的最小检查，再运行必需的产品检查。最终变更报告必须列出实际运行的命令，包括 `pnpm run doc-sync`、`pnpm run lint`、`git diff --check`、限定范围的单元或集成测试、快照、构建冒烟，以及在凭证和范围要求时运行的真实 API e2e。

## 10. 风险登记表

| 风险 | 触发条件 | 缓解措施 | 回滚点 |
| --- | --- | --- | --- |
| 会话事件或 SDK 不兼容 | 模型可见字段或生命周期事件变化 | 在启用消费者前为事件定版并记录，更新 TypeScript 与 Python 投影，增加回放 fixture | 禁用消费者并保留旧事件读取器 |
| 输入重写后的审计失配 | 执行参数与落账或呈现参数不同 | 在同一个有序事务中完成重写、schema 校验、落账、呈现和执行 | 拒绝重写调用，不执行原调用 |
| 预算过早终止 | 限制停止了有效的长任务 | 区分 step、wall-time、tool-call、binding 和 output 原因；暴露继续或重试状态 | 提高或禁用对应部署预算 |
| Workspace root 漂移 | 会话期间项目标记发生变化 | 冻结 root identity，项目变化时记录显式替换 | 复用 last-good root，并要求新会话进行替换 |
| 子进程泄漏 | worker、任务、终端或 debugger 取消后留下子进程 | 管理进程组，使用 supervisor 清理，并测试崩溃和取消路径 | 清理所属进程树并标记运行未完成 |
| 跨平台语义漂移 | Shell、路径、沙箱或 debugger 行为在操作系统间不同 | 维护平台矩阵，使用原生 argv API，运行平台所属的冒烟测试 | 只禁用不支持的 provider 或 composition 行 |
| 依赖供应链暴露 | 更新或安装访问网络或运行生命周期脚本 | 要求明确审批，显示 registry 和 lockfile diff，限制适配器，保留回滚数据 | 恢复 lockfile 并禁用更新适配器 |
| DAP 生命周期失败 | 适配器崩溃、挂起或失去调试进程 | 限制每个请求，管理适配器和调试进程生命周期，暴露终止清理状态 | 禁用 attach/evaluate 或整个适配器，同时保留只读工具 |
| 运维盲区 | 插件、MCP server 或 patch 更新失败时，用户看不到阶段、原因或恢复动作 | doctor 命令、恢复 UX 和 last-good 可见性，并测试失败呈现 | 每个 doctor 命令及其 fixture 独立发布 |
| 动态目录缓存失效 | 阶段转换改变可见工具集并打断请求前缀 | 用显式检查点约束转换，记录工具集 hash，并在收紧路由前测量完成率 | 回退到完整静态目录 |
| 高层与低层工具竞争 | 存在高层工作流时模型调用低层工具 | 目录向高层工具倾斜，在 prompt 指引中说明 fallback，并在固定任务集上跟踪错误工具选择 | 隐藏高层工具或降级路由 |
| 不可信 check 执行 | 项目测试脚本运行恶意或联网代码 | `check` 继承任务沙箱与审批语义；升级模式需要按调用理由 | 按部署禁用 check 类型 |
| 快照维护成本 | 不相关原因导致广泛 fixture 变化 | 每个行为指定一个所属方，窄化规范化不确定性，分离协议和产品快照 | 只回滚新增场景，或移到其所属入口 |

## 11. Issue 与 PR 拆分

1. 创建一个 Phase 0 文档和清单 PR；不要把运行时变更混入其中。
2. 创建 `check` 约定 PR（共享诊断、schema、action 词汇、原始输出 locator），再创建解析器与适配器 PR，最后创建完整装配的 headless 与 CLI 快照 PR。
3. 创建 `review` PR，包含只读 diff 输入、问题 schema、严重度排序、位置和快照；在 Phase 3 落地前先限定于 working-tree diff。
4. 在增加单个 LSP 操作之前先创建 workspace-edit 事务 PR；每个操作分别拥有 provider 和场景覆盖。
5. 创建后续 action 与按阶段工具目录 PR，接入 registry、presentation 和 system prompt；它与事务 PR 相互独立，并测量 schema token 与错误工具选择。
6. 在迁移 Git 之前先创建 subprocess argv PR；之后依次增加结构化只读 Git 结果、branch/checkpoint 状态、冲突工作流和独立的 pull-request consumer。
7. 先创建项目检查，再创建依赖变更；把更新预览与安装或升级执行分开。
8. 将每个可靠性预算和 job/session resume 句柄做成独立且可观测的约定；不要把会话索引、LSP 缓存和轮次停止合并成一个无法审查的变更。
9. 按命令族拆分可运维性 PR——explain-config、plugin doctor、telemetry status、website 页面——不做共享运行时重构。
10. 在增加真实运行时 provider 之前，先创建 debugger 服务定义和确定性适配器 fixture。
11. 共享事件或结果发生变化时，在同一 PR 中完成 SDK 投影及其快照。

不要把 debugger、Git 变更、诊断解析、可运维性命令和大范围文档重写放进同一个 PR。只有所属 README、JSDoc、测试、快照和相关 Agent Note 都已更新，PR 才可以提交审查；独立的规划文档不能替代非机械实现所需的功能专属 Agent Note。

## 12. 立即执行清单

- [ ] 修正 `packages/lsp/lsp/src/types.ts`、`packages/lsp/tool-lsp/src/index.ts` 和所属 README 中的 LSP 操作描述；重新生成 `docs/subsystems/lsp.md` 的 type-equiv 块并重录配对。
- [ ] 修正 `packages/shell/tool-tasks/README.md` 中关于嵌套 workspace 的描述，并核对实现与配置约定。
- [ ] 在面向用户的文档中增加平台支持矩阵，包括 Windows PowerShell 和部分 ACL 执行说明。
- [ ] 恢复失同步的包 README 配对，并修复 `packages/mcp/mcp-servers/README.zh.md` 中的断链锚点。
- [ ] 增加示例覆盖清单，使未解释的可运行覆盖缺失在适当 CI lane 中失败。
- [ ] 在 Phase 0 评审中对第 3 节清单进行分诊，并为每个保留行建立 issue。
- [ ] 使用固定的 keyless fixture 集记录 Phase 0 指标基线。
- [ ] 定义结构化诊断结果和解析器适配器接口。
- [ ] 使用原始输出保留实现 TypeScript、ESLint 和 Vitest/Jest 诊断。
- [ ] 增加一个完整装配的失败到修复再到重跑 keyless 快照和一条 with-key 冒烟。
- [ ] 运行 `pnpm run doc-sync`、`pnpm run lint`、`git diff --check`、限定范围的诊断测试、所属快照 lane 和相关构建冒烟。
- [ ] 在开始 workspace-edit 事务之前评审 Phase 1 验收证据。

## 13. 建议的包布局

| 能力 | 建议位置 | 首个消费者 | 首个证明 |
| --- | --- | --- | --- |
| 结构化诊断 | `packages/shell/tool-tasks`，只有确认需要复用时再增加共享诊断包 | `test` 与 `build_check` 工具 | Headless 修复快照 |
| Workspace edit 事务 | `packages/lsp/tool-lsp` 与可复用应用 helper | `lsp` 应用操作 | Rename 与 code-action 快照 |
| 结构化 Git | `packages/shell/tool-git` 与 `packages/subprocess` | `git` 工具 | Diff 与冲突 fixture |
| 项目检查 | `packages/workspace` 或 `packages/fs` | `project_inspect` | 单包与 monorepo fixture |
| 依赖检查 | 新的 `packages/workspace/tool-dependency` 消费者 | `dependency` 工具 | Lockfile 预览快照 |
| 可靠性预算 | 现有所属包 | 现有工具和 agent loop | 限制与恢复快照 |
| 可运维性工具 | `apps/cli`、`website` 和每个被诊断界面的所属包 | `dsh --explain-config`、`dsh plugin doctor` | 针对损坏组合的 doctor fixture |
| Review 工作流 | 新的 `packages/shell/tool-review` 消费者，基于 Git seam | `review` 工具 | Working-tree 审查快照 |
| 后续 action 与阶段目录 | `packages/core/tools` 与 `packages/core/agent-tool-presentation` | `check`、`review` 和应用操作 | 阶段转换快照 |
| Pull-request consumer | 新的 `packages/vcs` 组 | `change_set` 与 `pull_request` 工具 | 本地 change-set fixture |
| Resume 与 handoff | `packages/jobs` 与 `packages/session` | `job` 与 `session` resume 工具 | 重启恢复快照 |
| Debugger | 新的 `packages/debug` 组 | `debug` 工具 | 确定性 DAP fixture |

建议位置是初始所属决定，不代表可以过早拆分能力 seam。共享类型应放在负责其语义的服务中。

## 14. 结果字段示例

结构化诊断结果应携带足以支持后续操作的稳定字段，不要把解析器特定文本作为主要 API；第 15 节把这些记录嵌入完整的工作流响应，本节拥有字段级约定：

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

Workspace-edit 事务应明确并发和恢复信息：

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

这些示例用于说明字段约定。实现必须使用仓库已有的 branded identifier、取消类型、事件 envelope 和 schema 约定，而不是把没有 brand 的字符串直接复制到公共 TypeScript API。

## 15. 市场导向的实施蓝图

首个产品增量是一组复用现有服务的高层工作流，而不是绕过它们。按 `project_inspect → check/review → edit/refactor → rerun → change-set` 顺序构建，同时保留低层工具作为显式 fallback，并将每个 action 保存在会话日志中。

### `check` 工作流

`check` 是结构化任务诊断的首个消费者。请求选择 `kind`、`workspace`、可选的 `filter`、`rerunFailed` 和 `watch`；结果返回 `status`、选定的 `adapter`、`exitCode`、`diagnostics`、`failedTests`、`rerunToken`、`rawOutputRef` 和已验证的后续 `actions`。适配器选择与解析后的 workspace 属于规范结果，因此回放不依赖再次发现它们。

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

首个实现支持 TypeScript、ESLint、Vitest/Jest 和一个 Python 适配器。解析失败时必须保留原始输出，并且绝不能把空的 diagnostics 数组当作命令成功。重跑 token 由一次 `check` 结果签发，限定在同一 workspace 和 check 类型内，且一次有效：已消费、过期或定义已变化的 token 会以明确原因失败，模型需重新发起检查。`check` 继承任务执行路径的沙箱与审批语义；升级运行携带与 `bash` 相同的理由约定。

### `review` 工作流

`review` 是只读的，使用规范化 diff 来源：先支持 working tree，commit、base-branch 和 pull-request change-set 模式在 Phase 3 落地结构化 Git 与 change-set consumer 后启用。结果包含确定性的按严重度排序的问题、可用时的位置、建议修复、相关测试、已审查文件数，以及明确的无问题或不可用状态。相关测试在 Phase 4 workspace 索引 import 图可用后由其推导；在此之前，仅当 diff 本身触及测试文件时 `review` 才报告相关测试。它不应用编辑，也不在没有独立编辑事务时把 provider 意见变成持久代码变更。

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

首个 review fixture 是 keyless 且确定性的。provider 驱动的 review 后续可以增加模型问题，但解析和位置语义必须无需模型 key 即可测试。

### 已验证的后续 action

每个高层结果都可以携带小型 action 词汇：`read`、`lsp`、`edit-preview`、`rerun` 和 `review`。action 只包含已验证的路径、位置、重跑 token 或事务 id。registry 和 presentation 层呈现 action，executor 在执行前重新校验所属关系、范围和版本。

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

Action 是建议性能力，不是绕过权限的路径。无效、过期或超出范围的 action 必须在执行前失败，并在规范结果中报告原因。

### 按阶段路由的工具目录

目录为当前阶段暴露少量高层工具，同时保留低层工具作为显式 fallback。探索阶段显示 `project_inspect`、`workspace_map`、`search`、`read` 和 `lsp`；修改阶段显示 `edit`、`multi_edit`、`refactor` 和相关 LSP 事务；验证阶段显示 `check`、`diagnostics` 和 `review`；交付阶段显示 `git`、`change_set` 和配置的 pull-request consumer。阶段转换要记录原因和可见工具集 hash。

路由实验测量 schema token 成本、错误工具选择、重复调用和固定任务集完成率。目录更小并不一定更好；如果它增加探索失败或隐藏必要 fallback，就不能算改进。

### 项目检查与 change-set 交付

`project_inspect` 返回 project kind、package manager、workspace roots、scripts、toolchain、entrypoints、generated/vendor/ignored roots 和 dependency graph 引用。`change_set` 返回 branch、base、commits、files、checks、review state、conflicts、next actions 和 rollback reference。`reviewState` 是封闭枚举——`draft`、`pending`、`approved`、`changes_requested`、`merged`、`closed`——provider 把原生状态映射到它，遇到未知状态时失败而不是强行转换。图与回滚引用是记录在会话日志中的 spill 定位器；目标缺失是明确错误，绝不是静默重算。本地 Git 实现负责这些值；GitHub 和 GitLab 集成通过 pull-request consumer 提供可选 provider。

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

### 本地 resume 与 handoff

`job` 和 `session` resume 基于持久句柄，而不是从内存中重新回放 prompt。只有当 owner、workspace identity、进程状态和清理状态仍一致时，句柄才有效。handoff 传递会话引用和待处理的下一步 action，不传递隐藏的进程权限。

首个本地实现不要求云端执行。远程 provider 以后可以声明相同的句柄约定，但必须报告 provider identity、网络状态以及 workspace 是本地还是临时环境。

### 运行时预算与重写契约

P0 运行时限制获得与高层工作流相同的契约对待：预算在执行前解析，每个预算携带自己的原因码，超限是明确结果而不是静默停止。

```json
{
  "reason": "budget_exhausted",
  "budget": "maxToolCalls",
  "limit": 40,
  "observed": 40,
  "continuation": { "kind": "new_turn", "resumeToken": "turn-42" }
}
```

越过预算的 Code Mode binding 只拒绝该一次调用，不丢弃整个程序：

```json
{
  "kind": "binding_output_limit",
  "tool": "fs_search",
  "bindingBytes": 12582912,
  "limitBytes": 8388608,
  "guidance": "extract the needed fields inside the program instead of returning the whole value"
}
```

输入重写是一条可审计记录，其字段一起落账，否则调用不执行：

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

### 市场导向的验收目标

- Phase 0：基线语料、其规范化方式和所属方均已记录，且第 3 节每一行都有 issue 或明确的移除说明。
- Phase 1：TypeScript、ESLint 和 Vitest fixture 达到至少 90% 的精确诊断提取率；定位与首次重跑阈值以第 5 节指标表为准。
- Phase 2：至少 95% 的语义编辑通过预览、版本检查和回滚测试；没有后续 action 含无法解析的路径或位置。
- Phase 3：fixture 中带空格的合法路径和通配 pathspec 100% 可用；冲突状态始终暴露 continue 或 abort；每个 mutation 都有 change-set 和 rollback reference。
- Phase 4：在参考任务集上，项目检查选择与现有任务运行器相同的适配器和 workspace；依赖预览绝不写文件；搜索位置可直接送入 `read` 和 `lsp`。
- Phase 5：进程重启后 resume 保留 owner 和状态，重试不重复已完成的副作用，配置预算产生结构化原因。
- Phase 6：用户无需读取包源码即可诊断常见插件、preset、skill、MCP、配置、telemetry 和平台症状；审批规则显示精确范围和过期时间。
- Phase 7：一个运行时完成 launch、breakpoint、inspect、evaluate、continue 和 disconnect，并清理进程。

### 测试责任矩阵

1. Headless 所属测试集证明 `check` 从失败到修复再到重跑、`review`、项目地图、job/session resume 和按阶段目录行为。
2. ACP 所属测试集证明 handshake、session、prompt、cancel、permission、JSON-RPC normalization，以及最小的 tool/check/review 协议场景。
3. Web 所属测试集证明 explain-config、plugin/preset/skills doctor、telemetry、产品恢复界面，以及 web-cordis 的真实 `dsh web --patch` 路径与 Cordis inspect、define、run、stop 行为。
4. web-schedule 负责 schedule 创建、删除、冷会话恢复、逾期处理、时区和 fork 隔离；mcp-memory 负责 fixture 支持的写入、新会话召回、隔离、环境过滤和重连。
5. jsonrpc-agent 负责 keyless 与 with-key 入口行为；Python 与 TypeScript SDK 为各自暴露的共享高级场景提供等价投影。
6. 构建产物 lane 证明 CLI 的 check/review/project-inspect/resume，以及构建后的 Web、MCP、schedule 和 Cordis overlay 验收。
7. 真实 API lane 只证明 provider/model 行为、with-key 多轮、文件写入和取消；CI 报告实际收集的测试数，使异常的全跳过运行失败。

### 竞争性实施结论

1. dsh 第一轮不需要复制 Copilot cloud environment 或 Cursor 的完整 IDE；应通过可回放的 Host 与 Client capability 暴露它们的成熟工作流。
2. 增加更多低层工具的价值低于 `check`、`review`、`project_inspect`、`workspace_map`、`resume` 和按阶段路由，因为这些工作流直接影响完成率。
3. dsh 可守住的定位是可组合、可审计、可回放、可自托管的 coding agent，而不是只追求模型入口数量的产品。

### 验证与交付

1. 同步更新英文文档及其中文对应版，然后运行 `pnpm run verify-translation-pairing --write docs/coding-capability-roadmap` 和限定配对检查。
2. 运行 `pnpm run verify-md-links`、`pnpm run verify-md-wrap`、`git diff --check` 和 `pnpm run verify-doc-budgets --list`；新路线图不得增加任何失败行。
3. 运行 `pnpm run doc-sync` 和 `pnpm run lint`；如果既有工作树失败仍存在，最终报告必须将它们与本路线图引入的错误区分开。
4. 文档在以下条件满足时完成：市场来源可追溯，每个差距都有所属阶段，每个高层工具都有输入/输出/失败/权限/回放定义，每个 PR 都有依赖和测试责任，每个阶段都有量化验收目标。

## 16. 阶段评审问题

- 这项变更是否缩短了从失败到精确下一步动作的时间？
- 失败路径是否呈现失败阶段、原因和下一步合法动作？
- 已验证的后续 action 是否只携带经过校验的路径、位置、token 和事务 id？
- 按阶段工具目录路由是否保持完成率，并保留必要的 fallback 可见？
- 模型是否可以从会话日志重建每个模型可见的值？
- 默认值、上限、审批范围和取消行为是否明确？
- 结构化解析失败时，结果是否保留原始证据？
- 外部文件或进程变化是否会 fail closed，而不是静默应用过期状态？
- 哪个包负责服务定义、provider、consumer、生命周期和回滚？
- 哪个完整装配示例证明用户可见行为，哪个协议示例证明 wire 行为？
- 共享行为在两种 SDK 中可见时，TypeScript 与 Python SDK 投影是否更新？
- 平台矩阵是否诚实说明前置条件和部分执行情况？
- 能否禁用或回滚该能力而不损坏会话日志或工作区？

当每个阶段都有所属方、依赖顺序、可观察验收证据和回滚点时，本计划即完整。计划本身不授权实现；每个阶段仍须遵循仓库的评审、测试、文档和发布控制。
