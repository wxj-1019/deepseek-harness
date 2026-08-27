/**
 * Durable cross-session daily todo list for the DeepSeek Harness user.
 * @module @deepseek-ai/dsh-user-todo
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only side-effect import: pulls the owner's `workspaceRegistry` Context
// merge into this program.
import type {} from '@deepseek-ai/dsh-workspace'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { userTodoDomainSpec } from './spec.ts'
import { UserTodoId } from './types.ts'
import type {
  UserTodoDeleteRequest,
  UserTodoDeleteResult,
  UserTodoDeleteValue,
  UserTodoFailure,
  UserTodoListResult,
  UserTodoListValue,
  UserTodoPutRequest,
  UserTodoPutResult,
  UserTodoRecord,
  UserTodoRejected,
  UserTodoSuccess,
  UserTodoToggleRequest,
  UserTodoToggleResult,
} from './types.ts'

export { UserTodoId } from './types.ts'
export type * from './types.ts'
export { userTodoDomainSpec, userTodoIdSchema, userTodoItemSchema } from './spec.ts'

/** The service takes no composition config. */
export interface Config {}

declare module '@deepseek-ai/cordis' {
  interface Context {
    userTodos: UserTodoService
  }
}

/** Build a frozen success branch. */
function success<T>(value: T): UserTodoSuccess<T> {
  return Object.freeze({ ok: true, value: Object.freeze(value) })
}

/** Build a frozen business-failure branch. */
function rejected<E extends UserTodoFailure>(error: E): UserTodoRejected<E> {
  return Object.freeze({ ok: false, error: Object.freeze(error) })
}

/** Copy and freeze one item before it crosses the service boundary. */
function snapshotItem(item: UserTodoRecord): UserTodoRecord {
  return Object.freeze({
    id: item.id,
    title: item.title,
    ...(item.note === undefined ? {} : { note: item.note }),
    done: item.done,
    createdAt: item.createdAt,
    ...(item.completedAt === undefined ? {} : { completedAt: item.completedAt }),
    ...(item.workspaceId === undefined ? {} : { workspaceId: item.workspaceId }),
    ...(item.sessionId === undefined ? {} : { sessionId: item.sessionId }),
  })
}

/** Resolved link pair carried between validation and record assembly. */
interface ResolvedLinks {
  readonly workspaceId?: WorkspaceId | undefined
  readonly sessionId?: SessionId | undefined
}

/**
 * Storage-domain owner of the user's todo list. One flat durable set of
 * items: day bucketing and carry-over are client-side view derivations over
 * `createdAt`/`completedAt`, so the Host stores none of that bookkeeping.
 *
 * The list is user-facing only — nothing here enters a session log or any
 * model request.
 */
export class UserTodoService extends TypertRemoteService {
  static inject = ['storageDomain', 'workspaceRegistry']

  /** No composition config; declared empty for loader symmetry with siblings. */
  static Config: z<Config> = z.object({})

  private table?: KvTable<UserTodoId, UserTodoRecord>

  /**
   * @param ctx - Host context carrying the storage-domain form and the workspace registry.
   * @param config - unused; the service has no deployment-varying choices.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'userTodos')
    void config
  }

  /** Open and own the one user-todo domain. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(userTodoDomainSpec)
    this.ctx.effect(() => async () => {
      await domain.close()
    }, 'user-todo.domainClose')
    this.table = domain.table('items')
  }

  /**
   * Read every item in creation order; day views are derived by consumers.
   * @returns the frozen snapshot list.
   */
  @Remote('list')
  async list(): Promise<UserTodoListResult> {
    const table = this.requireTable()
    const items = [...table.entries()]
      .map(([, record]) => record)
      .sort((left, right) => left.createdAt - right.createdAt)
      .map(snapshotItem)
    Object.freeze(items)
    return success<UserTodoListValue>({ items })
  }

  /**
   * Create one item, or apply a partial update to an existing one. Unspecified
   * optional fields keep their current value; an explicit `null` clears a
   * link or note. Every material change emits {@link 'user-todo/changed'}.
   * @param request - target id (absent creates), desired fields, and link patches.
   * @returns the committed item or an explicit business failure.
   */
  @Remote('put')
  async put(request: UserTodoPutRequest): Promise<UserTodoPutResult> {
    const table = this.requireTable()
    if (request.id === undefined) return this.create(table, request)

    const current = table.get(request.id)
    if (current === undefined) return rejected({ code: 'item-not-found', id: request.id })

    let title = current.title
    if (request.title !== undefined) {
      const resolved = this.resolveTitle(request.title)
      if (!resolved.ok) return resolved
      title = resolved.value
    }
    // Clearing the workspace link cascades: a session link cannot dangle
    // without its parent project.
    const clearingWorkspace = request.workspaceId === null
    const requestedSession = clearingWorkspace
      ? undefined
      : request.sessionId === undefined ? current.sessionId : request.sessionId ?? undefined
    const requestedWorkspace = request.workspaceId === undefined
      ? current.workspaceId
      : request.workspaceId ?? undefined
    const links = this.resolveLinks({ workspaceId: requestedWorkspace, sessionId: requestedSession })
    if (!links.ok) return links

    const note = request.note === undefined
      ? current.note
      : request.note === null
        ? undefined
        : request.note

    const next = snapshotItem({
      id: current.id,
      title,
      ...(note === undefined ? {} : { note }),
      done: current.done,
      createdAt: current.createdAt,
      ...(current.completedAt === undefined ? {} : { completedAt: current.completedAt }),
      ...(links.value.workspaceId === undefined ? {} : { workspaceId: links.value.workspaceId }),
      ...(links.value.sessionId === undefined ? {} : { sessionId: links.value.sessionId }),
    })
    // Only the editable fields can move on this path; a patch that lands on
    // the stored values is a no-op that neither writes nor emits.
    const material = next.title !== current.title
      || next.note !== current.note
      || next.workspaceId !== current.workspaceId
      || next.sessionId !== current.sessionId
    if (material) {
      await table.put(current.id, next)
      this.emitChanged()
    }
    return success(next)
  }

