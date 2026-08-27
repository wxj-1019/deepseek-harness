# @deepseek-ai/dsh-client-ui-user-todo

English | [中文](README.zh.md)

Web daily-todo feature owner: contributes one entry to `sidebar.footer.action` — a trigger button that opens the today panel over the [`user-todo`](../../todo/user-todo/README.md) storage domain through the generated `userTodos` Remote namespace. One controller backs every mount; its snapshot feeds the panel through the injected hooks seat, and the business component holds only viewing state.

The panel derives its today view client-side: every open item (carried over from its creation day) first in creation order, then the items completed today newest-first, with local day bucketing as a pure function of the browser's clock so the Host stores no per-day bookkeeping. Rows support add from the composer, toggle with the done stamp the Host owns, inline retitle, delete, and a project link picker fed by the standard `useWorkspaces` kit; clearing the pick cascades the session link off on the Host side. After any committed change — its own or another window's, via the allowlisted `user-todo/changed` push plus `connection/reset` — a loaded list refetches once; a cold list stays cold until first opened.

Escape path is the trigger toggle and outside-pointer dismissal shared with the other footer panels. Styling uses tokens only; copy goes through the package's own `userTodo` locale namespace. The decision record is the [user daily todo Agent Note](../../../.agents/notes/implemented/feature/2026-08-27-user-daily-todo.md).

## Model Experience

None, as this package renders user-owned application data for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Single-panel state** — open state lives per mount, so a second browser window starts closed even when the first has the panel open; pushed events keep both converged once open.
- **No session-link picker yet** — the model and the Host accept a session link, but the panel's picker offers workspaces only; picking a session inside a project is deferred work.
- **No completed history** — earlier days' completions are durable but not rendered; the panel is strictly the today view.
