/**
 * Browser-local object layer over the notification center. The Host owns
 * every durable entry; this controller mirrors the list, applies verbs
 * through the generated `notifications` Remote, and reloads after each
 * committed change — its own and every other window's, via the pushed
 * `notifications/changed` event. Panel open state rides the same store so
 * the footer bell and the overlay panel stay in step.
 * @module @deepseek-ai/dsh-client-ui-notification-center/client/controller
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { RemoteMirrorController } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  NotificationAckResult,
  NotificationId,
  NotificationListResult,
  NotificationMarkReadResult,
  NotificationRecord,
} from '@deepseek-ai/dsh-notification-center/types'

/** Payload inside the list call's success value. */
type NotificationListValue = { readonly items: readonly NotificationRecord[] }

/** The four Remote calls this controller needs, matching the generated face. */
export interface NotificationsRemoteFace {
  list: () => Promise<RemoteResult<NotificationListResult>>
  markRead: (request: { id: NotificationId }) => Promise<RemoteResult<NotificationMarkReadResult>>
  markAllRead: (request: Record<string, never>) => Promise<RemoteResult<NotificationAckResult>>
  clearRead: (request: Record<string, never>) => Promise<RemoteResult<NotificationAckResult>>
}

/** Load state of the one list read that feeds the bell and the panel. */
export type NotificationsStatus = 'cold' | 'loading' | 'ready' | 'error'

/** Immutable view published to both surfaces. */
export interface NotificationsState {
  status: NotificationsStatus
  /** Current entries, newest first. */
  items: readonly NotificationRecord[]
  /** Whether the overlay panel is open (shared with the footer bell). */
  open: boolean
  /** Reason the last load failed, cleared by the next successful load. */
  error: string | null
}

/** One shared controller for the whole client (the center is user-global). */
export class NotificationsController
  extends RemoteMirrorController<NotificationsState, NotificationsRemoteFace, NotificationListValue>
  implements HostObservable<NotificationsState> {
  constructor(remote: NotificationsRemoteFace) {
    super(remote, { status: 'cold', items: [], open: false, error: null })
  }

  protected read(remote: NotificationsRemoteFace): Promise<RemoteResult<NotificationListResult>> {
    return remote.list()
  }

  protected applyReady(state: NotificationsState, value: NotificationListValue): void {
    state.items = Object.freeze(value.items.map(item => ({ ...item })))
  }

  /** @returns the unread count of the current snapshot. */
  get unreadCount(): number {
    return this.getSnapshot().items.reduce((count, item) => count + (item.readAt === undefined ? 1 : 0), 0)
  }

  /** Flip the shared panel open state. */
  toggleOpen(): void {
    const next = !this.getSnapshot().open
    this.store.update((state) => { state.open = next })
    if (next) void this.ensure()
  }

  /** Close the shared panel. */
  close(): void {
    this.store.update((state) => { state.open = false })
  }

  /**
   * Mark one entry read.
   * @param id - the entry to mark.
   * @returns the failure message, or undefined once committed.
   */
  async markRead(id: NotificationId): Promise<string | undefined> {
    return this.mutate(remote => remote.markRead({ id }))
  }

  /**
   * Mark every unread entry read.
   * @returns the failure message, or undefined once committed.
   */
  async markAllRead(): Promise<string | undefined> {
    return this.mutate(remote => remote.markAllRead({}))
  }

  /**
   * Delete every read entry.
   * @returns the failure message, or undefined once committed.
   */
  async clearRead(): Promise<string | undefined> {
    return this.mutate(remote => remote.clearRead({}))
  }
}
