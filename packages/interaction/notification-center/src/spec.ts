/**
 * Durable storage-domain declaration for the in-app notification center.
 * @module @deepseek-ai/dsh-notification-center/src/spec
 */

import { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { NotificationId, NotificationKind, NotificationRecord } from './types.ts'

/** Runtime schema for one opaque notification id. */
export const notificationIdSchema = z.uuid()
  .transform(value => value as NotificationId)

/** Runtime schema for the closed kind vocabulary. */
export const notificationKindSchema = z.union([
  z.literal('session-completed'),
  z.literal('approval-decided'),
  z.literal('job-finished'),
  z.literal('reminder-dispatched'),
]) satisfies z.ZodType<NotificationKind>

/** Runtime schema for one current notification entry. */
// Zod infers transformed branded fields structurally, so it cannot name the
// public interface even though every branded output is created below.
export const notificationRecordSchema = z.object({
  id: notificationIdSchema,
  kind: notificationKindSchema,
  title: z.string().min(1),
  detail: z.string().optional(),
  sessionId: z.string().min(1).transform(value => value as SessionId).optional(),
  createdAt: z.number().int().nonnegative(),
  readAt: z.number().int().nonnegative().optional(),
}) as unknown as z.ZodType<NotificationRecord>

/** One table of every notification entry, keyed by entry id. */
export const notificationsDomainSpec = defineDomain({
  name: 'notifications',
  version: 0,
  tables: {
    entries: domainTable<NotificationId, NotificationRecord>(notificationRecordSchema),
  },
})
