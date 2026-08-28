/**
 * Durable cross-session daily todo list for the DeepSeek Harness user.
 * @module @deepseek-ai/dsh-user-todo
 */

import { createHash, randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
// Type-only side-effect import: pulls the owner's `workspaceRegistry` Context
// merge into this program.
import type {} from '@deepseek-ai/dsh-workspace'
import type { UserMessage } from '@deepseek-ai/dsh-session'
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

/** Deployment policy for the model-facing projection of the list. */
export interface Config {
  /**
   * When true, every live agent's pre-step receives a persistent
   * `user-todos` catalog message describing the open items, full-replacement
   * style (the skill-catalog pattern). The list stays user-owned either way;
   * this switch only decides whether the model sees it.
   */
  readonly modelVisible?: boolean
}

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
    done: item.done,
    createdAt: item.createdAt,
    ...(item.completedAt === undefined ? {} : { completedAt: item.completedAt }),
    ...(item.dueAt === undefined ? {} : { dueAt: item.dueAt }),
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
 * The list is user-owned. When the deployment sets `modelVisible`, the
 * service additionally projects the open items into each agent's pre-step
 * as a full-replacement catalog message (the skill-catalog pattern), which
 * is the only path where list content reaches a model request — and it is
 * logged with the message itself, keeping the model-visible ⟺ logged rule.
 */
export class UserTodoService extends TypertRemoteService {
  static inject = ['storageDomain', 'workspaceRegistry']

  static Config: z<Config> = z.object({
    modelVisible: z.boolean().default(false),
  })

  private readonly modelVisible: boolean
  private table?: KvTable<UserTodoId, UserTodoRecord>

  /**
   * @param ctx - Host context carrying the storage-domain form and the workspace registry.
   * @param config - deployment policy; `modelVisible` gates the pre-step projection.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'userTodos')
    this.modelVisible = config.modelVisible ?? false
  }

  /** Open and own the one user-todo domain. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(userTodoDomainSpec)
    this.ctx.effect(() => async () => {
      await domain.close()
    }, 'user-todo.domainClose')
    this.table = domain.table('items')
    if (this.modelVisible) this.registerModelProjection()
  }

  /**
   * The model-facing projection: a per-turn full-replacement catalog over
   * the open items, published through the pre-step enter decision exactly
   * like the skill catalog. Digest-gated, so a turn whose list did not
   * change carries nothing, and an emptied list publishes an explicit empty
   * replacement once the first catalog is out.
   */
  private registerModelProjection(): void {
    this.ctx.on('agent/pre-step', async (
      { agent },
      next,
    ): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject') return decision

      const todos = this.openTodos()
      const digest = digestTodos(todos)
      const history = todosCatalogHistory(agent)
      const existing = todosMessage(decision.messages)
      if (history.visibleDigest === digest) {
        return existing === undefined
          ? decision
          : { kind: 'enter', messages: decision.messages.filter(message => message.id !== existing.id) }
      }
      if (existing !== undefined && digestTodos(readTodos(existing.source) ?? []) === digest) return decision
      if (!history.published && todos.length === 0) {
        return existing === undefined
          ? decision
          : { kind: 'enter', messages: decision.messages.filter(message => message.id !== existing.id) }
      }

      const catalog = history.published
        ? renderTodosUpdate(todos)
        : renderTodosMessage(todos)
      return {
        kind: 'enter',
        messages: existing === undefined
          ? [...decision.messages, catalog]
          : decision.messages.map(message => message.id === existing.id ? catalog : message),
      }
    })
  }

  /** The open items in creation order, with their workspace titles resolved. */
  private openTodos(): readonly UserTodoSourceEntry[] {
    const table = this.requireTable()
    return [...table.entries()]
      .map(([, record]) => record)
      .filter(record => !record.done)
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((record) => {
        const project = record.workspaceId === undefined
          ? undefined
          : this.ctx.workspaceRegistry.get(record.workspaceId)?.title
        return {
          title: record.title,
          ...(record.dueAt === undefined ? {} : { dueAt: record.dueAt }),
          ...(project === undefined ? {} : { project }),
        }
      })
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
   * link. Every material change emits {@link 'user-todo/changed'}.
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

    const dueAt = request.dueAt === undefined
      ? current.dueAt
      : request.dueAt === null
        ? undefined
        : request.dueAt

    const next = snapshotItem({
      id: current.id,
      title,
      done: current.done,
      createdAt: current.createdAt,
      ...(current.completedAt === undefined ? {} : { completedAt: current.completedAt }),
      ...(dueAt === undefined ? {} : { dueAt }),
      ...(links.value.workspaceId === undefined ? {} : { workspaceId: links.value.workspaceId }),
      ...(links.value.sessionId === undefined ? {} : { sessionId: links.value.sessionId }),
    })
    // Only the editable fields can move on this path; a patch that lands on
    // the stored values is a no-op that neither writes nor emits.
    const material = next.title !== current.title
      || next.dueAt !== current.dueAt
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
      ...(request.dueAt === undefined || request.dueAt === null ? {} : { dueAt: request.dueAt }),
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


/** One open item as the model-facing catalog publishes it. */
export interface UserTodoSourceEntry {
  readonly title: string
  readonly dueAt?: number
  readonly project?: string
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'user-todos': { kind: 'user-todos'; form: 'catalog' | 'catalog-update'; todos: readonly UserTodoSourceEntry[] }
  }
}

/** Digest over the serialized catalog entries; stable across processes. */
function digestTodos(todos: readonly UserTodoSourceEntry[]): string {
  return createHash('sha256').update(JSON.stringify(todos)).digest('hex')
}

/** The catalog entry list recorded on a user-todos source, or undefined. */
function readTodos(source: unknown): readonly UserTodoSourceEntry[] | undefined {
  const todos = (source as { todos?: unknown }).todos
  return Array.isArray(todos) ? todos as readonly UserTodoSourceEntry[] : undefined
}

/** The user-todos catalog message already present in this turn's decision, if any. */
function todosMessage(messages: readonly UserMessage[]): UserMessage | undefined {
  return messages.find(message => message.source.kind === 'user-todos')
}

/**
 * History for one agent, read by back-scanning the session's own log for the
 * LAST user-todos catalog event. Compaction shadowing is not modeled: the
 * most recent catalog is the comparison baseline whether or not an older
 * surface still renders it, which keeps the scan free of surface-shape
 * assumptions across session implementations.
 */
function todosCatalogHistory(agent: Agent): { visibleDigest?: string; published: boolean } {
  const events = agent.session.events
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === undefined || event.type !== 'user/message') continue
    if (event.data.source.kind !== 'user-todos') continue
    const todos = readTodos(event.data.source)
    if (todos === undefined) continue
    return { visibleDigest: digestTodos(todos), published: true }
  }
  return { published: false }
}

