# 三功能开发：MCP 设置卡 + 启动进度优化 + 重试策略 UI

## 功能 1：模型重试策略定制（最小，先做）

**现状**：`retryPolicy` 字段已存在于 `llm-deepseek`/`llm-pi-ai` settings namespaces（`packages/llm/llm/src/retry-policy.ts:14` 默认 5 次），adapters 在 settings 变更时原子重注册——**零 host 改动，纯 UI**。

**改动**（`packages/client/ui-settings-models/`）：
- `ProviderEditor.tsx` 的 collapsed "Customized settings" 区域加 `maxRetries` 数字字段
- 写入 `{ retryPolicy: { mode: 'normal', maxRetries: N } }`，走现有 `pathOps` + `settings.mutate` 路径
- v1 只暴露 count；`backoff`/`retryableCodes`/`mode: 'always'` 保持 config-only（设计记录明确拒绝 executor 级设置）
- locale 双语文案 + spec 更新

## 功能 2：插件加载进度优化（小）

**现状**：`packages/client/web/src/boot-page.ts` 只有一个 CSS 弧（72°→288°），无文字计数、无插件名、prefetch 阶段弧冻结。

**改动**（`packages/client/web/`）：
- boot-page 显示 **"k/N"** 计数 + **最后激活的插件短名**（复用 `PluginInventorySettingsTab` 的 moduleShortName 压缩思路）
- 数据已在 `internal/status` 事件流里（`boot.ts:102-106` 已订阅但只计一个数）——纯展示层改动
- prefetch 阶段计数纳入弧（关闭盲窗 a）
- 更新 `boot-page.client.spec.ts` 断言

## 功能 3：Web UI MCP 设置卡（最大，后做）

**设计**（遵循 Aqua 外部卡片模式 + Models 页 path-ops 先例）：

**新包 `packages/client/ui-settings-mcp/`**（browser half）：
- `src/client/index.ts`：`ctx.slots.register({ name: 'settings.plugin.item', key: 'mcp', ... })`——Host 已 serve `mcp` namespace，tab 自动派发卡片
- Controller：`settingsScope.bind({ namespace: 'mcp' })` + `api.settings.mutate({ ns: 'mcp', ops, expectedRevision })`
- `McpCard.tsx`（复用 `PluginCard` chrome）：
  - 服务器列表：每行名字/transport 徽标/启停 toggle/编辑/删除
  - 添加/编辑表单：dict key 用 `SERVER_NAME_PATTERN` 校验 + taken 冲突检查 + `expectedRevision` 围栏（CustomProviderCard 模式）
  - transport select 切换字段集：stdio（command/args/env/cwd）vs streamable-http（url/headers）
  - 高级旋钮（toolCallTimeoutMs/startupTimeoutMs/failOnStartupError/reconnect）折叠 `<details>`
- 写入语义：编辑 `set ['servers', name]`、删除 `unset ['servers', name]`、停用 `set ['disabled'] [...names]`（保留条目）
- env/headers 是 `${NAME}` 引用——纯文本输入（无需 SecretField）
- 双语 locale + client spec

**接线**：`packages/bundle/web-app/` package.json deps + cordis.patch.yml 插 `ui-settings-mcp` 行

## 执行顺序与检查

1. **功能 2**（boot 进度，~小时级）→ vitest `packages/client/web`
2. **功能 1**（重试 UI，~小时级）→ vitest `packages/client/ui-settings-models` + 相关 e2e golden 刷新
3. **功能 3**（MCP 卡，~天级）→ 新包 + vitest + web-app 接线 + `verify-cordis-config`
4. 收尾：typecheck + lint + doc-sync（README 双语、note、预算）+ 提交推送 mine

## 风险

- MCP 卡的 dict 编辑不能走 `CardForm`（只支持顶层标量）——必须用 path-ops（Models 先例），这是最大的工作面
- Models 页 e2e golden 可能因新字段变化——需刷新（改 obsolete behavior 与测试一起）
- boot-page 的 React 水合交接（BootHandoff）对 DOM 结构敏感——k/N 文本节点必须在交接时稳定