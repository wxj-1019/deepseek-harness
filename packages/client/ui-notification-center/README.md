---
description: "Browser-side bell and overlay panel over the notification-center storage domain for the dsh web client."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-notification-center

English | [中文](README.zh.md)

## Summary

Web notification-center feature owner: the bell in `sidebar.footer.action` plus the center panel as `shell.overlay`'s first occupant, over the [`notification-center`](../../interaction/notification-center/README.md) storage domain through the generated `notifications` Remote namespace. One controller backs both surfaces; the shared panel open state rides the same store so bell and panel never disagree.

The bell carries the unread badge; the panel lists durable entries newest-first with kind, title (session display titles resolve through the sessions kit), time, and an unread marker — clicking a row opens its session, the header offers mark-all-read and clear-read, and Escape or the close button dismisses. After any committed change — its own or another window's, via the allowlisted `notifications/changed` push plus `connection/reset` — a loaded list refetches once; a cold list stays cold until the bell first lights it.

Styling uses tokens only; copy goes through the package's own `notificationCenter` locale namespace. The overlay layer is click-through by contract, so the card opts back into pointer events itself.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

None, as this package renders user-owned application data for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Entries render id-only when the session is gone** — a session deleted after the fact leaves its title unresolved; the row falls back to the entry's own title.
- **No notification history pruning** — the center grows until cleared; retention policy is deferred.
- **Kind icons are text labels** — the vocabulary is small enough that labels beat glyph invention this round.
- **Panels may overlap** — with the daily-todo drawer also open, the card and the drawer share the right edge; close one to use the other. A co-layout pass is deferred.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Collectors run in the host package at init; this surface only renders durable entries, and the panel golden is pinned by the keyless web journey.

</details>
