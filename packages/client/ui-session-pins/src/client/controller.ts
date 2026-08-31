/**
 * Browser-local object layer over the pinned-session set. The Host owns every
 * mutation; this controller mirrors the id list, applies verbs through the
 * generated `sessionPins` Remote, and reloads after each committed change —
 * its own and everyone else's, via the pushed `session-pins/changed` event.
 * @module @deepseek-ai/dsh-client-ui-session-pins/client/controller
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type {
  SessionPinListResult,
  SessionPinRejected,
  SessionPinResult,
  SessionPinSessionNotFound,
  SessionPinSuccess,
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

/** Business union shared by the pin verbs. */
type SessionPinBusinessResult =
  | SessionPinSuccess<unknown>
  | SessionPinRejected<SessionPinSessionNotFound>

/**
 * Turn a rejected call into display text; transports reject with anything.
 * @param error - the rejection value.
 * @returns the message to show.
 */
function messageOf(error: unknown): string {
  /* v8 ignore next -- transports reject with Errors; the String arm satisfies the unknown type */
  return error instanceof Error ? error.message : String(error)
}

/** One shared controller for the whole client (the set is user-global). */
export class SessionPinsController implements HostObservable<SessionPinsState> {
  /** The snapshot the surfaces render from (uSES-safe store). */
  readonly store: SnapshotStore<SessionPinsState>

  constructor(private readonly remote: SessionPinsRemoteFace) {
    this.store = createSnapshotStore<SessionPinsState>({
      status: 'cold', sessionIds: [], error: null,
    })
  }

  /** @returns the current published state. */
  getSnapshot(): SessionPinsState {
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

  /** @returns whether the set has never been read. */
  get cold(): boolean {
    return this.getSnapshot().status === 'cold'
  }

  /** @returns whether one session id is pinned in the current snapshot. */
  isPinned(sessionId: SessionId): boolean {
    return this.getSnapshot().sessionIds.includes(sessionId)
  }

  /**
   * Read the whole set once; a failure keeps the last good list.
   * @returns resolution when the read settles.
   */
  async resync(): Promise<void> {
    // Only the first read advertises a loading state; later reads converge
    // silently so an open surface never flashes a spinner over data.
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
        state.sessionIds = Object.freeze([...response.value.value.sessionIds])
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

  /** Run one verb, then converge the mirror with the Host's post-write state. */
  private async mutate(
    run: (remote: SessionPinsRemoteFace) => Promise<RemoteResult<SessionPinBusinessResult>>,
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
