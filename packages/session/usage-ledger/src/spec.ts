/**
 * Durable storage-domain declaration for the per-session usage ledger.
 * @module @deepseek-ai/dsh-usage-ledger/src/spec
 */

import { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { UsageLedgerBuckets, UsageLedgerRecord } from './types.ts'

/** Runtime schema for one per-model slice (no wall-clock fields). */
export const usageLedgerBucketsSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  requests: z.number().int().nonnegative(),
}) satisfies z.ZodType<UsageLedgerBuckets>

/** Runtime schema for one session's accumulated usage row. */
export const usageLedgerRecordSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  requests: z.number().int().nonnegative(),
  lastAt: z.number().int().nonnegative(),
  firstAt: z.number().int().nonnegative().optional(),
  models: z.record(z.string(), usageLedgerBucketsSchema).optional(),
}) as unknown as z.ZodType<UsageLedgerRecord>
// The cast is the user-todo precedent: zod's `.optional()` output allows an
// explicit undefined, which exactOptionalPropertyTypes rejects for the `?`
// interface fields even though the parse result never writes one.

/**
 * One table of per-session usage rows, keyed by session id. Accumulation is
 * monotonic; there is no reset.
 */
export const usageLedgerDomainSpec = defineDomain({
  name: 'usage_ledger',
  // v1 added the per-model slices and firstAt; the pre-release stance lets
  // the bump invalidate the handful of v0 rows instead of migrating them.
  version: 1,
  tables: {
    sessions: domainTable<SessionId, UsageLedgerRecord>(usageLedgerRecordSchema),
  },
})
