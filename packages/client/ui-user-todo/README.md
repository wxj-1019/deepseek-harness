# @deepseek-ai/dsh-client-ui-user-todo

English | [中文](README.zh.md)

Web daily-todo feature owner: a slim always-visible tab on the right edge of the frame (a `shell.overlay` occupant) that slides the today panel out as a right-side drawer over the [`user-todo`](../../todo/user-todo/README.md) storage domain through the generated `userTodos` Remote namespace. One controller backs every mount; its snapshot feeds the panel through the injected hooks seat, and the business component holds only viewing state.

The panel derives its today view client-side: every open item (carried over from its creation day) first in creation order, then the items completed today newest-first, with local day bucketing as a pure function of the browser's clock so the Host stores no per-day bookkeeping. Each item is one compact row — done toggle, title, due chip (overdue chips highlight, due items sort first), expand chevron, delete — and expanding it opens a detail card with the full content: a title editor, a local-time due editor with clear, a project link picker fed by the standard `useWorkspaces` kit plus — once a workspace is linked — a session picker over that workspace's accounted, non-archived sessions, a click-through affordance that opens the linked session through `ctx.sessions.open`, the creation date, and delete. Clearing the workspace pick cascades the session link off on the Host side. A collapsible section under the today list surfaces earlier completions (newest first, each dated by its local completion day), so history stays one click away without cluttering the today view.

While the mount is alive, items whose due instant passes fire a desktop notification (tagged per item) — but only when the site already holds notification permission; the watcher never prompts, loads the list at mount even if the panel never opens, and re-arms an item whose due time is moved (the fired key is the item's id plus instant), dying with the mount so reminders live in the open window rather than in a background service. After any committed change — its own or another window's, via the allowlisted `user-todo/changed` push plus `connection/reset` — a loaded list refetches once; a cold list stays cold until first opened.

Escape path is the trigger toggle and outside-pointer dismissal; the drawer lives in the click-through overlay layer and opts back into pointer events itself. Styling uses tokens only; copy goes through the package's own `userTodo` locale namespace. The decision record is the [user daily todo Agent Note](../../../.agents/notes/implemented/feature/2026-08-27-user-daily-todo.md).

## Model Experience

None, as this package renders user-owned application data for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Single-panel state** — open state lives per mount, so a second browser window starts closed even when the first has the panel open; pushed events keep both converged once open.
- **Session labels degrade to short ids** — until the host projects a durable title, a picker option reads as its first eight id characters; the label follows the projection once available.
