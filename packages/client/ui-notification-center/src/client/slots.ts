/**
 * Injected face of the notification-center surfaces: the bound state selector
 * hook (reserved hooks seat) plus plain action callbacks. Business components
 * contain no subscription machinery and no ctx access — this face is the only
 * channel to the shared controller.
 * @module @deepseek-ai/dsh-client-ui-notification-center/client/slots
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { NotificationId } from '@deepseek-ai/dsh-notification-center/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { NotificationsState } from './controller.ts'

/** Full injected share handed to the bell and the panel. */
export interface NotificationCenterInjected {
  /** Selector hook over the shared controller's store. */
  hooks: { notifications: HostObservable<NotificationsState> }

  /** Pull the list once unless it has already been read or is loaded. */
  ensure(): Promise<void>
  /** Flip the shared panel open state. */
  toggleOpen(): void
  /** Close the shared panel. */
  close(): void
  /** Mark one entry read. */
  markRead(id: NotificationId): Promise<string | undefined>
  /** Mark every unread entry read. */
  markAllRead(): Promise<string | undefined>
  /** Delete every read entry. */
  clearRead(): Promise<string | undefined>
  /** Open the session an entry belongs to. */
  openSession(sessionId: SessionId): void
}
