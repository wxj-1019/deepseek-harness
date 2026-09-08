/**
 * Browser-local object layer over the usage ledger. The Host owns every
 * durable row; this controller mirrors the list and reloads after each
 * committed change — via the pushed `usage-ledger/changed` event.
 * @module @deepseek-ai/dsh-client-ui-usage/client/controller
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { RemoteMirrorController } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { UsageLedgerListResult, UsageLedgerListValue, UsageLedgerPrice, UsageLedgerRecord } from '@deepseek-ai/dsh-usage-ledger/types'

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
  /** The deployment's price table when configured; null keeps cost hidden. */
  pricing: Record<string, UsageLedgerPrice> | null
  /** Reason the last load failed, cleared by the next successful load. */
  error: string | null
}

/** One shared controller for the whole client (the ledger is user-global). */
export class UsageLedgerController
  extends RemoteMirrorController<UsageState, UsageLedgerRemoteFace, UsageLedgerListValue>
  implements HostObservable<UsageState> {
  constructor(remote: UsageLedgerRemoteFace) {
    super(remote, { status: 'cold', rows: [], pricing: null, error: null })
  }

  protected read(remote: UsageLedgerRemoteFace): Promise<RemoteResult<UsageLedgerListResult>> {
    return remote.list()
  }

  protected applyReady(state: UsageState, value: UsageLedgerListValue): void {
    state.rows = Object.freeze(
      value.items.map(row => ({ sessionId: row.sessionId, record: { ...row.record } })),
    )
    // An empty table prices nothing: normalize it to unconfigured.
    state.pricing = value.pricing !== undefined && Object.keys(value.pricing).length > 0 ? value.pricing : null
  }
}
