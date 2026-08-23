# client/ — web-GUI browser half

English | [中文](README.zh.md)

The browser side of the dsh web GUI: shell boot, browser-host communication, shared UI services, and feature plugins. Authoring rules live in [AGENTS.md](AGENTS.md); the host half is [`host/`](../host/README.md). All except `test-runtime` are **product** packages named `@deepseek-ai/dsh-client-<name>`.

| Package | Purpose |
|---|---|
| [`web/`](web/README.md) | Boots the browser shell from the client entry graph. |
| [`ui-renderer/`](ui-renderer/README.md) | Binds slot data to React and mounts the assembled application after client boot settles. |
| [`modules/`](modules/README.md) | Loads browser-side client modules. |
| [`connection/`](connection/README.md) | Maintains browser-host RPC communication and event delivery. |
| [`runtime/`](runtime/README.md) | Provides shared client services for sessions, workspaces, and UI composition. |
| [`hmr/`](hmr/README.md) | Refreshes client plugins during development. |
| [`locale/`](locale/README.md) | Provides localization preferences and message dictionaries. |
| [`test-runtime/`](../test-support/client-runtime/README.md) | Provides shared repository test support for client feature packages. |
| [`ui-slots/`](ui-slots/README.md) | Defines how UI features register and compose extension slots. |
| [`ui-theme/`](ui-theme/README.md) | Applies the selected color theme. |
| [`ui-aqua/`](ui-aqua/README.md) | Applies the Aqua glass visual system: theme tokens, adjustable blur and frost, and a WebGL or wallpaper backdrop. |
| [`ui-primitives/`](ui-primitives/README.md) | Provides shared React controls, icons, and content renderers. |
| [`ui-attachment/`](ui-attachment/README.md) | Registers composer and message-image attachment presentation. |
| [`ui-layout/`](ui-layout/README.md) | Arranges the main application regions. |
| [`ui-sidebar/`](ui-sidebar/README.md) | Presents workspace and session navigation. |
| [`ui-brand-official/`](ui-brand-official/README.md) | Fills the generic browser-brand slots with the official name and marks. |
| [`ui-workspace/`](ui-workspace/README.md) | Provides workspace selection and creation surfaces. |
| [`ui-directory-picker-browse/`](ui-directory-picker-browse/README.md) | In-app directory browsing dialog for the workspace flows, driving the Host's directory primitives without an OS chooser. |
| [`ui-directory-picker-native/`](ui-directory-picker-native/README.md) | Renderless occupant that answers workspace directory picks through the Host's native OS chooser. |
| [`ui-conversation/`](ui-conversation/README.md) | Presents the active conversation and its input surface. |
| [`ui-deliverables/`](ui-deliverables/README.md) | Adds a finished turn's produced-files row and clickable inline references to the closing prose. |
| [`ui-tool/`](ui-tool/README.md) | Composes Tool call trees and keyed per-Tool views. |
| [`ui-workflow-run/`](ui-workflow-run/README.md) | Replays durable workflow runs as nested Chat disclosures with live-only child navigation. |
| [`ui-goal/`](ui-goal/README.md) | Presents and manages the current goal. |
| [`ui-trajectory/`](ui-trajectory/README.md) | Presents alternate views of agent activity. |
| [`ui-commands/`](ui-commands/README.md) | Provides session-aware command discovery and dispatch. |
| [`ui-input-trigger/`](ui-input-trigger/README.md) | Coordinates inline command and reference suggestions. |
| [`ui-skill/`](ui-skill/README.md) | Adds skill references to inline suggestions. |
| [`ui-reference/`](ui-reference/README.md) | Unified Web `@file` / `@session` reference source. |
| [`ui-subagent/`](ui-subagent/README.md) | Provides subagent navigation, child transcript states, and inline references. |
| [`ui-jobs/`](ui-jobs/README.md) | Lists this session's background jobs in the conversation header. |
| [`ui-desktop-notify/`](ui-desktop-notify/README.md) | Pops a system desktop notification when a task completes while you are not watching the session. |
| [`ui-model-selection/`](ui-model-selection/README.md) | Provides model selection in conversation surfaces. |
| [`ui-permission/`](ui-permission-presets/README.md) | Configures default permissions and switches the current session's access. |
| [`ui-plan/`](ui-plan/README.md) | Presents active plan-mode status and its exit control. |
| [`ui-settings-plugins/`](ui-settings-plugins/README.md) | Owns the Plugins settings section, its tab extension point, and configurable host-plane plugin cards. |
| [`ui-user-questions/`](ui-user-questions/README.md) | Presents interactive questions requested by the agent. |
| [`ui-message-feedback/`](ui-message-feedback/README.md) | Adds per-message Like/Dislike and note controls to the assistant-actions strip. |
| [`ui-agent-preset/`](ui-agent-preset/README.md) | Selects a session's agent preset and authors preset compositions. |
| [`ui-settings/`](ui-settings/README.md) | Hosts the settings interface and its extension areas. |
| [`ui-settings-general/`](ui-settings-general/README.md) | Provides the general settings section. |
| [`ui-settings-dev-checks/`](ui-settings-dev-checks/README.md) | Registers the Dev checks settings page with per-machine quality-gate toggles. |
| [`ui-settings-models/`](ui-settings-models/README.md) | Provides model-provider configuration and DeepSeek onboarding. |
| [`ui-settings-vision-model/`](ui-settings-vision-model/README.md) | Registers the Vision model settings page that routes image-bearing requests. |
| [`ui-settings-mcp/`](ui-settings-mcp/README.md) | Renders the MCP servers list and edit forms in the Plugins settings tab. |
| [`ui-settings-plugin-inventory/`](ui-settings-plugin-inventory/README.md) | Contributes the read-only Host Loader inventory tab to Plugins settings. |

Each child reference owns its contract and detailed behavior. The [slot system standard](../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) and [web client architecture note](../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) own the cross-package composition and loading decisions.

The subsystem reference is [client-modules.md](../../docs/subsystems/client-modules.md); the [slot system standard](../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) is the definitive slot model, and the [web client architecture note](../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) owns the loading chain and object layer.
