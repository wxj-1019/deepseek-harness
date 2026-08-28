/**
 * Browser-local object layer over the usage ledger. The Host owns every
 * durable row; this controller mirrors the list and reloads after each
 * committed change — via the pushed `usage-ledger/changed` event.
 * @module @deepseek-ai/dsh-client-ui-usage/client/controller
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { UsageLedgerListResult, UsageLedgerRecord } from '@deepseek-ai/dsh-usage-ledger/types'

/** The one Remote call this controller needs, matching the generated face. */
export interface UsageLedgerRemoteFace {
  list: () => Promise<RemoteResult<UsageLedgerListResult>>
}

/** Load state of the one list read that feeds the section. */
export type UsageStatus = 'cold' | 'loading' | 'ready' | 'error'

/** Immutable view published to the section. */
export interface UsageState {
  status: UsageStatus
  /** Rows keyed by session id, most recently active first. */
  rows: readonly { readonly sessionId: SessionId; readonly record: UsageLedgerRecord }[]
  /** Reason the last load failed, cleared by the next successful load. */
  error: string | null
}

/**
 * Turn a rejected call into display text; transports reject with anything.
 * @param error - the rejection value.
 * @returns the message to show.
 */
function messageOf(error: unknown): string {
  /* v8 ignore next -- transports reject with Errors; the String arm satisfies the unknown type */
  return error instanceof Error ? error.message : String(error)
}

/** One shared controller for the whole client (the ledger is user-global). */
export class UsageLedgerController implements HostObservable<UsageState> {
  /** The snapshot the section renders from (uSES-safe store). */
  readonly store: SnapshotStore<UsageState>

  constructor(private readonly remote: UsageLedgerRemoteFace) {
    this.store = createSnapshotStore<UsageState>({
      status: 'cold', rows: [], error: null,
    })
  }

  /** @returns the current published state. */
  getSnapshot(): UsageState {
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

  /** @returns whether the ledger has never been read. */
  get cold(): boolean {
    return this.getSnapshot().status === 'cold'
  }

  /**
   * Read the whole ledger once; a failure keeps the last good rows.
   * @returns resolution when the read settles.
   */
  async resync(): Promise<void> {
    // Only the first read advertises a loading state; later reads converge
    // silently so an open section never flashes a spinner over data.
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
        state.rows = Object.freeze(
          response.value.value.items.map(row => ({ sessionId: row.sessionId, record: { ...row.record } })),
        )
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
}
