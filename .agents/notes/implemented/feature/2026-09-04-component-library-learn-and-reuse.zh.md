# Agent Note: 组件库学习检出的 UI 组件供模型复用

Status: implemented

[English](2026-09-04-component-library-learn-and-reuse.md) | 中文

## Problem

harness 的 Web UI 在 `packages/client` 里持续增长组件，但编写新 UI 代码的模型无法发现已有成果：它会重造原语、臆测 `--dsw-*` 设计令牌词汇。已评审的设计（docs/component-library-plugin.md）闭合这个回路：把组件从检出学习进可查询的组件库，让模型在生成 UI 前检索，并随文件变更持续学习。

## Decision

两个新 workspace 包加组装接线，在既有 seam 上实现设计文档的四个层次：

- **`packages/storage/component-library`**（`@deepseek-ai/dsh-component-library`）：Host 侧所有者。一个 Cordis 服务插件（`ComponentLibraryService`，Typert Remote 服务）打开 `component_library` 存储域（组件记录的 zod 表，JSON 后端）并编排：TypeScript AST 抽取器（导出的 PascalCase 组件；props 依次取自 `<Name>Props`、参数标注、导出的 `Props` 类型；同基名 CSS module 的 `--dsw-*` 引用；用法示例取自最近的 spec 挂载或 JSDoc `@example`）、`packages/client/*/src/client` 的冷启动扫描、chokidar 监听器（200 毫秒稳定阈值；只处理 `.tsx` 与 `*.module.css` 事件）、两个模型工具、常驻系统提示词段落（`component-library:reuse`，位次 `TOOL_COMPONENT_LIBRARY` = 2950）、生成的 `component-library` skill，以及 `component-library` settings 命名空间。每次持久写入在 domain 提交后广播 `component-library/changed`；不变量伴随会判定任何不尾随 domain 写入的广播为失败。
- **`packages/client/ui-component-library`**（`@deepseek-ai/dsh-client-ui-component-library`）：设置卡片（`settings.plugin.item`，键 `component-library`），含已学习计数、客户端搜索，以及模型贡献记录的通过/丢弃审核控件。它经生成的 Remote 面读取，惰性加载，并在推送的变更事件与连接重置时收敛。
- **接线**：`dsh-web-app` 的依赖与两条 `cordis.patch.yml` 插入行；`component-library/changed` 加入 `dsh-api-remotes` 的转发事件白名单，后者同时挂载该 Remote 贡献。

对设计文档的偏差，均已回写文档：

- 工具名是 `component_query` / `component_record`，而非点号的 `component.query` / `component.record`：OpenAI 兼容函数名不允许点号，且 harness 所有工具都是 snake_case。
- 记录 schema 增加 `rawProps`（props 类型对无 checker 抽取过于动态时保留的原始类型文本）与 `reviewed`（面板审核步骤翻转的隔离标记）。
- token 分层词汇是 `static | alias | specific`，与 `design-platform.css` 的实际命名一致；文档原写的 `role` 在样式表中不存在。
- 扫描器测试 fixture 放在 `fixtures/`（而非 `tests/`）：根 vitest 模式 `packages/*/*/tests/**/*.spec.{ts,tsx}` 会把名为 `*.spec.tsx` 的 fixture 当作真实测试执行。

## Alternatives considered

- **复用 `skill-filesystem` 的 `SkillWatchManager`**——否决：该类是模块私有的，且其过滤器是 SKILL.md 专用的，因此监听器复制它的 chokidar 配置（200 毫秒阈值、`atomic`、`awaitWriteFinish`）并换成 `.tsx`/`*.module.css` 过滤器。
- **用完整 TypeScript checker（`ts.Program`）解析 props**——首个迭代否决：无 checker 的 AST 抽取让扫描廉价且无副作用；无法解析的类型降级为原始文本并标记 `propsInferred: false`，而不是给出可能误导的残缺成员列表。
- **暂不接入 `gen-tool-catalog`**——接受：该目录的组合环境要仅为两份 schema 额外装配存储三件套与 settings provider。目录门禁以 `tool-*` 包名为键，本包不在其列，新鲜度保持绿色；接入留作后续项。

## Consequences

- `dsh web` 启动即带组件库：冷扫描播种 domain，监听器保持新鲜，每个可用模型都看到复用指令与两个工具。
- 模型记录在通过 Plugins 设置卡片的人工审核前对查询不可见（`includeUnreviewed` 可选择列入并排在最后）。
- 按设计文档的实施计划，免密钥录制会话 walkthrough（扫描 → 查询 → 记录 → 面板刷新）推迟到工具稳定之后。
- 沿途修复的两处 master 既有破坏各自独立成提交：git-graph 的 `GraphLogEntry` 局部导入，以及 usage-ledger 价格字段缺失的 JSDoc。
