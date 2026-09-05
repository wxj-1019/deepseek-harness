# 组件库插件设计

[English](component-library-plugin.md) | 中文

一个一等公民插件：学习仓库中的 UI 组件，沉淀为组件库，并让 AI 在生成 UI 代码时复用。插件是标准能力接缝——宿主扫描与存储、面向模型的工具、技能通道、客户端面板。每一层都落在既有接缝上，不改动 agent loop。

## 1. 目标与范围

本插件闭合的循环：从代码库发现组件或样式模式 → 持久化进可查询的库 → 模型在写 UI 时检索 → 代码库变化时持续学习。

范围：先做组件级学习（React 组件 + props），样式 token 清单作为生成约束，生成前模型检索，文件变化时持续刷新。第一迭代不做：视觉截图 diff、运行时组件渲染沙箱、组件库本身的上游分发（npm 发布）。

组件库是项目级的：从本仓库的 `packages/client` 树学习，服务本仓库的后续 UI 工作。跨项目共享（在 A 仓库学习、在 B 仓库复用）不在第一迭代范围内。

## 2. 架构总览

四层，各走一条既有接缝：

```
Learn (Host)         Persist (Storage)          Consume (Model + UI)
─────────────        ────────────────          ──────────────────────
scanner.ts        →  storage-domain           →  component_query / component_record tools
chokidar watcher     domain "component_library"    SkillProvider (skill catalog)
                     (JSON backend)               settings.plugin.item panel
```

- **学习**：宿主扫描器从 `packages/client/*/src/client` 提取组件记录，并用借自 `skill-filesystem` 的 chokidar 管线监听变化。
- **沉淀**：名为 `component_library` 的 `storage-domain` 域保存组件记录；持久化写触发 `domain/changed` 事件让面板重取。
- **消费**：两个模型工具（`component_query`、`component_record`）加一个 `SkillProvider` 摘要文档，以及一个供人工审查的 `settings.plugin.item` 卡片。

## 3. 包划分

两个包，按宿主/客户端配对惯例：

| 包 | 职责 | 关键接缝 |
| --- | --- | --- |
| `packages/storage/component-library` | 宿主：扫描器、监听器、存储域、模型工具、技能 Provider | `storage-domain`、`tools`、`skills` |
| `packages/client/ui-component-library` | 客户端：设置卡片（之后可升级为浏览视图） | `settings.plugin.item`、`storage-domain` 远端读取 |

宿主包拥有域 schema 与学习管线。客户端包只负责呈现，经域的远端面读取。bundle 接线与每个 client 功能相同的两步：`web-app/package.json` 依赖加 `web-app/cordis.patch.yml` 插入行。

## 4. 数据模型

### 组件记录（每个学到的组件一条）

```json
{
  "id": "ui-usage/UsageSection",
  "pkg": "@deepseek-ai/dsh-client-ui-usage",
  "name": "UsageSection",
  "path": "packages/client/ui-usage/src/client/UsageSection.tsx",
  "props": [
    { "name": "useSessions", "type": "SnapshotSelectorHook<SessionListState>", "required": true }
  ],
  "tokens": ["--dsw-alias-label-primary", "--dsw-alias-bg-layer-1"],
  "jsdoc": "The Usage view body: per-session token accounting dashboard.",
  "example": "…a short usage snippet extracted from the first host spec…",
  "updatedAt": 1787767305030
}
```

- `props` 从组件的 props 类型提取，不从调用点推断。
- `tokens` 是该组件自身 CSS module 引用的 `--dsw-*` 变量集合。
- `example` 可选：存在时取自最近的测试文件挂载调用，否则取 JSDoc 的 `@example` 块。

### 存储域 schema

域的 zod 组件记录表：

