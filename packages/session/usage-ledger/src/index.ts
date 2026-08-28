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
import type { UsageLedgerBuckets, UsageLedgerListResult, UsageLedgerPrice, UsageLedgerRecord } from './types.ts'

export type * from './types.ts'
export { usageLedgerDomainSpec, usageLedgerBucketsSchema, usageLedgerRecordSchema } from './spec.ts'

/** Per-model price in USD per 1M tokens; `*` keys as the fallback price. */
export interface Config {
  /**
   * Optional price table (USD per 1M tokens) keyed by provider model id with
   * `*` as the fallback key. When configured, `list()` publishes the table so
   * clients can derive costs; without it no cost is ever shown.
   */
  readonly pricing?: Record<string, UsageLedgerPrice>
}

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

  static Config: z<Config> = z.object({
    pricing: z.dict(z.object({
      input: z.number(),
      output: z.number(),
      cacheRead: z.number(),
      cacheWrite: z.number(),
    })),
  })

  private readonly pricing: Record<string, UsageLedgerPrice> | undefined
  private table?: KvTable<SessionId, UsageLedgerRecord>
  /** Per-session write chains: same-session samples never interleave. */
  private readonly chains = new Map<SessionId, Promise<void>>()

  /**
   * @param ctx - Host context carrying the storage-domain form.
   * @param config - optional per-model price table published to clients.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'usageLedger')
    // The schemastery dict defaults to an empty object; an empty table is
    // no pricing at all.
    this.pricing = config.pricing !== undefined && Object.keys(config.pricing).length > 0
      ? config.pricing
      : undefined
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
    return {
      ok: true,
      value: Object.freeze({
        items,
        ...(this.pricing === undefined ? {} : { pricing: { ...this.pricing } }),
      }),
    }
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
    const now = Date.now()
    const dayKey = localDayKey(now)
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
    const days: Record<string, UsageLedgerBuckets> = { ...current?.days }
    const day = days[dayKey] ?? {
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 0,
    }
    days[dayKey] = {
      inputTokens: day.inputTokens + usage.inputTokens,
      outputTokens: day.outputTokens + usage.outputTokens,
      cacheReadTokens: day.cacheReadTokens + (usage.cacheReadTokens ?? 0),
      cacheWriteTokens: day.cacheWriteTokens + (usage.cacheWriteTokens ?? 0),
      requests: day.requests + 1,
    }
    const next = snapshotRecord({
      inputTokens: (current?.inputTokens ?? 0) + usage.inputTokens,
      outputTokens: (current?.outputTokens ?? 0) + usage.outputTokens,
      cacheReadTokens: (current?.cacheReadTokens ?? 0) + (usage.cacheReadTokens ?? 0),
      cacheWriteTokens: (current?.cacheWriteTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
      requests: (current?.requests ?? 0) + 1,
      lastAt: now,
      firstAt: current?.firstAt ?? now,
      models,
      days,
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

/** The host-local calendar day of an instant, `YYYY-MM-DD`. */
function localDayKey(epochMs: number): string {
  const date = new Date(epochMs)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export default UsageLedgerService
