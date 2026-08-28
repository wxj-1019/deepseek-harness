/**
 * In-app notification center: a durable entry per noteworthy host moment —
 * settled sessions, answered approvals, finished jobs, dispatched schedule
 * reminders — collected from the authoritative cordis event surfaces.
 * @module @deepseek-ai/dsh-notification-center
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only side-effect imports: pull the owners' Context merges into this program.
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-jobs'
// Type-only side-effect imports: pull the producers' session-event
// vocabulary (`approval/decided`, `schedule/change`) into this program.
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-schedule'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { notificationsDomainSpec } from './spec.ts'
import { NotificationId } from './types.ts'
import type {
  NotificationAckResult,
  NotificationClearReadRequest,
  NotificationKind,
  NotificationListResult,
  NotificationMarkAllReadRequest,
  NotificationMarkReadRequest,
  NotificationMarkReadResult,
  NotificationRecord,
} from './types.ts'

export type * from './types.ts'
export { notificationsDomainSpec, notificationKindSchema, notificationRecordSchema } from './spec.ts'

/** The service takes no composition config. */
export interface Config {}

declare module '@deepseek-ai/cordis' {
  interface Context {
    notifications: NotificationCenterService
  }
}

/** Copy and freeze one entry before it crosses the service boundary. */
function snapshotEntry(record: NotificationRecord): NotificationRecord {
  return Object.freeze({ ...record })
}

/**
 * Storage-domain owner of the notification center. One flat durable set of
 * entries; read state lives on the entry. Collectors run at init from the
 * authoritative event surfaces, so nothing here is a model request input.
 */
export class NotificationCenterService extends TypertRemoteService {
  static inject = ['storageDomain', 'jobs']

  /** No composition config; declared empty for loader symmetry with siblings. */
  static Config: z<Config> = z.object({})

  private table?: KvTable<NotificationId, NotificationRecord>
  private readonly runningSessions = new Set<SessionId>()

  /**
   * @param ctx - Host context carrying the storage-domain form and the job registry.
   * @param config - unused; the service has no deployment-varying choices.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'notifications')
    void config
  }

  /** Open the domain and register the four collectors. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(notificationsDomainSpec)
    this.ctx.effect(() => async () => {
      await domain.close()
    }, 'notification-center.domainClose')
    this.table = domain.table('entries')

    // A settle transition: agent/status flips running → idle only when the
    // agent truly goes quiet, so each entry is one "task finished" moment.
    this.ctx.on('agent/status', ({ agent, status }) => {
      const sessionId = agent.session.id
      if (status === 'running') {
        this.runningSessions.add(sessionId)
        return
      }
      if (!this.runningSessions.delete(sessionId)) return
      this.collect('session-completed', {
        title: 'Session settled',
        sessionId,
      })
    })

    // Approvals: every ask is answered by exactly one decided event.
    this.ctx.on('session/event', (session, event) => {
      if (event.type === 'approval/decided') {
        this.collect('approval-decided', {
          title: 'Approval answered',
          sessionId: session.id,
          detail: JSON.stringify(event.data.outcome),
        })
        return
      }
      // Schedule reminder dispatch (only present when dsh-schedule is mounted).
      if (event.type === 'schedule/change' && 'acceptedAt' in event.data) {
        this.collect('reminder-dispatched', {
          title: 'Reminder dispatched',
          sessionId: session.id,
          detail: String(event.data.id),
        })
      }
    })

    // Jobs: every terminal state is one entry.
    const disposeJobs = this.ctx.jobs.onJobDone((job) => {
      this.collect('job-finished', {
        title: job.label,
        detail: job.status,
        ...(job.ownerSession === undefined ? {} : { sessionId: job.ownerSession }),
      })
    })
    this.ctx.effect(() => disposeJobs, 'notification-center.jobDone')
  }

  /** Append one entry and broadcast the change. */
  private collect(kind: NotificationKind, partial: {
    title: string
    detail?: string
    sessionId?: SessionId
  }): void {
    const entry = snapshotEntry({
      id: NotificationId(randomUUID()),
      kind,
      title: partial.title,
      ...(partial.detail === undefined ? {} : { detail: partial.detail }),
      ...(partial.sessionId === undefined ? {} : { sessionId: partial.sessionId }),
      createdAt: Date.now(),
    })
    void this.requireTable().put(entry.id, entry).then(() => {
      this.ctx.emit('notifications/changed')
    })
  }

  /**
   * Read every entry, newest first.
   * @returns the frozen snapshot list.
   */
  @Remote('list')
  async list(): Promise<NotificationListResult> {
    const table = this.requireTable()
    const items = [...table.entries()]
      .map(([, record]) => record)
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(snapshotEntry)
    Object.freeze(items)
    return { ok: true, value: Object.freeze({ items }) }
  }

  /**
   * Mark one entry read. Absence is a loud business failure (a UI that races
   * a clear must see it), mirroring the pins service's dead-id posture.
   * @param request - the entry to mark.
   * @returns the ack or `notification-not-found`.
   */
  @Remote('markRead')
  async markRead(request: NotificationMarkReadRequest): Promise<NotificationMarkReadResult> {
    const table = this.requireTable()
    const current = table.get(request.id)
    if (current === undefined) {
      return { ok: false, error: { code: 'notification-not-found', id: request.id } }
    }
    if (current.readAt !== undefined) return { ok: true, value: { done: true } }
    await table.put(request.id, snapshotEntry({ ...current, readAt: Date.now() }))
    this.ctx.emit('notifications/changed')
    return { ok: true, value: { done: true } }
  }

  /**
   * Mark every unread entry read in one sweep.
   * @returns the ack.
   */
  @Remote('markAllRead')
  async markAllRead(_request: NotificationMarkAllReadRequest): Promise<NotificationAckResult> {
    const table = this.requireTable()
    const now = Date.now()
    let touched = false
    for (const [id, record] of table.entries()) {
      if (record.readAt !== undefined) continue
      await table.put(id, snapshotEntry({ ...record, readAt: now }))
      touched = true
    }
    if (touched) this.ctx.emit('notifications/changed')
    return { ok: true, value: { done: true } }
  }

  /**
   * Delete every read entry (unread entries survive).
   * @returns the ack.
   */
  @Remote('clearRead')
  async clearRead(_request: NotificationClearReadRequest): Promise<NotificationAckResult> {
    const table = this.requireTable()
    let touched = false
    for (const [id, record] of table.entries()) {
      if (record.readAt === undefined) continue
      await table.delete(id)
      touched = true
    }
    if (touched) this.ctx.emit('notifications/changed')
    return { ok: true, value: { done: true } }
  }

  /** Resolve the initialized durable table or fail a broken service lifecycle. */
  private requireTable(): KvTable<NotificationId, NotificationRecord> {
    if (this.table === undefined) {
      throw new Error('notification-center: durable domain is not initialized')
    }
    return this.table
  }
}

export default NotificationCenterService
