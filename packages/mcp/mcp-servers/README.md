# @deepseek-ai/dsh-mcp-servers

English | [中文](README.zh.md)

MCP server composition manager: mounts one [`@deepseek-ai/dsh-mcp-client`](../mcp-client/README.md) loader row per server declared under the `mcp` section of the user settings document, and keeps the mounted set in step with committed settings edits — no restart, no per-server `cordis.yml` rows.

## Usage

Mounted once as a group row (`group: true`) in the base bundle, so every surface (Web, TUI, headless) composes it. Servers live in `$DSH_HOME/settings.yaml`:

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

Each `servers` key becomes the `serverName` of one child row (`mcp-servers:<name>`), so the model sees `mcp__github__create_issue` and friends exactly as with hand-written `cordis.yml` rows. The settings dictionary merges per server: one committed edit re-applies only the changed row — the loader's config-diff path, a disconnect + reconnect for that server — and never touches the others. A name under `disabled` parks its entry without deleting it.

`${NAME}` in `env` and `headers` values resolves from the ambient environment at composition time; an unset reference skips that server with an error instead of leaking an emptied secret into the child process or request.

## Config

The plugin itself has no config; the `mcp` settings section is the contract. Server entries carry the same fields as one mcp-client row minus `serverName` (the dictionary key supplies it): see the [mcp-client Config table](../mcp-client/README.md#config).

| Field | Required | Description |
|---|---|---|
| `servers` | no | Server dictionary keyed by `serverName` (`[A-Za-z0-9_-]{1,32}`); each value is one mcp-client server entry |
| `disabled` | no | Server names excluded from composition; entries stay for a later re-enable |

## Behavior

- On activation: registers the `mcp` settings namespace, composes the enabled rows, and applies them through the loader group's transactional update. A server whose `failOnStartupError` is set can reject that update — the loader rolls the group back to the previous set, matching the mcp-client contract that startup failure is fatal only when explicitly requested.
- On committed settings change: re-composes and transactionally swaps the affected child rows. Names removed from the dictionary (or added to `disabled`) unmount and unregister their tools.
- On disposal: unmounts every composed row.
- A server name failing the pattern, or an unset `${NAME}` reference, skips that server with a logged error; the other servers still apply.

## Services consumed

| Service | Usage |
|---|---|
| `ctx.settings` | Owns the `mcp` namespace; watches committed changes |
| `ctx.loader` (via the group row) | Transactional child-row lifecycle |

## Model Experience

### Composed MCP server tools

#### What the model sees

Each enabled settings server contributes exactly what a hand-written row would: every tool under `mcp__<serverName>__<rawName>` with the server-provided description and input schema. A committed settings edit that adds or removes a server changes the tool set from the next composition boundary; a parked (`disabled`) server's tools disappear.

#### Token effect

Identical to hand-mounted rows: every registered tool's definition is present on every request while it is registered. The manager adds no prompt text of its own.

#### KV Cache effect

An unchanged server keeps byte-identical tool definitions (names are pure functions of the settings key and raw name), so its prefix stays stable; adding, removing, or editing any server's entry replaces that server's definitions and may invalidate reuse from the first changed schema token.

## Known Limitations and Deferred Work

- **One server entry edits atomically per commit** — the settings dictionary merges per server, but a single commit that changes several servers applies them in one transactional group update; one explicitly-fatal (`failOnStartupError`) server rolls the whole update back rather than skipping.
- **No settings-UI card yet** — the `mcp` section is file-edited; a Web settings card would ride the same namespace when needed.
- **Inherits mcp-client's deferred work** — Resources/Prompts are not bridged, and Streamable HTTP outages retry per call rather than through the supervisor; see the [mcp-client limitations](../mcp-client/README.md#known-limitations-and-deferred-work).
