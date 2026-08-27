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
import { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import UserTodoService, { UserTodoId } from '../src/index.ts'

/** Registry stand-in exposing only the `get` face the service validates through. */
class FakeWorkspaceRegistry extends Service {
  static inject: string[] = []

  private readonly workspaces = new Map<string, readonly string[]>()

  constructor(ctx: Context) {
    super(ctx, 'workspaceRegistry')
  }

  /** Seed one workspace's accounted sessions. */
  seed(workspaceId: string, sessionIds: readonly string[]): void {
    this.workspaces.set(workspaceId, sessionIds)
  }

  get(id: ReturnType<typeof WorkspaceId>): { sessionIds: readonly string[] } | undefined {
    const found = this.workspaces.get(id)
    return found === undefined ? undefined : { sessionIds: found }
  }
}

interface Fixture {
  readonly service: UserTodoService
  readonly registry: FakeWorkspaceRegistry
  changes(): number
  dispose(): Promise<void>
}

/** Compose the service over the real storage hub/domain/JSON backend. */
async function setupFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-user-todo-test-'))
  let changes = 0
  const ctx = new Context()
  try {
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    await ctx.plugin(FakeWorkspaceRegistry)
    await ctx.plugin(UserTodoService)
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
