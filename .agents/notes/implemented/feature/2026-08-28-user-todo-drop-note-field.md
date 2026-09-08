# Agent Note: User todo note field removed

Status: implemented

English | [中文](2026-08-28-user-todo-drop-note-field.zh.md)

## Problem

The daily-todo item carried an optional `note` end to end: a record field, a put patch, a `(note: ...)` segment in the model-visible catalog line, and a per-row note editor in the drawer's detail card. In practice title, due, and the project/session links carried all the value, the note editor cluttered the card, and no writer outside that editor ever set a note. The user asked for the expanded card to show the item's full content without the note editor.

## Decision

`note` is removed from the whole seam instead of being left write-never: `UserTodoRecord`/`UserTodoPutRequest` and the storage-domain schema (`packages/todo/user-todo`), the controller and Remote face (`packages/client/ui-user-todo`), the catalog projection (rendered lines drop the `(note: ...)` segment), and the row UI (the detail card shows title, due, links, open-session affordance, and the creation date; the locale dictionaries lose the note keys). The pinning suites and both README pairs moved with the code.

The `user_todo` domain stays at schema version 1. Records load through the spec's zod `parse`, and a non-strict object strips unknown keys, so a stored record that still carries `note` loads with the value silently dropped — no migration and no version bump. The model-visible catalog's digest and session-log reconstruction are unaffected because every projection source drops the segment in the same change.

## Alternatives considered

Deleting only the editor while keeping the host field was rejected: a field no code can write is dead weight, and the pre-release stance prefers deleting the seam over carrying a shim. Bumping the domain to version 2 was rejected as unnecessary once parse semantics already accept old media.

## Consequences

- Stored records that still carry `note` load cleanly with the value stripped by the non-strict parse; no migration, no domain bump, and no writer needs the field again.
- The expanded detail card shows the item's full persisted content — title, due, links, open-session affordance, creation date — with one editor fewer, and the model-visible catalog line drops the `(note: ...)` segment.
- The locale dictionaries and both README pairs lost the note surface in the same change, so no consumer reads a field the seam no longer carries.