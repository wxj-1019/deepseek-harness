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
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  NotificationAckResult,
  NotificationId,
  NotificationListResult,
  NotificationMarkReadResult,
  NotificationRecord,
} from '@deepseek-ai/dsh-notification-center/types'

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

/** Business union shared by the mutation verbs. */
type NotificationsBusinessResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: { readonly code: string } }

/**
 * Turn a rejected call into display text; transports reject with anything.
 * @param error - the rejection value.
 * @returns the message to show.
 */
function messageOf(error: unknown): string {
  /* v8 ignore next -- transports reject with Errors; the String arm satisfies the unknown type */
  return error instanceof Error ? error.message : String(error)
}

/** One shared controller for the whole client (the center is user-global). */
export class NotificationsController implements HostObservable<NotificationsState> {
  /** The snapshot both surfaces render from (uSES-safe store). */
  readonly store: SnapshotStore<NotificationsState>

  constructor(private readonly remote: NotificationsRemoteFace) {
    this.store = createSnapshotStore<NotificationsState>({
      status: 'cold', items: [], open: false, error: null,
    })
  }

  /** @returns the current published state. */
  getSnapshot(): NotificationsState {
    return this.store.getSnapshot()
  }

  /**
   * Subscribe to state revisions.
   * @param listener - called on every store update.
   * @returns the unsubscribe disposer.
   */
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener)
  }

  /** @returns whether the list has never been read. */
  get cold(): boolean {
    return this.getSnapshot().status === 'cold'
  }

  /** @returns the unread count of the current snapshot. */
  get unreadCount(): number {
    return this.getSnapshot().items.reduce((count, item) => count + (item.readAt === undefined ? 1 : 0), 0)
  }

  /**
   * Read the whole list once; a failure keeps the last good items.
   * @returns resolution when the read settles.
   */
  async resync(): Promise<void> {
    // Only the first read advertises a loading state; later reads converge
    // silently so an open panel never flashes a spinner over data.
    const firstRead = this.cold
    if (firstRead) {
      this.store.update((state) => {
        state.status = 'loading'
        state.error = null
      })
    }
    try {
      const response = await this.remote.list()
      if (!response.ok) throw new Error(response.error.message)
      this.store.update((state) => {
        state.status = 'ready'
        state.items = Object.freeze(response.value.value.items.map(item => ({ ...item })))
        state.error = null
      })
    } catch (error) {
      this.store.update((state) => {
        state.status = 'error'
        state.error = messageOf(error)
      })
    }
  }

  /** Read-once entry for first render: `resync` unless already read. */
  ensure(): Promise<void> {
    if (!this.cold && this.getSnapshot().status !== 'error') return Promise.resolve()
    return this.resync()
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

  /** Run one verb, then converge the mirror with the Host's post-write state. */
  private async mutate(
    run: (remote: NotificationsRemoteFace) => Promise<RemoteResult<NotificationsBusinessResult>>,
  ): Promise<string | undefined> {
    try {
      const response = await run(this.remote)
      if (!response.ok) return response.error.message
      if (!response.value.ok) return `code:${String(response.value.error.code)}`
    } catch (error) {
      return messageOf(error)
    }
    await this.resync()
    return undefined
  }
}
