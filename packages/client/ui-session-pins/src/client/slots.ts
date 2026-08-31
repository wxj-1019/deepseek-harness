/**
 * Injected faces of the session-pin surfaces: the bound state selector hook
 * (reserved hooks seat) plus plain action callbacks. Business components
 * contain no subscription machinery and no ctx access — these faces are the
 * only channel to the shared controller.
 * @module @deepseek-ai/dsh-client-ui-session-pins/client/slots
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionPinsState } from './controller.ts'

/** Full injected share handed to the pin surfaces. */
export interface SessionPinsInjected {
  /** Selector hook over the shared controller's store. */
  hooks: { pins: HostObservable<SessionPinsState> }

  /** Pull the set once unless it has already been read or is loaded. */
  ensure(): Promise<void>
  /** Flip one session between pinned and not. */
  toggle(sessionId: SessionId): Promise<string | undefined>
  /** Unpin one session. */
  unpin(sessionId: SessionId): Promise<string | undefined>
  /** Open a session (pinned rows click straight into it). */
  openSession(sessionId: SessionId): void
}