```ts
const ComponentRecord = z.object({
  id: z.string().required(),
  pkg: z.string().required(),
  name: z.string().required(),
  path: z.string().required(),
  props: z.array(z.object({
    name: z.string().required(),
    type: z.string().required(),
    required: z.boolean().default(false),
  })).default([]),
  tokens: z.array(z.string()).default([]),
  jsdoc: z.string().default(''),
  example: z.string().default(''),
  origin: z.enum(['scanned', 'model']).default('scanned'),
  propsInferred: z.boolean().default(true),
  rawProps: z.string().default(''),
  reviewed: z.boolean().default(false),
  updatedAt: z.number().default(0),
})
```

### 样式 token 清单（生成约束语料）

扫描器同时解析 `packages/client/ui-theme/src/styles/design-platform.css` 为 token 列表：`{ name, value, tier: 'static' | 'alias' | 'specific' }`。产出为参考文档而非数据表。

## 5. 学习管线

### 5.1 静态扫描（冷启动）

用受限 glob 遍历 `packages/client/*/src/client`；逐 `.tsx` 文件：

1. 用 TypeScript 编译器 API（`ts.createSourceFile` + `ts.forEachChild`）解析 `export function Name` 与 `export const Name =`（首字母大写）声明。
2. 对每个组件按序解析 props 类型引用：存在 `NameProps` 接口则用，否则取 `props:` 参数的内联类型，再否则取同文件的 `Props` 导出。成员名、required 标记与渲染类型串取自解析结果的成员。
3. 读同基名的 `*.module.css`，收集 `--dsw-*` 引用。
4. 每个组件产出一条记录；解析失败的文件记日志跳过，绝不中断。

扫描器是纯静态分析——不执行组件，CSS 导入与 JSX 都不求值。

### 5.2 持续学习（监听）

镜像 `skill-filesystem` 的 `SkillWatchManager`：对 `packages/client` 起一个 chokidar 监听，200ms 稳定性阈值、项目根 LRU 驱逐、变更后经 `invalidate()` 回调重提受影响文件。只有 `.tsx` 与 `*.module.css` 事件生效。

一次写入落组件记录到存储域并发出 `domain/changed`，客户端面板据此重取。

### 5.3 模型驱动的学习

`component_record` 让模型在创建组件后回写记录（通常在会话任务中）。记录形状相同；`origin: 'model'` 标记供审查，且天生 `reviewed: false`。未审核的模型记录在 `component_query` 结果中被隔离，直到人工在面板上通过（`component-library` settings 命名空间的 `includeUnreviewed` 开关会把它们列入，排在最后）。这一审查环节把幻觉条目挡在持久集外。

## 6. 面向模型的工具

工具名用 snake_case（`component_query`、`component_record`），而非本文档早期草稿中的点号写法：OpenAI 兼容的函数名不允许点号，且 harness 中所有工具都遵循 snake_case。

### `component_query`

检索匹配的组件记录。参数：`query`（自由文本：名称、包名或用途关键词）、`pkg`（可选过滤）、`limit`（默认 10）。第一迭代排名用纯字符串计分：名称精确匹配优于包名匹配，包名匹配优于 jsdoc 关键词，扫描记录优于模型贡献记录。输出 schema：`{ matches: [{ name, pkg, path, props, propsInferred, rawProps, tokens, example }] }`；props 类型未解析的匹配携带 `propsInferred: false` 与 `rawProps` 中的原始类型文本，`render` 将该文本标记为 unresolved 呈现，而不是空 props 列表。

### `component_record`

写入模型贡献的记录。参数：`name`、`pkg`、`path`、`props`（`{name, type, required}` 数组）、`tokens`、`jsdoc`、`example`。path 会被归一化为仓库相对的 POSIX 形式，未指向 `packages/client` 内文件的路径以 `invalid-record` 拒绝，因此派生的 id 始终落在扫描器的 id 空间内。写入经域 schema 校验并打上 `origin: 'model'`。

两个工具都在宿主包插件里 `ctx.tools.register(defineTool(...))` 注册，随后自动进入所有可用模型的系统提示，无需额外上架。Web 端转录卡片经 `ui-tool` 的 `tool.call.toolview` 槽渲染，与其他工具一致。

### 6.3 模型引导

