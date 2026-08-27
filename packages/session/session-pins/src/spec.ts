/**
 * Durable storage-domain declaration for the pinned-session set.
 * @module @deepseek-ai/dsh-session-pins/src/spec
 */

import { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { SessionPinRecord } from './types.ts'

/** Runtime schema for one pin record. */
export const sessionPinRecordSchema = z.object({
  pinnedAt: z.number().int().nonnegative(),
}) satisfies z.ZodType<SessionPinRecord>

/**
 * One table of pins keyed by session id. Order lives on the record
 * (`pinnedAt`), so the table needs no global bookkeeping.
 */
export const sessionPinsDomainSpec = defineDomain({
  name: 'session_pins',
  version: 0,
  tables: {
    pins: domainTable<SessionId, SessionPinRecord>(sessionPinRecordSchema),
  },
})
