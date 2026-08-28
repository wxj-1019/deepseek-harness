/**
 * Behavior of the notification-center service over the real storage stack:
 * collectors from each authoritative event surface, the read/clear verbs,
 * and durability across a service restart.
 * @module @deepseek-ai/dsh-notification-center/tests/notification-center.spec
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { agentEvents, Inbox, type Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import Jobs from '@deepseek-ai/dsh-jobs-local'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import NotificationCenterService from '../src/index.ts'
import type { NotificationRecord } from '../src/index.ts'

/** Minimal agent over one real session for scoped event emission. */
function fakeAgent(session: Session): Agent {
  return {
    id: SessionId('notification-agent'),
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'running',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => {},
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

/** Compose the service over the real storage stack, the jobs registry, and the session store. */
async function setupFixture(): Promise<{ ctx: Context; dispose(): Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-notification-center-test-'))
  const ctx = new Context()
  try {
    await ctx.plugin(SessionStore)
    await ctx.plugin(Jobs)
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    await ctx.plugin(NotificationCenterService)
    return {
      ctx,
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

/** The current entries, newest first. */
async function items(ctx: Context): Promise<readonly NotificationRecord[]> {
  const listed = await ctx.notifications.list()
  expect(listed.ok).toBe(true)
  return listed.ok ? listed.value.items : []
}

describe('notification center service', () => {
  test('collects a settle transition once and marks read state through verbs', async () => {
    const { ctx, dispose } = await setupFixture()
    try {
      const session = ctx.sessions.create(SessionId('n-1'), { meta: {} })
      const agent = fakeAgent(session)

      // One running→idle settle is one entry; a bare idle flip (no prior
      // running) collects nothing.
      agentEvents(ctx, agent).emit('agent/status', { status: 'idle' })
      expect(await items(ctx)).toEqual([])
      agentEvents(ctx, agent).emit('agent/status', { status: 'running' })
      agentEvents(ctx, agent).emit('agent/status', { status: 'idle' })

      await expect.poll(async () => (await items(ctx)).length, { timeout: 5_000 }).toBe(1)
      const [entry] = await items(ctx)
      expect(entry?.kind).toBe('session-completed')
      expect(entry?.sessionId).toBe(session.id)
      expect(entry?.readAt).toBeUndefined()

      // Unread then read; read twice is a no-op; clear drops read entries.
      const first = await ctx.notifications.markRead({ id: entry!.id })
      expect(first.ok).toBe(true)
      const second = await ctx.notifications.markRead({ id: entry!.id })
      expect(second.ok).toBe(true)
      const after = await items(ctx)
      expect(after[0]?.readAt).toBeDefined()
      const cleared = await ctx.notifications.clearRead({})
      expect(cleared.ok).toBe(true)
      expect(await items(ctx)).toEqual([])
    } finally {
      await dispose()
    }
  })

  test('job completions become entries with owner session and status', async () => {
    const { ctx, dispose } = await setupFixture()
    try {
      // The local registry reports through the same listener the service uses.
      const registry = ctx.jobs
      registry.attachController('test-controller')
      registry.start({
        kind: 'bash',
        label: 'fixture job',
        run: () => ({
          cancel: () => {},
          done: Promise.resolve({ status: 'completed' as const }),
        }),
      })

      await expect.poll(async () => (await items(ctx)).length, { timeout: 5_000 }).toBe(1)
      const [entry] = await items(ctx)
      expect(entry?.kind).toBe('job-finished')
      expect(entry?.title).toBe('fixture job')
      expect(entry?.detail).toBe('completed')
      expect(entry?.sessionId).toBeUndefined()
    } finally {
      await dispose()
    }
  })

  test('entries survive a full service restart over the same storage root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-notification-center-restart-'))
    const first = new Context()
    try {
      await first.plugin(SessionStore)
      await first.plugin(Jobs)
      await first.plugin(Storage)
      await first.plugin(StorageJson, { root })
      await first.plugin(StorageDomain, { backend: 'json' })
      await first.plugin(NotificationCenterService)
      const session = first.sessions.create(SessionId('n-3'), { meta: {} })
      const agent = fakeAgent(session)
      agentEvents(first, agent).emit('agent/status', { status: 'running' })
      agentEvents(first, agent).emit('agent/status', { status: 'idle' })
      await expect.poll(async () => (await items(first)).length, { timeout: 5_000 }).toBe(1)
      await first.fiber.dispose()

      const second = new Context()
      try {
        await second.plugin(SessionStore)
        await second.plugin(Jobs)
        await second.plugin(Storage)
        await second.plugin(StorageJson, { root })
        await second.plugin(StorageDomain, { backend: 'json' })
        await second.plugin(NotificationCenterService)
        const read = await items(second)
        expect(read).toHaveLength(1)
        expect(read[0]?.title).toBe('Session settled')
      } finally {
        await second.fiber.dispose()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
