# Agent Note: Component library watch scope, review guard, panel feedback, and manifest-claimed pkg

Status: implemented

English | [中文](2026-09-06-component-library-watch-scope-review-guard-panel-feedback.zh.md)

## Problem

A second review of the component library surfaced four gaps. The theme stylesheet was read once at plugin init and never again: the watcher's relevance check accepted any `.tsx` or `.module.css` anywhere under `packages/client`, which excluded the plain-`.css` theme stylesheet, so the token inventory (and the skill body's tier counts rendered from it) went stale until restart while everything else kept learning. The review face accepted any record id: a `discard` over the Remote seam deleted an authoritative scanned record silently, with no counterpart to `contribute`'s scanner-collision rejection, and the deleted record only returned when its owning file next changed or a restart rescanned. The panel's review controls discarded the controller promise, so a transport failure or `component-not-found` became an unhandled rejection with no visible feedback — the button appeared dead. And `contribute` accepted any `pkg` claim: the id was derived from the normalized path, but a wrong package name survived into the durable record and silently broke `pkg`-filtered queries after approval.

The same review also turned up a fixture defect masquerading as a host flake: the watch-integration suite built its checkout under `os.tmpdir()`, which this Windows machine addresses through a short path (`ADMINI~1`), and the first filesystem event aborted Node inside libuv's `uv_fs_event` (`!_wcsnicmp(filename, dir, dirlen)`) because the event filename no longer matched the watched directory prefix.

## Decision

The watcher's relevance now matches the scanner's walk exactly: `.tsx` and `.module.css` files under a package's `src/client`, plus the theme stylesheet. A settled theme-stylesheet change (or its removal) raises a new `onThemeSettled` event; the service re-reads the token inventory and invalidates the skill catalog through the `SkillProviderControl` directly — no `component-library/changed` broadcast, because a change broadcast must trail a durable domain write and a token re-read writes none. The chokidar depth cap is gone; the walk is uncapped like the scanner's, with `node_modules` still excluded. Spec files, fixtures, and other stylesheets under the client tree never reach the pipeline, which also removes the wasted relearn-and-forget cycle every spec edit used to trigger. The watch-integration fixture resolves its temp checkout through `realpathSync.native`, so the watched path is long-form on every platform.

`review` now rejects a scanned id with a new `scanned-record` error code before applying either decision; the review seam exists for model-contributed record curation. The controller publishes review failures to the store as a `reviewError` field instead of rejecting — the injected face discards the promise, so the store is the only channel the card has — and the card renders it as an error line, cleared by the next attempt or success. `contribute` resolves the owning directory's manifest name through the scanner's own `packageName` resolution and rejects a mismatched `pkg` claim as `invalid-record`.

## Alternatives considered

**Broadcast `component-library/changed` on a token re-read.** One event kind for every refresh is simpler, but the package's own invariant requires every broadcast to trail a durable `component_library` domain write, which a token re-read is not; the invariant would fire on every theme edit. Direct skill-catalog invalidation keeps the invariant absolute.

**Keep a larger depth cap instead of removing it.** Any cap reintroduces the same scanner/watcher asymmetry one nesting level later; `node_modules` exclusion already bounds the walk.

**Reuse `component-not-found` for scanned review targets.** The record exists; a lying error code invites wrong client handling. The dedicated code costs one union member.

**Let `review` reject from the controller.** The registration wraps the call in `void`, so a rejection is an unhandled promise rejection — the store is the card's only feedback channel, which is also why list failures already publish `status: 'error'`.

**Trust quarantine on a wrong `pkg`.** The panel reviewer sees the record but not the future query miss; after approval the record is invisible to `pkg`-filtered queries forever. The manifest read is one file stat at contribute frequency.

## Consequences

The token inventory, the component records, and the skill body now all track file changes with the same liveness, and the pipeline ignores exactly what the scanner ignores. Scanned records can no longer be deleted or mutated through the review seam, making the scanner-authority postcondition hold on the read-modify paths as well as the write path. Review failures surface in the panel instead of vanishing. Model records can no longer carry a package name the durable set elsewhere contradicts. The watch-integration suite runs on Windows hosts whose temp directories are short-pathed, where it previously aborted the worker before reporting any result.

## Testing

`watcher.spec.ts` pins theme-stylesheet routing to `onThemeSettled` and the exclusion of specs, plain stylesheets, and sources outside `src/client`. `watch-integration.spec.ts` pins the theme re-read, the spec-file non-learning window, and the original relearn/forget cycle over a long-path checkout. `service.spec.ts` pins the `scanned-record` rejection for both decisions without deletion and the `pkg`/manifest mismatch rejection. `gaps.spec.ts` now pins the no-op approve ack on an already-reviewed model record, replacing the old scanned-record ack. `card.client.spec.tsx` pins result-level and carrier-level review failures publishing `reviewError`, plus the card's error-line render.
