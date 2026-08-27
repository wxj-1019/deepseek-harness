# Agent Note: Session pins and the unarchive surface

Status: implemented

English | [中文](2026-08-28-session-pins-and-unarchive.zh.md)

## Problem

The web sidebar had two visibility gaps for a user managing many sessions. There was no way to pin a session: the workspace browser ordered sessions by workspace accounting and recency only, so a session the user returns to all week scrolled away. And archiving was one-way: `archiveSession` hid a session from every grouping surface with no surface anywhere to see or undo it — an archived session was recoverable only by editing settings-adjacent state by hand.

## Decision

**Pins.** A new host package `@deepseek-ai/dsh-session-pins` owns a `session_pins` storage domain (table keyed by session id, `pinnedAt` ordering) and a Typert Remote namespace `sessionPins` (`list` / `pin` / `unpin`). Pinning a session that is neither live nor persisted fails loud with `session-not-found`; `pin` is idempotent without re-stamping and `unpin` is idempotent for absent ids. Every material change emits `session-pins/changed` (allowlisted to browser clients), and loaded surfaces refetch on it and on `connection/reset`. The client package `@deepseek-ai/dsh-client-ui-session-pins` renders two surfaces over one shared controller: a star toggle in `conversation.session.header.actions` (filled while pinned), and the `sidebar.pinned` section — a new slot declared by ui-sidebar between the sidebar controls and the browsing region — listing pins in pin order, hiding archived rows, opening on click, unpinning on hover.

**Unarchive.** `WorkspaceRegistry.unarchiveSession` mirrors `archiveSession`: idempotent, rejects unknown sessions, and — because archiving keeps the accounting slot — restores the session's recorded workspace position. The wire gains `workspace.unarchiveSession` (same frame, `host/archived-sessions-changed`, flows for free from the domain global diff). The workspace browser renders a collapsible "Archived (N)" block under the session list: every archived session row has its title, opens on click, and restores via a hover action; failures stay console-level, the same posture as reorder rejections.

The keyless web journeys pin both surfaces through the assembled app (`apps/web/tests/session-pins.e2e.ts`) and the archived block (`apps/web/tests/workspace-management.e2e.ts` unarchive leg). Unit suites pin the service semantics (`packages/session/session-pins/tests/session-pins.spec.ts`, restart durability and dead-id rejection included) and the workspace registry's unarchive mirror rides its existing archive tests' shape.

## Alternatives considered

- **Fold pins into the workspace registry.** Lost: the archive set is registry-global, but pins are orthogonal user state — a separate domain keeps the registry's write surface uncluttered and lets the feature own its own versioning (workspace domain already went v1→v2; pinning should not ride that).
- **Pin ordering inside workspace groups (float to top).** Deferred, not rejected: the tree owner (ui-workspace) owns ordering; the pinned section is the canonical placement this round, and group-internal reordering is a tree change that can land additively.
- **Row-level pin affordance in the browser tree.** Deferred for the same reason — the header star covers the affordance without touching the row renderer.
- **Session deletion in the same change.** Rejected as scope: the deferred domain-KV note owns the `SessionPersistence.delete` primitive plus cascades into sidecars (feedback, todos, pins); shipping a files-only delete here would contradict that design's reasoning.

## Consequences

- Archived sessions are finally visible and recoverable in-product; the archive/restore round trip costs one registry mutation each way and no sidecar cleanup.
- The header star appears on every session — golden snapshots capturing the conversation header pick up the button row.
- A deleted session keeps its pin record, which stops rendering; the retention story is documented and awaits the deletion primitive.
- `sidebar.pinned` is now a documented seat for future "section above the browser" surfaces, with absent occupants rendering nothing.

## Risks

- **Golden sweep width.** The header star touches every session-view snapshot; the refresh was scoped to goldens whose diff is the button row, and CI's replay pins the rest.
- **Pinned-section staleness across windows.** Without the allowlisted event, a second window would pin invisibly; the push event plus refetch-on-change is wired and covered by the journey's reload leg.
- **Unknown-id rejection vs re-dating.** A pin named for a deleted session fails at write time; when session deletion ships, the pins table needs the same cascade the deletion note specifies.
