/**
 * Durable storage-domain declaration for the per-session usage ledger.
 * @module @deepseek-ai/dsh-usage-ledger/src/spec
 */

import { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { UsageLedgerRecord } from './types.ts'

/** Runtime schema for one session's accumulated usage row. */
export const usageLedgerRecordSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  requests: z.number().int().nonnegative(),
  lastAt: z.number().int().nonnegative(),
}) satisfies z.ZodType<UsageLedgerRecord>

/**
 * One table of per-session usage rows, keyed by session id. Accumulation is
 * monotonic; there is no reset in v0.
 */
export const usageLedgerDomainSpec = defineDomain({
  name: 'usage_ledger',
  version: 0,
  tables: {
    sessions: domainTable<SessionId, UsageLedgerRecord>(usageLedgerRecordSchema),
  },
})
