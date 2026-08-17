# `@deepseek-ai/dsh-client-ui-settings-dev-checks`

[English](README.md) | 中文

浏览器插件：注册"开发校验"设置页——基于 `dev-checks` 设置命名空间的六个本机开关，用于收窄本机的重型例行质量检查：真实 API 的 e2e 套件、插桩覆盖率运行、免 key 快照回放、doc-sync 聚合、agent 按需选择的构建/卫生证据，以及 lefthook pre-push 的 typecheck。宿主半注册该命名空间；页面为每个检查渲染一个开关行，并经 settingsScope 传输写入，每次切换都以携带命名空间修订号的最小 `settings.mutate` 路径操作落盘。

同一份设置文档（`$DSH_HOME/settings.yaml`）由仓库侧的门禁包装器（`scripts/dev-check-run.ts`）读取；日常的 `test:e2e`、`test:coverage`、`test:snapshot`、`doc-sync` 脚本与 pre-push 钩子都经过它。所有开关默认开启：文件或配置段缺失时每个门禁照常运行，`CI=true` 强制全部开启，显式全量入口（`check:all`、`test:snapshot:record/refresh`）从不读取这些开关——本机偏好永远不会收窄 CI 证据。脚本侧的键清单由 `scripts/dev-checks.spec.ts` 与本包的 schema 锁定一致。

## 模型体验

无；本页面渲染浏览器配置界面，开关作用于开发侧质量检查，不涉及提供方请求。

#### KV 缓存影响

无；本包既不组装也不发送提供方请求。

## 已知限制与待办

- **仅本机语义**——开关保存在每机的设置文档中而非仓库里；新机器在手动切换前会运行全部门禁。
- **构建/卫生开关仅作建议**——`buildHygiene` 只指导 agent 的检查选择；构建脚本本身不加拦截，因为其他门禁依赖其产物。
