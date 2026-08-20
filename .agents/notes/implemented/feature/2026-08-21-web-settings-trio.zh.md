# Agent Note: MCP 设置卡、启动进度文本与按路由重试控制

Status: implemented

[English](2026-08-21-web-settings-trio.md) | 中文

## Problem

三个产品缺口叠在 rc.8 的基础之上。MCP 服务器组装已由 settings 驱动却只能改文件——手工编辑 `$DSH_HOME/settings.yaml`。启动页只有一条光秃秃的弧，没有计数也没有身份，整个 prefetch 窗口里卡死的启动与健康启动毫无区别。而按提供方的 `retryPolicy` 字段在两个 LLM settings 命名空间里早已存在（e2e 端到端写入过），却没有任何表面渲染它。

## Decision

**MCP 卡走外部卡片模式 + 路径操作写入。** 新浏览器包（`dsh-client-ui-settings-mcp`）以被服务的 `mcp` 命名空间为键注册进插件可配置标签页；控制器把命名空间快照投影成排序的服务器列表，并发出带版本围栏的 `settings.mutate` 路径操作（增改 `set ['servers', name]`、删 `unset`、停用 `set ['disabled']`）——即 Models 页先例，因为 `CardForm` 只寻址顶层标量。表单镜像组装契约（按传输切换字段集、`SERVER_NAME_PATTERN` 加占用名校验、`${NAME}` 环境引用原样存储）；该段不携带任何密钥。

**启动进度补上缺失的两个维度。** 启动页现在在提示下渲染 `完成/总数 · 最后激活短名`，并把首轮 prefetch 的完成计入同一条弧——数据全部来自内核本就消费的 `internal/status` 事件；`shortEntryName` 把 harness 客户端包名压缩到可区分段。纯展示层：无协议变化、无启动顺序变化。

**重试控制复用既有字段。** Models 页 ProviderEditor 的自定义区新增一个数字字段，写入 `{ retryPolicy: { mode: 'normal', maxRetries } }`，走编辑器既有的 draft/pathOps 管线；写入合并进 draft 的策略对象，手写的 backoff 或 `mode: 'always'` 得以保留，清除只移除计数。不加新命名空间、不加执行器设置——设计记录保持 backoff 与可重试码仅限配置文件。

## Consequences

- MCP 服务器可从 Web UI 完整管理；实时生效来自命名空间自身（组装管理器在提交时重新应用被改动的行），卡片无需重启提示。
- 启动弧不再在 prefetch 期间冻结，卡住的条目在终审触发前就能按名字识别。
- 提供方的重试次数与其他旋钮在同一处可编辑；端到端写 `retryPolicy` 的 e2e 已证明适配器重注册路径。
- `tsconfig.base.json` 为 `ui-settings-mcp` 与 `ui-desktop-notify` 增加显式 paths（后者是潜在缺口——其 bundle 行的源码启动解析从未被映射）。

## Alternatives considered

**schema 驱动的 MCP 表单。** 否决：schema-form 包是模型层而非渲染器；仓库惯例是手写精选控件（Models 页为先例）。

**用 `CardForm` 编辑服务器字典。** 否决：其 `set`/`unset` 只寻址顶层标量字段；字典条目需要路径操作。

**部署级重试设置。** 双重否决：重试策略设计记录已否决 LLM 部署级默认而取路由持有策略；执行器刻意无配置。