仅注册工具并不能保证模型会去用组件库。因此插件还经 `systemPrompt.section({ name, order, text })` 挂一段系统提示（与 `app-boot` 的 harness 源码段同一条接缝）：一段简短指令——写 UI 代码前先为目标区域调用 `component_query`，优先复用已扫描组件与 token 语料而非新造原语。这使复用成为默认行为而非可选行为。

技能通道（§7）仍是可选的长文方案；系统提示段是始终生效的基线。

## 7. 技能通道

注册名为 `component-library` 的 `SkillProvider`，物化单个技能 `component-library`，其 `SKILL.md` 正文由域生成：一段简介、token 分层约定、高频组件清单。Provider 的 `list()` 返回摘要条目；`get()` 按需生成正文。偏好长文档指引的模型经既有技能工具加载，不必反复调用 `component_query`。

## 8. 客户端面板

一个 keyed 的 `settings.plugin.item` 卡片（`key: 'component-library'`）渲染库摘要：组件数、最近更新行、搜索框。照 AquaPluginCard / McpCard 模式（以 `store`、`locale`、`inject` 注册；订阅域的 `changed` 事件做实时刷新）。后续迭代可升级为仿 Git 提交轨道视图的 `conversation.view` 标签。

## 9. 实施计划

1. **骨架**：两个包的 manifest、tsconfig、tsdown、invariant 伴生与双语 README。`pnpm run gen-tsconfig-paths` 自动补别名；`web-app/package.json` 加两个依赖，`web-app/cordis.patch.yml` 加两条插入行。
2. **存储 + 静态扫描**：域、TypeScript-API 提取器、`packages/client` 冷启动播种。
3. **模型工具**：`component_query` 与 `component_record`，带 wire schema 与转录渲染。
4. **客户端面板**：keyed 设置卡片与实时刷新。
5. **监听器 + 技能 Provider**：持续学习与技能通道。
6. **打磨**：检索评分、从 spec 提取示例、面板的审查控件。

每阶段随单测与 Agent Note 落地；工具稳定后，keyless 快照套件补一条 `component_library` 遍历录制。

## 10. 测试策略

- 扫描器：包内 `tests/` 下的 fixture 目录放构造的 `.tsx` + `.module.css` 对；断言每文件记录。
- 存储：以 scratch `DSH_HOME` 开域；put/get/update 往返与 `domain/changed` 发出。
- 工具：在 cordis 上下文里用脚本化存储后端跑宿主插件；调两个工具并断言 wire 形状。
- 面板：jsdom 用桩远端 scope 渲染；断言卡片列条目且搜索过滤生效。

## 11. 风险与缓解

- **提取保真度**：静态 props 提取读不对条件/判别联合；props 类型太动态时记录保留原始类型文本，模型仍有契约可查。此类记录标 `propsInferred: false`，检索结果中降权。
- **示例质量**：测试挂载片段是最佳示例但会漂移；记录带 `updatedAt`，陈旧示例可见并可刷新。
- **模型幻觉记录**：`origin: 'model'` 记录先隔离，待人工在面板确认；查询结果把它们排在扫描记录之下。
- **监听成本**：chokidar 在 `packages/client` 上受 200ms 稳定性阈值与按文件重提约束，闲置时零成本。
- **门禁债**：每个新包从第一天起就要满足 hygiene 门禁（invariant 伴生、manifest 版本/files、依赖分类）——合并收敛修复是模板。

## 12. 验收标准

- `component_query` 在 scratch profile 的 `packages/client` 播种扫描后返回匹配记录。
- 设置卡片列出播种的组件并在 `domain/changed` 时刷新。
- 生成的技能正文经技能工具加载无格式错误。
- 录制的 keyless 遍历可回放：扫描 → 查询 → 记录 → 面板刷新。
- `pnpm run hygiene` 在两个新包存在时通过。
- 在用户请求 UI 工作的录制会话里，模型在写组件代码前调用 `component_query`（由 keyless 快照的事件日志证明）。
