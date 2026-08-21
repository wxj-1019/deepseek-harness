/**
 * Shared spec fixtures: a minimal session list snapshot factory.
 */
import type {
  SessionId,
  SessionListState,
  SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'

/** One summary with every required field and caller-chosen running/title. */
export function summary(id: string, running: boolean, displayTitle = id): SessionSummary {
  return {
    id: id as SessionId,
    displayTitle,
    running,
    blank: false,
    updatedAt: 0,
  }
}

/** A list snapshot over the given rows with the given selection. */
export function listState(rows: readonly SessionSummary[], current?: string): SessionListState {
  const byId: Record<SessionId, SessionSummary> = {}
  for (const row of rows) byId[row.id] = row
  return {
    ids: rows.map(row => row.id),
    byId,
    current: current === undefined ? undefined : current as SessionId,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}
