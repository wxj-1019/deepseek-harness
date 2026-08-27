# @deepseek-ai/dsh-client-ui-user-todo

English | [中文](README.zh.md)

Web daily-todo feature owner: contributes one entry to `sidebar.footer.action` — a trigger button that opens the today panel over the [`user-todo`](../../todo/user-todo/README.md) storage domain through the generated `userTodos` Remote namespace. One controller backs every mount; its snapshot feeds the panel through the injected hooks seat, and the business component holds only viewing state.

The panel derives its today view client-side: every open item (carried over from its creation day) first in creation order, then the items completed today newest-first, with local day bucketing as a pure function of the browser's clock so the Host stores no per-day bookkeeping. Rows support add from the composer, toggle with the done stamp the Host owns, inline retitle, delete, a per-row note editor (Ctrl+Enter commits; empty clears), a due chip that opens a local-time datetime editor (overdue chips highlight, due items sort first), a project link picker fed by the standard `useWorkspaces` kit, and — once a workspace is linked — a session picker over that workspace's accounted, non-archived sessions plus a click-through affordance that opens the linked session through `ctx.sessions.open`. Clearing the workspace pick cascades the session link off on the Host side. A collapsible section under the today list surfaces earlier completions (newest first, each dated by its local completion day), so history stays one click away without cluttering the today view.

While the mount is alive, items whose due instant passes fire a desktop notification (tagged per item) — but only when the site already holds notification permission; the watcher never prompts, loads the list at mount even if the panel never opens, and re-arms an item whose due time is moved (the fired key is the item's id plus instant), dying with the mount so reminders live in the open window rather than in a background service. After any committed change — its own or another window's, via the allowlisted `user-todo/changed` push plus `connection/reset` — a loaded list refetches once; a cold list stays cold until first opened.

Escape path is the trigger toggle and outside-pointer dismissal shared with the other footer panels. Styling uses tokens only; copy goes through the package's own `userTodo` locale namespace. The decision record is the [user daily todo Agent Note](../../../.agents/notes/implemented/feature/2026-08-27-user-daily-todo.md).

## Model Experience

None, as this package renders user-owned application data for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Single-panel state** — open state lives per mount, so a second browser window starts closed even when the first has the panel open; pushed events keep both converged once open.
- **Session labels degrade to short ids** — until the host projects a durable title, a picker option reads as its first eight id characters; the label follows the projection once available.
