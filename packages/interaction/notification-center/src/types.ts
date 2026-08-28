/**
 * Public request, value, and failure vocabulary for the in-app notification
 * center. Types only, plus the seam's Cordis event declaration, so generated
 * Remote clients consume it without importing Host runtime code.
 * @module @deepseek-ai/dsh-notification-center/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Nominal id of one notification entry, minted by the Host service. */
export type NotificationId = Branded<'NotificationId'>

/** Mint one notification id from an opaque string. */
export function NotificationId(value: string): NotificationId {
  return value as NotificationId
}

/** The collector vocabulary of what a notification is about. */
export type NotificationKind =
  | 'session-completed'
  | 'approval-decided'
  | 'job-finished'
  | 'reminder-dispatched'

/** One durable notification entry. */
export interface NotificationRecord {
  /** Stable identity, minted at creation. */
  readonly id: NotificationId
  /** Which collector produced the entry. */
  readonly kind: NotificationKind
  /** Short human title (session id prefix, tool name, job label, reminder prompt). */
  readonly title: string
  /** Optional extra line (outcome, status, …). */
  readonly detail?: string
  /** The session this entry belongs to, when any. */
  readonly sessionId?: SessionId
  /** Host-assigned creation time in Unix epoch milliseconds. */
  readonly createdAt: number
  /** Host-assigned read time; absent while unread. */
  readonly readAt?: number
}

/** Read every entry, newest first. */
export type NotificationListResult = {
  readonly ok: true
  readonly value: { readonly items: readonly NotificationRecord[] }
}

/** Mark one entry read. */
export interface NotificationMarkReadRequest {
  /** The entry to mark; absence is already the requested state. */
  readonly id: NotificationId
}

/** Mark every unread entry read. */
export type NotificationMarkAllReadRequest = Record<string, never>

/** Clear all read entries. */
export type NotificationClearReadRequest = Record<string, never>

/** Generic acknowledged mutation result. */
export interface NotificationAckValue {
  /** Stable postcondition. */
  readonly done: true
}

/** Result returned by the `markRead` operation. */
export type NotificationMarkReadResult =
  | { readonly ok: true; readonly value: NotificationAckValue }
  | { readonly ok: false; readonly error: { readonly code: 'notification-not-found'; readonly id: NotificationId } }

/** Result returned by `markAllRead` and `clearRead`. */
export type NotificationAckResult = { readonly ok: true; readonly value: NotificationAckValue }

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * The notification center gained or changed an entry through any collector
     * or verb. Emitted after the storage domain committed; arguments are
     * intentionally empty — consumers refetch instead of replaying deltas.
     * @mode emit
     */
    'notifications/changed'(): void
  }
}