  /**
   * Flip one item between open and done. Entering `done` stamps
   * `completedAt`; leaving clears it. A no-op flip returns the stored item
   * without emitting.
   * @param request - the addressed item and its desired state.
   * @returns the committed item or `item-not-found`.
   */
  @Remote('toggle')
  async toggle(request: UserTodoToggleRequest): Promise<UserTodoToggleResult> {
    const table = this.requireTable()
    const current = table.get(request.id)
    if (current === undefined) return rejected({ code: 'item-not-found', id: request.id })
    if (current.done === request.done) return success(current)

    const next = snapshotItem({
      id: current.id,
      title: current.title,
      ...(current.note === undefined ? {} : { note: current.note }),
      done: request.done,
      createdAt: current.createdAt,
      ...(request.done ? { completedAt: Date.now() } : {}),
      ...(current.workspaceId === undefined ? {} : { workspaceId: current.workspaceId }),
      ...(current.sessionId === undefined ? {} : { sessionId: current.sessionId }),
    })
    await table.put(current.id, next)
    this.emitChanged()
    return success(next)
  }

  /**
   * Remove one item from the list; absence is already the requested state.
   * @param request - the addressed item.
   * @returns the stable absent postcondition.
   */
  @Remote('delete')
  async delete(request: UserTodoDeleteRequest): Promise<UserTodoDeleteResult> {
    const removed = await this.requireTable().delete(request.id)
    if (removed) this.emitChanged()
    return success<UserTodoDeleteValue>({ absent: true })
  }

  /** Create-path body of {@link put}: full validation, fresh id, open state. */
  private async create(
    table: KvTable<UserTodoId, UserTodoRecord>,
    request: UserTodoPutRequest,
  ): Promise<UserTodoPutResult> {
    const title = this.resolveTitle(request.title ?? '')
    if (!title.ok) return title
    const links = this.resolveLinks({
      workspaceId: request.workspaceId ?? undefined,
      sessionId: request.sessionId ?? undefined,
    })
    if (!links.ok) return links

    const item = snapshotItem({
      id: UserTodoId(randomUUID()),
      title: title.value,
      ...(request.note === undefined || request.note === null ? {} : { note: request.note }),
      done: false,
      createdAt: Date.now(),
      ...(links.value.workspaceId === undefined ? {} : { workspaceId: links.value.workspaceId }),
      ...(links.value.sessionId === undefined ? {} : { sessionId: links.value.sessionId }),
    })
    await table.put(item.id, item)
    this.emitChanged()
    return success(item)
  }

  /** Validate a non-blank title; failure otherwise. */
  private resolveTitle(title: string):
    | UserTodoSuccess<string>
    | UserTodoRejected<Extract<UserTodoFailure, { code: 'title-blank' }>> {
    if (title.trim().length === 0) return rejected({ code: 'title-blank' })
    return success(title)
  }

  /**
   * Resolve the effective link pair against the workspace registry. A session
   * link requires its workspace link; both names must exist, and the session
   * must sit in the workspace's accounted sessions.
   */
  private resolveLinks(links: {
    workspaceId?: WorkspaceId | undefined
    sessionId?: SessionId | undefined
  }):
    | UserTodoSuccess<ResolvedLinks>
    | UserTodoRejected<
      | Extract<UserTodoFailure, { code: 'workspace-not-found' }>
      | Extract<UserTodoFailure, { code: 'session-link-without-workspace' }>
      | Extract<UserTodoFailure, { code: 'session-not-in-workspace' }>
    > {
    const { workspaceId, sessionId } = links
    if (sessionId !== undefined && workspaceId === undefined) {
      return rejected({ code: 'session-link-without-workspace', sessionId })
    }
    if (workspaceId === undefined) return success({})
    const workspace = this.ctx.workspaceRegistry.get(workspaceId as WorkspaceId)
    if (workspace === undefined) return rejected({ code: 'workspace-not-found', workspaceId })
    if (sessionId !== undefined && !workspace.sessionIds.includes(sessionId)) {
      return rejected({ code: 'session-not-in-workspace', workspaceId, sessionId })
    }
    return success({ workspaceId, sessionId })
  }

  /** Contained fan-out of the list-changed event after a committed mutation. */
  private emitChanged(): void {
    this.ctx.emit('user-todo/changed')
  }

  /** Resolve the initialized durable table or fail a broken service lifecycle. */
  private requireTable(): KvTable<UserTodoId, UserTodoRecord> {
    if (this.table === undefined) {
      throw new Error('user-todo: durable domain is not initialized')
    }
    return this.table
  }
}

export default UserTodoService
