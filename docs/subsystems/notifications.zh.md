# 通知中心

[English](notifications.md) | 中文

通知中心的存储域所有者：一份扁平的持久条目集合，已读状态保存在条目上。收集器在 init 时从权威事件面运行，因此这里没有任何模型请求输入；变更写入会广播 `notifications/changed`。

## 服务行为

[`NotificationCenterService`](../../packages/interaction/notification-center/src/index.ts) 持有持久集合及其远程面；包 [README](../../packages/interaction/notification-center/README.zh.md) 与 [`types.ts`](../../packages/interaction/notification-center/src/types.ts) 定义可调用 API 和条目词汇。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxnotifications--notificationcenterservice"></a>

### `ctx.notifications` — `NotificationCenterService`

Storage-domain owner of the notification center. One flat durable set of entries; read state lives on the entry. Collectors run at init from the authoritative event surfaces, so nothing here is a model request input.

```ts cordis-catalog
/**
 * Read every entry, newest first.
 * @returns the frozen snapshot list.
 */
@Remote('list') async list(): Promise<NotificationListResult>

/**
 * Mark one entry read. Absence is a loud business failure (a UI that races
 * a clear must see it), mirroring the pins service's dead-id posture.
 * @param request - the entry to mark.
 * @returns the ack or `notification-not-found`.
 */
@Remote('markRead') async markRead(request: NotificationMarkReadRequest): Promise<NotificationMarkReadResult>

/**
 * Mark every unread entry read in one sweep.
 * @param _request - reserved empty ack request.
 * @returns the ack.
 */
@Remote('markAllRead') async markAllRead(_request: NotificationMarkAllReadRequest): Promise<NotificationAckResult>

/**
 * Delete every read entry (unread entries survive).
 * @param _request - reserved empty ack request.
 * @returns the ack.
 */
@Remote('clearRead') async clearRead(_request: NotificationClearReadRequest): Promise<NotificationAckResult>
```

Source: [`packages/interaction/notification-center/src/index.ts`](../../packages/interaction/notification-center/src/index.ts)

<a id="notifications-events"></a>

### `notifications/*` events

<a id="notificationschanged--emit"></a>

#### `notifications/changed` — emit

The notification center gained or changed an entry through any collector or verb. Emitted after the storage domain committed; arguments are intentionally empty — consumers refetch instead of replaying deltas.

```ts cordis-catalog
/**
 * The notification center gained or changed an entry through any collector
 * or verb. Emitted after the storage domain committed; arguments are
 * intentionally empty — consumers refetch instead of replaying deltas.
 * @mode emit
 */
'notifications/changed'(): void
```

Source: [`packages/interaction/notification-center/src/types.ts`](../../packages/interaction/notification-center/src/types.ts)
<!-- END GENERATED cordis-surface -->
