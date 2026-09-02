# Agent Note: git-graph hero chip renders again — the merged session snapshot dropped composerPhase

Status: implemented

English | [中文](2026-09-02-git-graph-chip-composer-phase-removal.zh.md)

## Problem

The git-graph plugin's blank-session branch chip (the 源代码管理 selector beside the hero workspace row) stopped rendering after the rc.8 merge. The chip's dock seat gated its visibility on `sessionSnapshot?.composerPhase === 'blank'`, but the merged session snapshot no longer carries `composerPhase` (the drift repair replaced the fork's composer-phase state with the upstream `conversationPhase` derivation, which lives on the conversation snapshot the chip does not receive). The expression evaluated to `undefined` → the hero seat was never true → the chip rendered nothing, while the plugin itself still loaded (its auto-isolation warning kept logging).

## Decision

The dock seat's hero condition now reads the fields the merged snapshot actually carries: `sessionSnapshot.blank === true && sessionSnapshot.openState === 'open'` — an opened blank session is exactly the hero/new-session state the selector targets. The session-maybe context seat keeps the baseline blank flag (the primary selector-context hole no longer exists in the shipped shell; the dock fallback covers it).

## Alternatives considered

- **Pass the conversation snapshot into the chip** — rejected: the dock's injected props carry session + input only; widening the seat contract to route the conversation snapshot through the slot machinery for one predicate is disproportionate.
- **Restore a composerPhase-equivalent field to the session snapshot** — rejected: a derived display phase re-added to the wire-adjacent snapshot re-creates the drift the migration removed.

## Consequences

- The branch selector renders again for blank sessions (verified live: the chip shows the current branch, and its popover opens with branch switch, create-and-checkout, and the Git graph).
- The same composerPhase-shape audit applies to any other plugin reading `session.composerPhase`; git-graph's auto-isolation already degraded gracefully ("the workspaces service shape changed").
