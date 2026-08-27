/**
 * Durable storage-domain declaration for the user's daily todo list.
 * @module @deepseek-ai/dsh-user-todo/src/spec
 */

import { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { UserTodoRecord, UserTodoId, LinkedWorkspaceId } from './types.ts'

/** Runtime schema for one opaque item id. */
export const userTodoIdSchema = z.uuid()
  .transform(value => value as UserTodoId)

/** Runtime schema for one current todo item. */
// Zod infers transformed branded fields structurally, so it cannot name the
// public interface even though every branded output is created below.
export const userTodoItemSchema = z.object({
  id: userTodoIdSchema,
  title: z.string().refine(title => title.trim().length > 0, {
    message: 'user todo title must contain a non-whitespace character',
  }),
  note: z.string().optional(),
  done: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative().optional(),
  workspaceId: z.string().min(1).transform(value => value as LinkedWorkspaceId).optional(),
  sessionId: z.string().min(1).transform(value => value as SessionId).optional(),
}).superRefine((item, ctx) => {
  if (item.done !== (item.completedAt !== undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: ['completedAt'],
      message: 'user todo completedAt must be present exactly when done is true',
    })
  }
  if (item.sessionId !== undefined && item.workspaceId === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['sessionId'],
      message: 'user todo session link requires its workspace link',
    })
  }
}) as unknown as z.ZodType<UserTodoRecord>

/**
 * One table of every todo item, keyed by item id. The list is deliberately
 * one flat durable set: day bucketing and carry-over are view derivations,
 * so no per-day or global bookkeeping is stored.
 */
export const userTodoDomainSpec = defineDomain({
  name: 'user_todo',
  version: 0,
  tables: {
    items: domainTable<UserTodoId, UserTodoRecord>(userTodoItemSchema),
  },
})
