/**
 * Behavior of the user-todo service over the real storage stack: mutations,
 * link validation against the workspace registry, change-event emission, and
 * durability across a service restart.
 * @module @deepseek-ai/dsh-user-todo/tests/user-todo.spec
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { agentEvents, Inbox, type Agent, type PreStepDecision } from '@deepseek-ai/dsh-agent'
import { Session, SessionId, type UserMessage } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import UserTodoService, { UserTodoId } from '../src/index.ts'

/** Registry stand-in exposing only the `get` face the service validates through. */
class FakeWorkspaceRegistry extends Service {
  static inject: string[] = []

  private readonly workspaces = new Map<string, { sessionIds: readonly string[]; title: string }>()

  constructor(ctx: Context) {
    super(ctx, 'workspaceRegistry')
  }

  /** Seed one workspace's accounted sessions and display title. */
  seed(workspaceId: string, sessionIds: readonly string[], title = workspaceId): void {
    this.workspaces.set(workspaceId, { sessionIds, title })
  }

  get(id: ReturnType<typeof WorkspaceId>): { sessionIds: readonly string[]; title: string } | undefined {
    return this.workspaces.get(id)
  }
}

interface Fixture {
  readonly service: UserTodoService
  readonly registry: FakeWorkspaceRegistry
  changes(): number
  dispose(): Promise<void>
}

