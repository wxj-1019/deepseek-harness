/**
 * Public request, value, and failure vocabulary for the pinned-session set.
 * This module contains types only so generated Remote clients can consume it
 * without importing Host runtime code, and it carries the seam's Cordis event
 * declaration.
 * @module @deepseek-ai/dsh-session-pins/types
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
/** One pin record: the session id is the table key; `pinnedAt` orders pins. */
export interface SessionPinRecord {
  /** Host-assigned pin time in Unix epoch milliseconds. */
  readonly pinnedAt: number
}
/** Current pin ids in pin order (oldest pin first). */
export interface SessionPinListValue {
  /** Fresh immutable snapshot of the pinned session ids. */
  readonly sessionIds: readonly SessionId[]
}
/** Pin one session. */
export interface SessionPinRequest {
  /** The session to pin; must name a live or persisted session. */
  readonly sessionId: SessionId
}
/** Unpin one session. */
export interface SessionUnpinRequest {
  /** The session to unpin; absence is already the requested state. */
  readonly sessionId: SessionId
}
/** Idempotent unpin acknowledgement. */
export interface SessionUnpinValue {
  /** Stable postcondition shared by the first unpin and every retry. */
  readonly absent: true
}
/** No live or persisted session exists for the requested id. */
export interface SessionPinSessionNotFound {
  readonly code: 'session-not-found'
  readonly sessionId: SessionId
}
/** Failures shared by the pin operations. */
export type SessionPinFailure = SessionPinSessionNotFound
/** Successful pin/list result. */
export interface SessionPinSuccess<T> {
  readonly ok: true
  readonly value: T
}
/** Rejected pin operation with a stable business failure. */
export interface SessionPinRejected<E extends SessionPinFailure> {
  readonly ok: false
  readonly error: E
}
/** Result returned by the `list` operation. */
export type SessionPinListResult = SessionPinSuccess<SessionPinListValue>
/** Result returned by the `pin` operation. */
export type SessionPinResult = SessionPinSuccess<SessionPinRecord> | SessionPinRejected<SessionPinSessionNotFound>
/** Result returned by the `unpin` operation. */
export type SessionUnpinResult = SessionPinSuccess<SessionUnpinValue>
declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
         * The pinned-session set changed through `pin` or `unpin`. Emitted after
         * the storage domain committed; arguments are intentionally empty —
         * consumers refetch instead of replaying deltas.
         * @mode emit
         */
    'session-pins/changed'(): void
  }
}
//# sourceMappingURL=types.d.ts.map
