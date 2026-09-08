# 固定会话

[English](session-pins.md) | 中文

固定会话集合的存储域所有者。固定只保存引用：会话在存活或日志持久存在时才被视为已知，两个条件都不满足的固定会被拒绝，而不是留下一条死 id。该集合只面向用户——这里的任何内容都不会进入会话日志或任何模型请求。

## 服务行为

[`SessionPinsService`](../../packages/session/session-pins/src/index.ts) 持有持久集合及其远程面；包 [README](../../packages/session/session-pins/README.zh.md) 与 [`types.ts`](../../packages/session/session-pins/src/types.ts) 定义可调用 API 和固定词汇。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessionpins--sessionpinsservice"></a>

### `ctx.sessionPins` — `SessionPinsService`

Storage-domain owner of the pinned-session set. Pins are references only: a session is known when it is live or its log persists; a pin naming neither is rejected instead of parking a dead id.

The set is user-facing only — nothing here enters a session log or any model request.

```ts cordis-catalog
/**
 * Read every pinned session id in pin order (oldest pin first).
 * @returns the frozen snapshot list.
 */
@Remote('list') async list(): Promise<SessionPinListResult>

/**
 * Pin one session. An already pinned session resolves to its stored record
 * without re-stamping. Emits {@link 'session-pins/changed'} on a real write.
 * @param request - the session to pin.
 * @returns the stored record or `session-not-found`.
 */
@Remote('pin') async pin(request: SessionPinRequest): Promise<SessionPinResult>

/**
 * Unpin one session; absence is already the requested state.
 * @param request - the session to unpin.
 * @returns the stable absent postcondition.
 */
@Remote('unpin') async unpin(request: SessionUnpinRequest): Promise<SessionUnpinResult>
```

Source: [`packages/session/session-pins/src/index.ts`](../../packages/session/session-pins/src/index.ts)

<a id="session-pins-events"></a>

### `session-pins/*` events

<a id="session-pinschanged--emit"></a>

#### `session-pins/changed` — emit

The pinned-session set changed through `pin` or `unpin`. Emitted after the storage domain committed; arguments are intentionally empty — consumers refetch instead of replaying deltas.

```ts cordis-catalog
/**
 * The pinned-session set changed through `pin` or `unpin`. Emitted after
 * the storage domain committed; arguments are intentionally empty —
 * consumers refetch instead of replaying deltas.
 * @mode emit
 */
'session-pins/changed'(): void
```

Source: [`packages/session/session-pins/src/types.ts`](../../packages/session/session-pins/src/types.ts)
<!-- END GENERATED cordis-surface -->