/** Compose the service over the real storage hub/domain/JSON backend. */
async function setupFixture(config: { modelVisible?: boolean } = {}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-user-todo-test-'))
  let changes = 0
  const ctx = new Context()
  try {
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    await ctx.plugin(FakeWorkspaceRegistry)
    await ctx.plugin(UserTodoService, config)
    ctx.on('user-todo/changed', () => { changes += 1 })
    return {
      service: ctx.userTodos,
      registry: ctx.workspaceRegistry as unknown as FakeWorkspaceRegistry,
      changes: () => changes,
      async dispose() {
        await ctx.fiber.dispose()
        await rm(root, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
    throw error
  }
}

/** Read the whole list back as plain titles for assertions. */
async function titles(service: UserTodoService): Promise<string[]> {
  const listed = await service.list()
  if (!listed.ok) throw new Error('list unexpectedly rejected')
  return [...listed.value.items.map(item => item.title)]
}


describe('user todo service', () => {
  test('create, list in creation order, toggle both ways, delete idempotently', async () => {
    const fix = await setupFixture()
    try {
      const created = await fix.service.put({ title: 'First' })
      expect(created.ok).toBe(true)
      await fix.service.put({ title: 'Second' })

      expect(created.ok).toBe(true)
      if (!created.ok) return
      const first = created.value

      const done = await fix.service.toggle({ id: first.id, done: true })
      expect(done.ok).toBe(true)
      if (done.ok) {
        expect(done.value.done).toBe(true)
        expect(done.value.completedAt).toBeDefined()
      }

      // A no-op toggle neither restamps nor emits.
      const changesBeforeNoop = fix.changes()
      const noop = await fix.service.toggle({ id: first.id, done: true })
      expect(noop.ok).toBe(true)
      expect(fix.changes()).toBe(changesBeforeNoop)

      const reopened = await fix.service.toggle({ id: first.id, done: false })
      expect(reopened.ok).toBe(true)
      if (reopened.ok) {
        expect(reopened.value.done).toBe(false)
        expect(reopened.value.completedAt).toBeUndefined()
      }

      expect(await titles(fix.service)).toEqual(['First', 'Second'])
      const removed = await fix.service.delete({ id: first.id })
      const removedAgain = await fix.service.delete({ id: first.id })
      expect(removed.ok).toBe(true)
      expect(removedAgain.ok).toBe(true)
      expect(await titles(fix.service)).toEqual(['Second'])
    } finally {
      await fix.dispose()
    }
  })

  test('put patches fields, null clears them, and blank titles are rejected', async () => {
    const fix = await setupFixture()
    try {
      const created = await fix.service.put({ title: 'Draft', note: 'context' })
      expect(created.ok).toBe(true)
      if (!created.ok) return
      const id = created.value.id

      const retitleOnly = await fix.service.put({ id, title: 'Renamed' })
      expect(retitleOnly.ok).toBe(true)
      if (retitleOnly.ok) {
        expect(retitleOnly.value.title).toBe('Renamed')
        expect(retitleOnly.value.note).toBe('context')
      }

      // A patch landing on stored values is a no-op: no write, no event.
      const changesBeforeNoop = fix.changes()
      const noop = await fix.service.put({ id, title: 'Renamed' })
      expect(noop.ok).toBe(true)
      expect(fix.changes()).toBe(changesBeforeNoop)

      const cleared = await fix.service.put({ id, note: null })
      expect(cleared.ok).toBe(true)
      if (cleared.ok) expect(cleared.value.note).toBeUndefined()

      const blank = await fix.service.put({ title: '   ' })
      expect(blank.ok).toBe(false)

      const missing = await fix.service.put({
        id: UserTodoId('00000000-0000-4000-8000-000000000000'),
        title: 'x',
      })
      expect(missing.ok).toBe(false)
    } finally {
      await fix.dispose()
    }
  })

  test('due dates set, update, clear, and a same-value set emits nothing', async () => {
    const fix = await setupFixture()
    try {
      const created = await fix.service.put({ title: 'Deadline' })
      expect(created.ok).toBe(true)
      if (!created.ok) return
      const id = created.value.id

      const dueOne = 1_700_000_000_000
      const first = await fix.service.put({ id, dueAt: dueOne })
      expect(first.ok).toBe(true)
      if (first.ok) expect(first.value.dueAt).toBe(dueOne)

      const changesBeforeNoop = fix.changes()
      const noop = await fix.service.put({ id, dueAt: dueOne })
      expect(noop.ok).toBe(true)
      expect(fix.changes()).toBe(changesBeforeNoop)

      const dueTwo = dueOne + 60_000
      const moved = await fix.service.put({ id, dueAt: dueTwo })
      expect(moved.ok).toBe(true)
      if (moved.ok) expect(moved.value.dueAt).toBe(dueTwo)
      expect(fix.changes()).toBe(changesBeforeNoop + 1)

      const cleared = await fix.service.put({ id, dueAt: null })
      expect(cleared.ok).toBe(true)
      if (cleared.ok) expect(cleared.value.dueAt).toBeUndefined()
      expect(fix.changes()).toBe(changesBeforeNoop + 2)
    } finally {
      await fix.dispose()
    }
  })

  test('session links require their workspace and real membership', async () => {
    const fix = await setupFixture()
    try {
      const ws = WorkspaceId('ws-1')
      const inside = SessionId('11111111-1111-4111-8111-111111111111')
      const outside = SessionId('22222222-2222-4222-8222-222222222222')
      fix.registry.seed(ws, [inside])

      const orphan = await fix.service.put({ title: 'Orphan', sessionId: inside })
      expect(orphan.ok).toBe(false)
      if (!orphan.ok) expect(orphan.error.code).toBe('session-link-without-workspace')

      const ghost = await fix.service.put({ title: 'Ghost', workspaceId: WorkspaceId('ws-none') })
      expect(ghost.ok).toBe(false)
      if (!ghost.ok) expect(ghost.error.code).toBe('workspace-not-found')

      const foreign = await fix.service.put({
        title: 'Foreign',
        workspaceId: ws,
        sessionId: outside,
      })
      expect(foreign.ok).toBe(false)
      if (!foreign.ok) expect(foreign.error.code).toBe('session-not-in-workspace')

      const linked = await fix.service.put({ title: 'Linked', workspaceId: ws, sessionId: inside })
      expect(linked.ok).toBe(true)

      // Unlinking the workspace must not strand the session link.
      if (!linked.ok) return
      const unlink = await fix.service.put({ id: linked.value.id, workspaceId: null })
      expect(unlink.ok).toBe(true)
      if (unlink.ok) {
        expect(unlink.value.workspaceId).toBeUndefined()
        expect(unlink.value.sessionId).toBeUndefined()
      }
    } finally {
      await fix.dispose()
    }
  })

  test('items survive a full service restart over the same storage root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-user-todo-restart-'))
    const startCtx = new Context()
    try {
      await startCtx.plugin(Storage)
      await startCtx.plugin(StorageJson, { root })
      await startCtx.plugin(StorageDomain, { backend: 'json' })
      await startCtx.plugin(FakeWorkspaceRegistry)
      await startCtx.plugin(UserTodoService)
      const written = await startCtx.userTodos.put({ title: 'Survives' })
      expect(written.ok).toBe(true)
      await startCtx.fiber.dispose()

      const reopenCtx = new Context()
      try {
        await reopenCtx.plugin(Storage)
        await reopenCtx.plugin(StorageJson, { root })
        await reopenCtx.plugin(StorageDomain, { backend: 'json' })
        await reopenCtx.plugin(FakeWorkspaceRegistry)
        await reopenCtx.plugin(UserTodoService)
        const read = await reopenCtx.userTodos.list()
        expect(read.ok).toBe(true)
        if (read.ok) {
          expect(read.value.items.map(item => item.title)).toEqual(['Survives'])
          expect(read.value.items[0]?.done).toBe(false)
          expect(read.value.items[0]?.completedAt).toBeUndefined()
        }
      } finally {
        await reopenCtx.fiber.dispose()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})


// ---- model-facing projection (pre-step catalog) ----

/** A minimal agent over one real session, mirroring the skill-catalog tests. */
function fakeAgent(session: Session): Agent {
  return {
    id: SessionId('user-todo-agent'),
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'running',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => { throw new Error('step-boundary catalog must not use agent.inject()') },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

/** Drive one pre-step and commit the decision's user-todos message to the log. */
async function fireStep(
  ctx: Context,
  agent: Agent,
  turn: number,
  step: number,
): Promise<PreStepDecision> {
  const decision = await agentEvents(ctx, agent).waterfall(
    'agent/pre-step',
    { messages: [], turn, step, signal: new AbortController().signal },
    () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
  )
  if (decision.kind === 'enter') {
    for (const message of decision.messages as readonly UserMessage[]) {
      agent.session.append('user/message', message, { surfaceOp: 'append' })
    }
  }
  return decision
}

/** The user-todos messages carried by one decision. */
function todosMessages(decision: PreStepDecision): readonly UserMessage[] {
  return decision.kind === 'enter'
    ? (decision.messages as readonly UserMessage[]).filter(message => message.source.kind === 'user-todos')
    : []
}

describe('user todo model projection', () => {
  test('modelVisible off means no listener, no catalog ever', async () => {
    const fix = await setupFixture()
    try {
      await fix.service.put({ title: 'Visible?' })
      const agent = fakeAgent(Session.create(SessionId('off-agent'), []))
      const decision = await fireStep(ctxOf(fix), agent, 1, 1)
      expect(todosMessages(decision)).toEqual([])
    } finally {
      await fix.dispose()
    }
  })

  test('modelVisible on: publish once, dedupe unchanged, replace on change', async () => {
    const fix = await setupFixture({ modelVisible: true })
    try {
      fix.registry.seed('ws-1', [], 'Demo WS')
      await fix.service.put({ title: 'Buy milk', note: '2 percent', dueAt: Date.UTC(2026, 7, 30, 9), workspaceId: 'ws-1' as never })
      await fix.service.put({ title: 'Water the plants' })
      const agent = fakeAgent(Session.create(SessionId('proj-agent'), []))

      const first = await fireStep(ctxOf(fix), agent, 1, 1)
      const initial = todosMessages(first)
      expect(initial).toHaveLength(1)
      const text = (initial[0]?.content[0] as { text: string }).text
      expect(text).toContain('<user_todos>')
      expect(text).toContain('- [ ] Buy milk (note: 2 percent) (due:')
      expect(text).toContain('(project: Demo WS)')
      expect(text).toContain('- [ ] Water the plants')

      // Unchanged list: the next step carries nothing.
      const second = await fireStep(ctxOf(fix), agent, 1, 2)
      expect(todosMessages(second)).toEqual([])

      // Completing an item publishes a full-replacement update with the rest.
      const listed = await fix.service.list()
      expect(listed.ok).toBe(true)
      if (listed.ok) {
        const target = listed.value.items.find(item => item.title === 'Buy milk')
        expect(target).toBeDefined()
        if (target) await fix.service.toggle({ id: target.id, done: true })
      }
      const third = await fireStep(ctxOf(fix), agent, 1, 3)
      const update = todosMessages(third)
      expect(update).toHaveLength(1)
      expect(((update[0]?.source as unknown as { form: string })).form).toBe('catalog-update')
      const updateText = (update[0]?.content[0] as { text: string }).text
      expect(updateText).toContain('Water the plants')
      expect(updateText).not.toContain('Buy milk')
    } finally {
      await fix.dispose()
    }
  })

  test('emptying a published list publishes the explicit empty replacement', async () => {
    const fix = await setupFixture({ modelVisible: true })
    try {
      const created = await fix.service.put({ title: 'Only' })
      expect(created.ok).toBe(true)
      const agent = fakeAgent(Session.create(SessionId('empty-agent'), []))
      const first = await fireStep(ctxOf(fix), agent, 1, 1)
      expect(todosMessages(first)).toHaveLength(1)
      if (created.ok) await fix.service.delete({ id: created.value.id })
      const second = await fireStep(ctxOf(fix), agent, 1, 2)
      const messages = todosMessages(second)
      expect(messages).toHaveLength(1)
      expect(((messages[0]?.source as unknown as { todos: unknown[] })).todos).toEqual([])
    } finally {
      await fix.dispose()
    }
  })
})

/** The service cast back out of the fixture context (typed access for tests). */
function ctxOf(fix: Fixture): Context {
  return (fix.service as unknown as { ctx: Context }).ctx
}
