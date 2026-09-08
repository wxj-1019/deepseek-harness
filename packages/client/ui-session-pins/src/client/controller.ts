/**
 * Browser-local object layer over the pinned-session set. The Host owns every
 * mutation; this controller mirrors the id list, applies verbs through the
 * generated `sessionPins` Remote, and reloads after each committed change —
 * its own and everyone else's, via the pushed `session-pins/changed` event.
 * @module @deepseek-ai/dsh-client-ui-session-pins/client/controller
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { RemoteMirrorController } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type {
  SessionPinListResult,
  SessionPinListValue,
  SessionPinResult,
  SessionUnpinResult,
} from '@deepseek-ai/dsh-session-pins/types'

/** The three Remote calls this controller needs, matching the generated face. */
export interface SessionPinsRemoteFace {
  list: () => Promise<RemoteResult<SessionPinListResult>>
  pin: (request: { sessionId: SessionId }) => Promise<RemoteResult<SessionPinResult>>
  unpin: (request: { sessionId: SessionId }) => Promise<RemoteResult<SessionUnpinResult>>
}

/** Load state of the one list read that feeds every pin surface. */
export type SessionPinsStatus = 'cold' | 'loading' | 'ready' | 'error'

/** Immutable view published to the pin surfaces. */
export interface SessionPinsState {
  status: SessionPinsStatus
  /** Pinned session ids in pin order (oldest pin first). */
  sessionIds: readonly SessionId[]
  /** Reason the last load failed, cleared by the next successful load. */
  error: string | null
}

/** One shared controller for the whole client (the set is user-global). */
export class SessionPinsController
  extends RemoteMirrorController<SessionPinsState, SessionPinsRemoteFace, SessionPinListValue>
  implements HostObservable<SessionPinsState> {
  constructor(remote: SessionPinsRemoteFace) {
    super(remote, { status: 'cold', sessionIds: [], error: null })
  }

  protected read(remote: SessionPinsRemoteFace): Promise<RemoteResult<SessionPinListResult>> {
    return remote.list()
  }

  protected applyReady(state: SessionPinsState, value: SessionPinListValue): void {
    state.sessionIds = Object.freeze([...value.sessionIds])
  }

  /** @returns whether one session id is pinned in the current snapshot. */
  isPinned(sessionId: SessionId): boolean {
    return this.getSnapshot().sessionIds.includes(sessionId)
  }

  /**
   * Pin a session.
   * @param sessionId - the session to pin.
   * @returns the failure message, or undefined once committed.
   */
  async pin(sessionId: SessionId): Promise<string | undefined> {
    return this.mutate(remote => remote.pin({ sessionId }))
  }

  /**
   * Unpin a session.
   * @param sessionId - the session to unpin.
   * @returns the failure message, or undefined once committed.
   */
  async unpin(sessionId: SessionId): Promise<string | undefined> {
    return this.mutate(remote => remote.unpin({ sessionId }))
  }

  /**
   * Flip a session between pinned and not, in one call.
   * @param sessionId - the session to flip.
   * @returns the failure message, or undefined once committed.
   */
  async toggle(sessionId: SessionId): Promise<string | undefined> {
    return this.isPinned(sessionId) ? this.unpin(sessionId) : this.pin(sessionId)
  }
}
