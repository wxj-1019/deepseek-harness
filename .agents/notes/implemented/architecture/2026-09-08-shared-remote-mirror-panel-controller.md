# Agent Note: Shared remote-mirror controller for Host-mirrored panels

Status: implemented

English | [中文](2026-09-08-shared-remote-mirror-panel-controller.zh.md)

## Problem

Five Client panel packages (`ui-session-pins`, `ui-user-todo`, `ui-notification-center`, `ui-usage`, `ui-component-library`) each carried a near-identical controller: a cold/loading/ready/error snapshot store, a read-once `ensure`, a `resync` that keeps the last good list on failure, the same `messageOf` helper, and a verb wrapper mapping transport failures to `response.error.message` and business rejections to `code:<code>` before re-reading from the Host. The copies had already drifted in comments and in subtle details (item copying, pricing normalization), and every lifecycle fix would have to be repeated five times.

## Decision

**`RemoteMirrorController` in `@deepseek-ai/dsh-client-store` owns the shared lifecycle.** The abstract base is parameterized over the panel's `MirrorState` extension, its generated Remote face, and the list payload; subclasses implement only `read` (issue the list call) and `applyReady` (fold the payload into the draft). It provides `store`, `getSnapshot`, `subscribe`, `cold`, `resync`, `ensure`, and a `protected mutate` verb wrapper. `mirrorErrorMessage` is exported for the rare subclass verb that publishes failures to its own state field.

**Divergent behavior stays in subclasses.** `ui-component-library.review` returns `void` and publishes to `reviewError` instead of yielding a message, so it does not use `mutate`. `ui-notification-center` keeps panel-open state and non-Remote verbs (`toggleOpen`, `close`) beside the mirror. `ui-usage` is read-only and never calls `mutate`. Extra state fields (`query`, `open`, `reviewError`) live on the subclass state interfaces, which extend `MirrorState`.

**The base sits in the store package, below `ui-slots`.** `HostObservable` cannot be referenced from `dsh-client-store`; subclasses keep their own `implements HostObservable<State>` clause and structural typing covers the slot binding. The store package gained a project reference and dependency on `@deepseek-ai/dsh-typert-protocol` for the `RemoteResult` transport wrapper, following the `ui-approval` precedent of referencing `packages/typert/protocol` directly so imports resolve to the referenced project's declaration output.

## Verification

`packages/client/store/tests/remote-mirror.client.spec.ts` pins the base contract: loading-only-on-first-read, silent convergence, last-good retention on failure, transport/rejection mapping, `ensure` semantics across cold/ready/error, and all four `mutate` outcomes. The five panel packages' existing suites (68 tests) pass unchanged against the subclasses.

## Alternatives considered

**Leave five copies.** Rejected: the copies had already drifted, and the lifecycle is one contract — one read keeps failures, one loading advertisement — that deserves one test site.

**Put the base in `ui-slots` next to `HostObservable`.** Rejected: the mirror lifecycle depends on the snapshot-store engine, which `ui-slots` does not own; placing the base above the store would invert the dependency direction and pull `zustand`/`immer` into the slots layer.

**Unify the divergent `review` verb into `mutate`.** Rejected: the component-library card renders the review error inline from the store and discards the promise; forcing it through the message-returning wrapper would change the card's contract for no behavioral gain.

## Consequences

- New Host-mirrored panels subclass `RemoteMirrorController` instead of copying the lifecycle; only the Remote face, the list payload fold, and bespoke verbs are new code.
- A lifecycle change now has one implementation and one spec; the panel suites guard subclass wiring only.
- `dsh-client-store` depends on `dsh-typert-protocol`; store consumers that tree-shake the mirror module do not load it.
