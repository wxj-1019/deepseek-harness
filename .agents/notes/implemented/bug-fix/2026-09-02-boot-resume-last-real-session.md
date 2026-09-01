# Agent Note: boot resumes the last real session instead of a persisted blank shell

Status: implemented

English | [中文](2026-09-02-boot-resume-last-real-session.zh.md)

## Problem

Opening dsh web landed on the blank-session hero with no header chrome, even though the user's last real conversation (and its session header card) existed. The persisted selection (`dsh.sessions.current`) had become a blank session: the app faithfully restored it, and because the session list hides blank shells, the hero stayed sticky — every subsequent boot restored the same blank session again. The blank shell got persisted in the first place through the New-Session fallback path (recent workspace → reuse an existing blank session → persist it), and the empty-localStorage case (InPrivate windows) always took that path.

## Decision

The boot-time initial selection in `ui-workspace` navigation skips blank sessions:

- A persisted selection that resolves to a blank session is treated as no selection; the reconcile falls through to the recent-workspace path instead of accepting the blank as done.
- When the recent workspace connects, its most recently updated **non-blank** session is opened in preference to the blank shell `connectWorkspace` returns. Only a workspace with no real session falls back to the blank (New Session) behavior.

The New Session entry points (`startSession`, `connectWorkspace`) are unchanged — an explicit New Session still reuses/creates the blank shell.

## Alternatives considered

- **Fix the persisted value once** — rejected: the sticky blank reoccurs whenever a boot falls back to the New-Session path (InPrivate windows, archived selections).
- **Hide blank sessions from the persisted selection writer** — rejected: the selection store legitimately persists whatever is current; the boot policy is the correct place to express "blank shells are not conversations to resume".

## Consequences

- Boot now returns the last real conversation (with its session header card) whenever one exists in the recent workspace.
- A deliberate blank-session close is not remembered across restarts; the boot picks the most recent real session instead.
