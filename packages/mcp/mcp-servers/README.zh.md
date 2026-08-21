# @deepseek-ai/dsh-mcp-servers

[English](README.md) | 中文

MCP 服务器组装管理器：为用户 settings 文档 `mcp` 段里声明的每个服务器挂载一个 [`@deepseek-ai/dsh-mcp-client`](../mcp-client/README.zh.md) loader 行，并让挂载集随已提交的 settings 编辑保持同步——无需重启，也无需为每个服务器写 `cordis.yml` 行。

## 用法

由 base bundle 以 group 行（`group: true`）挂载一次，因此所有表面（Web、TUI、headless）都会组合它。服务器写在 `$DSH_HOME/settings.yaml`：

```yaml
mcp:
  servers:
    github:
      transport: stdio
      command: npx
      args: ['-y', '@modelcontextprotocol/server-github']
      env:
        GITHUB_TOKEN: ${GITHUB_TOKEN}
    web:
      transport: streamable-http
      url: http://localhost:3000/mcp
      headers:
        Authorization: Bearer ${MCP_TOKEN}
  disabled:
    - web
```

`servers` 的每个键成为一个子行（`mcp-servers:<name>`）的 `serverName`，模型看到的工具名（如 `mcp__github__create_issue`）与手写 `cordis.yml` 行完全一致。settings 字典按服务器逐条 merge：一次已提交的编辑只会重新应用被改动的那一行——loader 的配置差异路径，对该服务器而言是断开重连——不影响其他服务器。`disabled` 下的名字将对应条目停用而不删除。

`env` 和 `headers` 值里的 `${NAME}` 在组装时从环境变量解析；未设置的引用会让该服务器跳过并报错，而不是把清空的密钥泄漏给子进程或请求。

## 配置

插件本身没有 config；`mcp` settings 段即契约。服务器条目字段与 mcp-client 行相同，仅少一个 `serverName`（由字典键提供）：见 [mcp-client Config 表](../mcp-client/README.zh.md#config)。

| 字段 | 必填 | 说明 |
|---|---|---|
| `servers` | 否 | 以 `serverName`（`[A-Za-z0-9_-]{1,32}`）为键的服务器字典；每个值是一个 mcp-client 服务器条目 |
| `disabled` | 否 | 被排除在组装之外的服务器名；条目保留以便日后重新启用 |

## 行为

- 激活时：注册 `mcp` settings 命名空间，组装启用的行，并通过 loader group 的事务性更新应用。设置了 `failOnStartupError` 的服务器可能让该更新被拒绝——loader 会将整组回滚到上一个集合，与 mcp-client"启动失败仅在显式要求时致命"的契约一致。
- 已提交的 settings 变更时：重新组装并事务性换受影响的子行。从字典移除（或加入 `disabled`）的名字会卸载并注销其工具。
- 销毁时：卸载所有已组装的行。
- 服务器名不匹配模式，或 `${NAME}` 引用未设置：跳过该服务器并记录错误；其余服务器照常应用。

## 消费的服务

| 服务 | 用途 |
|---|---|
| `ctx.settings` | 拥有 `mcp` 命名空间；监听已提交的变更 |
| `ctx.loader`（经 group 行） | 子行的事务性生命周期 |

## Model Experience

### 组装出的 MCP 服务器工具

#### What the model sees

每个启用的 settings 服务器贡献的内容与手写行完全一致：所有以 `mcp__<serverName>__<rawName>` 命名的工具，携带服务器提供的描述和输入 schema。一次已提交的 settings 编辑增删服务器时，工具集从下一个组装边界开始变化；被停用（`disabled`）的服务器的工具消失。

#### Token effect

与手工挂载的行完全一致：每个已注册工具的定义在其注册期间出现在每次请求上。管理器自身不添加任何提示文本。

#### KV Cache effect

未变化的服务器保持逐字节一致的工具定义（名字是 settings 键与原始名字的纯函数），其前缀保持稳定；增删或编辑任何服务器的条目会替换该服务器的定义，并可能使复用从第一个变化的 schema token 起失效。

## 已知限制与遗留工作

- **一次提交内逐服务器原子编辑** —— settings 字典按服务器 merge，但一次改动多个服务器的提交会在一个事务性 group 更新里应用；一个显式致命（`failOnStartupError`）的服务器会回滚整个更新而不是跳过。
- **暂无设置 UI 卡片** —— `mcp` 段靠文件编辑；需要时 Web 设置卡可复用同一命名空间。
- **继承 mcp-client 的遗留工作** —— Resources/Prompts 未桥接，Streamable HTTP 断连按调用重试而非经 supervisor；见 [mcp-client 限制](../mcp-client/README.zh.md#known-limitations-and-deferred-work)。