/** UTC `YYYY-MM-DD HH:mm` label for a due instant — zone-pinned so the catalog text is deterministic. */
function dueLabel(dueAt: number): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const date = new Date(dueAt)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}

/** The catalog text for one open item, annotations included. */
function renderTodoLine(todo: UserTodoSourceEntry, overdue: boolean): string {
  const parts = [`- [ ] ${todo.title}`]
  if (todo.dueAt !== undefined) parts.push(`(due: ${dueLabel(todo.dueAt)}${overdue ? ', OVERDUE' : ''})`)
  if (todo.project !== undefined) parts.push(`(project: ${todo.project})`)
  return parts.join(' ')
}

/**
 * The catalog over the open items (or the explicit empty list), framed by
 * the given opening sentence.
 */
function renderTodosCatalog(todos: readonly UserTodoSourceEntry[], opening: string): UserMessage {
  const now = Date.now()
  const body = todos.length === 0
    ? 'The list is currently empty.'
    : [
      'Open items:',
      ...todos.map(todo => renderTodoLine(todo, todo.dueAt !== undefined && todo.dueAt < now)),
    ].join('\n')
  return createUserMessage({
    content: [{
      type: 'text',
      text: [
        '<system-reminder>',
        opening,
        '',
        '<user_todos>',
        body,
        '</user_todos>',
        '',
        'Consider these items when planning or prioritizing work for this session; do not repeat the list back unless asked.',
        '</system-reminder>',
      ].join('\n'),
    }],
    source: {
      kind: 'user-todos',
      form: 'catalog',
      todos: [...todos],
    },
  })
}

/** First publication: full catalog framed as the standing context. */
function renderTodosMessage(todos: readonly UserTodoSourceEntry[]): UserMessage {
  return renderTodosCatalog(todos, 'The user maintains a personal, cross-session todo list. It is user-owned and edited in the UI; treat it as standing context and never modify it.')
}

/** Replacement publication after the first: same body, update framing. */
function renderTodosUpdate(todos: readonly UserTodoSourceEntry[]): UserMessage {
  const message = renderTodosCatalog(todos, 'Updated user todo list (full replacement of the previous catalog):')
  return createUserMessage({
    content: message.content,
    source: {
      kind: 'user-todos',
      form: 'catalog-update',
      todos: [...todos],
    },
  })
}

export default UserTodoService
