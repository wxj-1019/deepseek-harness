/**
 * Durable pinned-session set for the DeepSeek Harness user.
 * @module @deepseek-ai/dsh-session-pins
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only side-effect imports: pull the owners' `sessions` /
// `sessionPersistence` Context merges into this program.
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { sessionPinsDomainSpec } from './spec.ts'
import type {
  SessionPinFailure,
  SessionPinListResult,
  SessionPinListValue,
  SessionPinRecord,
  SessionPinRejected,
  SessionPinRequest,
  SessionPinResult,
  SessionPinSuccess,
  SessionUnpinRequest,
  SessionUnpinResult,
  SessionUnpinValue,
} from './types.ts'

export type * from './types.ts'
export { sessionPinsDomainSpec, sessionPinRecordSchema } from './spec.ts'

/** The service takes no composition config. */
export interface Config {}

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionPins: SessionPinsService
  }
}

/** Build a frozen success branch. */
function success<T>(value: T): SessionPinSuccess<T> {
  return Object.freeze({ ok: true, value: Object.freeze(value) })
}

/** Build a frozen business-failure branch. */
function rejected<E extends SessionPinFailure>(error: E): SessionPinRejected<E> {
  return Object.freeze({ ok: false, error: Object.freeze(error) })
}

/**
 * Storage-domain owner of the pinned-session set. Pins are references only:
 * a session is known when it is live or its log persists; a pin naming
 * neither is rejected instead of parking a dead id.
 *
 * The set is user-facing only — nothing here enters a session log or any
 * model request.
 */
export class SessionPinsService extends TypertRemoteService {
  static inject = ['storageDomain', 'sessionPersistence', 'sessions']

  /** No composition config; declared empty for loader symmetry with siblings. */
  static Config: z<Config> = z.object({})

  private table?: KvTable<SessionId, SessionPinRecord>

  /**
   * @param ctx - Host context carrying the storage-domain form, persistence, and the session store.
   * @param config - unused; the service has no deployment-varying choices.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'sessionPins')
    void config
  }

  /** Open and own the one session-pins domain. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(sessionPinsDomainSpec)
    this.ctx.effect(() => async () => {
      await domain.close()
    }, 'session-pins.domainClose')
    this.table = domain.table('pins')
  }

  /**
   * Read every pinned session id in pin order (oldest pin first).
   * @returns the frozen snapshot list.
   */
  @Remote('list')
  async list(): Promise<SessionPinListResult> {
    const table = this.requireTable()
    const sessionIds = [...table.entries()]
      .sort(([, left], [, right]) => left.pinnedAt - right.pinnedAt)
      .map(([sessionId]) => sessionId)
    Object.freeze(sessionIds)
    return success<SessionPinListValue>({ sessionIds })
  }

  /**
   * Pin one session. An already pinned session resolves to its stored record
   * without re-stamping. Emits {@link 'session-pins/changed'} on a real write.
   * @param request - the session to pin.
   * @returns the stored record or `session-not-found`.
   */
  @Remote('pin')
  async pin(request: SessionPinRequest): Promise<SessionPinResult> {
    if (!(await this.sessionKnown(request.sessionId))) {
      return rejected({ code: 'session-not-found', sessionId: request.sessionId })
    }
    const table = this.requireTable()
    const existing = table.get(request.sessionId)
    if (existing !== undefined) return success(Object.freeze({ pinnedAt: existing.pinnedAt }))
    const record = Object.freeze({ pinnedAt: Date.now() })
    await table.put(request.sessionId, record)
    this.ctx.emit('session-pins/changed')
    return success(record)
  }

  /**
   * Unpin one session; absence is already the requested state.
   * @param request - the session to unpin.
   * @returns the stable absent postcondition.
   */
  @Remote('unpin')
  async unpin(request: SessionUnpinRequest): Promise<SessionUnpinResult> {
    const removed = await this.requireTable().delete(request.sessionId)
    if (removed) this.ctx.emit('session-pins/changed')
    return success<SessionUnpinValue>({ absent: true })
  }

  /**
   * Whether a session is live, header-indexed, or present in a fresh
   * persistence listing. Only a definite miss returns false; a failing
   * `sessionPersistence.list()` propagates so storage faults never read as
   * a dead session.
   */
  private async sessionKnown(sessionId: SessionId): Promise<boolean> {
    if (this.ctx.sessions.get(sessionId) !== undefined) return true
    const snapshots = await this.ctx.sessionPersistence.listSnapshots()
    if (snapshots.some(snapshot => snapshot.header.id === sessionId)) return true
    return this.ctx.sessions.get(sessionId) !== undefined
  }

  /** Resolve the initialized durable table or fail a broken service lifecycle. */
  private requireTable(): KvTable<SessionId, SessionPinRecord> {
    if (this.table === undefined) {
      throw new Error('session-pins: durable domain is not initialized')
    }
    return this.table
  }
}

export default SessionPinsService
