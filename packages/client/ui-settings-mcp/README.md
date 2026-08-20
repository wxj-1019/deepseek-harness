# @deepseek-ai/dsh-client-ui-settings-mcp

English | [中文](README.zh.md)

MCP servers settings card for the DeepSeek Harness Web UI: the `mcp` settings namespace's server list rendered in the Plugins settings section's configurable tab, with enable/disable parking, add/edit forms, and removal — every write a revision-fenced path-op mutation, so edits apply without a restart (the composing manager watches the same namespace).

## Usage

Mounted by the web-app bundle. The card appears when the `mcp` namespace is served (it is, by `@deepseek-ai/dsh-mcp-servers` in the base bundle). Each server row shows its name, transport, and parking state; the add/edit form switches its field set on the transport select (stdio: command/args/env/cwd; streamable-http: url/headers) with the timeouts, `failOnStartupError`, under an Advanced fold. `env`/`headers` values may reference the ambient environment as `${NAME}` — they are stored verbatim and resolved at composition time by the manager.

## Model Experience

### Composed server tools

#### What the model sees

Nothing directly: the card edits the same settings entries the composing manager turns into `mcp__<serverName>__<rawName>` tools. Adding, parking, editing, or removing a server changes that server's tools from the next composition boundary.

#### Token effect

Indirect: identical to editing `settings.yaml` by hand — every registered tool's definition rides requests while registered; the card adds no prompt text of its own.

#### KV Cache effect

Indirect: an unchanged server keeps byte-identical tool definitions; any edit to its entry replaces that server's definitions and may invalidate reuse from the first changed schema token.

## Known Limitations and Deferred Work

- **No reconnect-policy editor yet** — the Advanced fold carries the timeouts and `failOnStartupError`; the `reconnect` sub-policy stays `settings.yaml`-only until a card design for it exists.
- **Name edits re-key the entry** — the form disables the name field on edit (a rename would orphan the parked `disabled` reference); rename is add-plus-remove.
