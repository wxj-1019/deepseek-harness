# Agent Note: 从用户 settings 文档组装 MCP 服务器

Status: implemented

[English](2026-08-20-mcp-servers-settings-composition.md) | 中文

## Problem

MCP 客户端桥接（`dsh-mcp-client`）功能完整——逐实例传输、重连监督、工具重同步——却不可达：没有任何 bundle 挂载它，所有表面都要为每个服务器手写 `cordis.yml` 行，且其已知限制把启动预算钉在 MCP SDK 的每请求默认值上。拥有三个 MCP 服务器的用户要手工编辑三个 loader 行，每次改动都要重启。

## Decision

**由管理器从用户 settings 文档组装既有行。** 新包 `dsh-mcp-servers` 是一个 loader group 行（`group: true`，继承 vendored `EntryGroup`）：`mcp` settings 段下的每个服务器成为子行 `mcp-servers:<name>`，其 config 为条目加上字典键 `serverName`。`EntryGroup.update()` 是事务性的，而 settings 字典按服务器逐条 merge——一次已提交的编辑只通过 loader 的配置差异路径重新应用一行（该服务器断开重连）。`disabled` 名单停用条目；env/header 值里的 `${NAME}` 从环境变量解析，未设置的引用跳过该服务器并报错，而不是把清空的密钥泄漏出去。

**base bundle 挂载该管理器一次。** Web、TUI、headless 都基于 base 组合；这遵循 `web`/`tool-web` 的跨表面能力行先例。不需要 `isolate`：管理器不发布服务，子 mcp-client 实例已通过其按 app 的名字预留集合强制命名空间唯一。

**管理器刻意避免 `loader.create()`。** 根 include 上的 `tree.write()` 会写回 profile 组合文件——正是 `PresetTree` 覆写 `write()` 为空操作所要规避的陷阱。自身作为 group 行还免费获得行级 HMR 与 plugin-inventory 可见性。

**`dsh-mcp-client` 新增 `startupTimeoutMs`（默认 60000）。** 初始连接 + 发现 + 注册现在与一个预算竞速；到期会关闭在途 generation，使失败走既有 `failOnStartupError`／重连路径。其 `Config` 重构为共享字段描述符并导出 `ServerEntryConfig`——不含 `serverName` 的服务器条目 union——管理器的 settings schema 原样复用而非重复字段。

## Consequences

- settings 驱动的 MCP 无需重启、无需 profile 行；手写的 `cordis.yml` 行在旁边照常工作（同一重复 `serverName` 载入期错误保护两种来源）。
- 一个显式致命（`failOnStartupError`）的服务器会把整次 group 更新回滚到上一个集合——loader 事务语义，作为管理器已知限制的第一条记录，而非在更新内部重新实现逐条目隔离。
- `verify-cordis-config` 门经由既有 `tsconfig.base.json` 的 `packages/mcp/*/src` paths 通配通过；新的 base 行从 base bundle 自身依赖解析。
- 证据：单元测试锁定 schema 解析、行组装、`disabled` 排除与 `${NAME}` 展开／跳过；loader 级集成套件通过 `dsh-app-boot` 以内存 settings provider 和无密钥 fixture server 启动真实组合，证明工具发现（`mcp__fixture__greet`）与已提交 settings 变更的免重启增删传播。

## Alternatives considered

**在 `dsh-mcp-client` 内部支持多服务器配置。** 否决：破坏"一实例一服务器"契约，把重复 `serverName` 检查从载入期挪进单个插件内部，并把连接监督与 settings 解析耦合。

**文档化 `$DSH_HOME/cordis.patch.yml` 的 insert 行。** 今天已经可用（HMR 监听、零代码），作为一次性挂载仍然有效，但它对全局 profile 生效、无校验，且结构上不适合想要逐服务器 merge 与停用名单的服务器列表。

**settings 命名空间消费者自行拉起连接。** 否决：绕过 loader，失去行 id、行级 HMR、事务性增删与 plugin-inventory 可见性——与让 agent presets 停留在 `Include` 挂载行上的理由相同。
