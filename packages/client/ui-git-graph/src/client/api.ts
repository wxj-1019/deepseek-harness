/**
 * Typed fetch wrapper over the git-graph host route. Every call POSTs to
 * `/git-graph/api` with a validated absolute working directory; the browser
 * session cookie carries the web-server authentication, and failures surface
 * as {@link GitGraphApiError} with the wire code.
 */
import type { GraphLogEntry } from '@deepseek-ai/dsh-git-graph'

/** One wire failure. */
export class GitGraphApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** One history page from the host. */
export interface GraphLogPage {
  entries: GraphLogEntry[]
  hasMore: boolean
}

async function call<T>(action: 'log' | 'branch', payload: Record<string, unknown>): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/git-graph/api/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    throw new GitGraphApiError('network', error instanceof Error ? error.message : String(error))
  }
  const parsed: { ok?: boolean; value?: unknown; error?: { code?: string; message?: string } } | null
    = await response.json().catch(() => null)
  if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === undefined) {
    throw new GitGraphApiError(
      parsed?.error?.code ?? 'http',
      parsed?.error?.message ?? `HTTP ${response.status}`,
    )
  }
  return parsed.value as T
}

/** Fetch one history page for a repository working directory. */
export function gitGraphLog(sessionId: string, count: number, skip: number): Promise<GraphLogPage> {
  return call<GraphLogPage>('log', { sessionId, count, skip })
}

/** List local branch names for a repository working directory. */
export function gitGraphBranches(sessionId: string): Promise<string[]> {
  return call<string[]>('branch', { sessionId, action: 'branch' })
}
