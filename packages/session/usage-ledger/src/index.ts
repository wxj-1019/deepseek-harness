/**
 * Durable per-session token-usage ledger. The collector subscribes to the
 * session event feed and accumulates every usage-bearing `assistant/message`
 * sample into one row per session, so cross-session usage is readable
 * without opening each session's log.
 * @module @deepseek-ai/dsh-usage-ledger
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only side-effect import: pulls the session-store Context merge into this program.
import type {} from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { usageLedgerDomainSpec } from './spec.ts'
import type { UsageLedgerBuckets, UsageLedgerListResult, UsageLedgerRecord } from './types.ts'

export type * from './types.ts'
export { usageLedgerDomainSpec, usageLedgerBucketsSchema, usageLedgerRecordSchema } from './spec.ts'

/** The service takes no composition config. */
export interface Config {}

declare module '@deepseek-ai/cordis' {
  interface Context {
    usageLedger: UsageLedgerService
  }
}

/**
 * Storage-domain owner of per-session usage accumulation. Buckets mirror the
 * provider usage sample's disjoint input/cache-read/cache-write/output
 * vocabulary; a replacement sample for an already-counted (turn, step) would
 * double-count, and the replay ordering property token-meter relies on makes
 * that a non-issue in legal logs.
 */
export class UsageLedgerService extends TypertRemoteService {
  static inject = ['storageDomain']

  /** No composition config; declared empty for loader symmetry with siblings. */
  static Config: z<Config> = z.object({})

  private table?: KvTable<SessionId, UsageLedgerRecord>
  /** Per-session write chains: same-session samples never interleave. */
  private readonly chains = new Map<SessionId, Promise<void>>()

  /**
   * @param ctx - Host context carrying the storage-domain form.
   * @param config - unused; the service has no deployment-varying choices.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'usageLedger')
    void config
  }

  /** Open the domain and register the collector. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(usageLedgerDomainSpec)
    this.ctx.effect(() => async () => {
      await domain.close()
    }, 'usage-ledger.domainClose')
    this.table = domain.table('sessions')

    this.ctx.on('session/event', (session, event) => {
      if (event.type !== 'assistant/message') return
      const usage = event.data.usage
      if (usage === undefined) return
      // The slice key rides the message's provenance: every assistant
      // message's source is a ModelMessageSource carrying the model id.
      this.accumulate(session.id, usage, event.data.message.source.model)
    })
  }

  /**
   * Read every session's row, most recently active first.
   * @returns the frozen snapshot rows.
   */
  @Remote('list')
  async list(): Promise<UsageLedgerListResult> {
    // In-flight accumulations land before the read: a list issued right
    // after a sample never misses it.
    await Promise.all(this.chains.values())
    const table = this.requireTable()
    const items = [...table.entries()]
      .map(([sessionId, record]) => ({ sessionId, record }))
      .sort((left, right) => right.record.lastAt - left.record.lastAt)
      .map(row => ({ sessionId: row.sessionId, record: snapshotRecord(row.record) }))
    Object.freeze(items)
    return { ok: true, value: Object.freeze({ items }) }
  }

  /** Accumulate one usage sample behind the session's write chain. */
  private accumulate(sessionId: SessionId, usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }, model: string): void {
    const previous = this.chains.get(sessionId) ?? Promise.resolve()
    const next = previous.then(() => this.applyAccumulation(sessionId, usage, model))
    const tail = next.then(() => undefined, () => undefined)
    this.chains.set(sessionId, tail)
  }

  /** Serialized body of {@link accumulate}: read, add, write, emit. */
  private async applyAccumulation(sessionId: SessionId, usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }, model: string): Promise<void> {
    const table = this.requireTable()
    const current = table.get(sessionId)
    const models: Record<string, UsageLedgerBuckets> = { ...current?.models }
    const slice = models[model] ?? {
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 0,
    }
    models[model] = {
      inputTokens: slice.inputTokens + usage.inputTokens,
      outputTokens: slice.outputTokens + usage.outputTokens,
      cacheReadTokens: slice.cacheReadTokens + (usage.cacheReadTokens ?? 0),
      cacheWriteTokens: slice.cacheWriteTokens + (usage.cacheWriteTokens ?? 0),
      requests: slice.requests + 1,
    }
    const now = Date.now()
    const next = snapshotRecord({
      inputTokens: (current?.inputTokens ?? 0) + usage.inputTokens,
      outputTokens: (current?.outputTokens ?? 0) + usage.outputTokens,
      cacheReadTokens: (current?.cacheReadTokens ?? 0) + (usage.cacheReadTokens ?? 0),
      cacheWriteTokens: (current?.cacheWriteTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
      requests: (current?.requests ?? 0) + 1,
      lastAt: now,
      firstAt: current?.firstAt ?? now,
      models,
    })
    await table.put(sessionId, next)
    this.ctx.emit('usage-ledger/changed')
  }

  /** Resolve the initialized durable table or fail a broken service lifecycle. */
  private requireTable(): KvTable<SessionId, UsageLedgerRecord> {
    if (this.table === undefined) {
      throw new Error('usage-ledger: durable domain is not initialized')
    }
    return this.table
  }
}

/** Copy and freeze one row. */
function snapshotRecord(record: UsageLedgerRecord): UsageLedgerRecord {
  return Object.freeze({ ...record })
}

export default UsageLedgerService
