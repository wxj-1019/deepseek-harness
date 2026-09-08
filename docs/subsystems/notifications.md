# Notification center

English | [中文](notifications.zh.md)

The storage-domain owner of the notification center: one flat durable set of entries whose read state lives on the entry. Collectors run at init from the authoritative event surfaces, so nothing here is a model request input; mutating writes broadcast `notifications/changed`.

## Service behavior

[`NotificationCenterService`](../../packages/interaction/notification-center/src/index.ts) owns the durable set and its remote face; the package [README](../../packages/interaction/notification-center/README.md) and [`types.ts`](../../packages/interaction/notification-center/src/types.ts) define the callable API and entry vocabulary.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
