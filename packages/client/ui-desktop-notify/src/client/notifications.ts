/**
 * Pure completion-edge math over the session list snapshot. Extracted from the
 * watcher so the edge matrix is testable without React or the DOM: the
 * `host/session-status` frames drive `running` bits, and a task completion is
 * one session's bit falling true→false between two snapshots.
 */

import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'

/** Running bits carried from the previous snapshot, keyed by session. */
export type RunningMap = ReadonlyMap<SessionId, boolean>

/**
 * Collect the running bits one snapshot carries.
 * @param state - session list snapshot.
 * @returns the per-session running bits of this snapshot.
 */
export function runningOf(state: SessionListState): RunningMap {
  const bits = new Map<SessionId, boolean>()
  for (const id of state.ids) bits.set(id, state.byId[id]?.running === true)
  return bits
}

/**
 * Sessions whose running bit fell true→false since the previous snapshot.
 * Sessions missing from either side never count: a session first seen idle
 * never ran here, and a removed session completed nowhere visible.
 * @param prev - running bits of the previous snapshot.
 * @param state - current session list snapshot.
 * @returns ids that completed since the previous snapshot, in list order.
 */
export function completedSince(prev: RunningMap, state: SessionListState): SessionId[] {
  const done: SessionId[] = []
  for (const id of state.ids) {
    if (prev.get(id) === true && state.byId[id]?.running === false) done.push(id)
  }
  return done
}

/**
 * Whether one completed session should interrupt: the watched session stays
 * quiet, every other placement (another session selected, or the tab hidden
 * behind another window or tab) earns the toast.
 * @param sessionId - the completed session.
 * @param current - the currently selected session, when one is.
 * @param hidden - whether the document is hidden.
 * @returns whether the completion should fire a notification.
 */
export function shouldNotify(sessionId: SessionId, current: SessionId | undefined, hidden: boolean): boolean {
  return sessionId !== current || hidden
}
