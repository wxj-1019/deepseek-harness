/**
 * Behavior of the session-pins service over the real storage stack: pin and
 * unpin, ordering, validation against the session store, change-event
 * emission, and durability across a service restart.
 * @module @deepseek-ai/dsh-session-pins/tests/session-pins.spec
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SessionPinsService from '../src/index.ts'

/** Minimal persistence stand-in: pins validate against it, never listing anything. */
class TestPersistence extends Service {
  static inject: string[] = []

  constructor(ctx: Context) {
    super(ctx, 'sessionPersistence')
  }

  listSnapshots(): Promise<never[]> {
    return Promise.resolve([])
  }
}

describe('session pins service', () => {
  test('pin orders by pin time, unpin removes, both idempotent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-session-pins-main-'))
    let changes = 0
    const ctx = new Context()
    try {
      await ctx.plugin(SessionStore)
      await ctx.plugin(TestPersistence)
      await ctx.plugin(Storage)
      await ctx.plugin(StorageJson, { root })
      await ctx.plugin(StorageDomain, { backend: 'json' })
      await ctx.plugin(SessionPinsService)
      ctx.on('session-pins/changed', () => { changes += 1 })

      const first = ctx.sessions.create(SessionId('s-1'), { meta: {} })
      const second = ctx.sessions.create(SessionId('s-2'), { meta: {} })

      const pinB = await ctx.sessionPins.pin({ sessionId: second.id })
      expect(pinB.ok).toBe(true)
      const pinA = await ctx.sessionPins.pin({ sessionId: first.id })
      expect(pinA.ok).toBe(true)

      const listed = await ctx.sessionPins.list()
      expect(listed.ok).toBe(true)
      if (listed.ok) expect([...listed.value.sessionIds]).toEqual([second.id, first.id])

      // Repinning the same session neither restamps nor emits.
      const changesBefore = changes
      const again = await ctx.sessionPins.pin({ sessionId: second.id })
      expect(again.ok).toBe(true)
      expect(changes).toBe(changesBefore)

      const removed = await ctx.sessionPins.unpin({ sessionId: second.id })
      expect(removed.ok).toBe(true)
      const removedAgain = await ctx.sessionPins.unpin({ sessionId: second.id })
      expect(removedAgain.ok).toBe(true)
      const after = await ctx.sessionPins.list()
      if (after.ok) expect([...after.value.sessionIds]).toEqual([first.id])

      // Unknown sessions fail loud instead of parking a dead id.
      const ghost = await ctx.sessionPins.pin({ sessionId: SessionId('00000000-0000-4000-8000-000000000000') })
      expect(ghost.ok).toBe(false)
      if (!ghost.ok) expect(ghost.error.code).toBe('session-not-found')
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  test('pins survive a full service restart over the same storage root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-session-pins-restart-'))
    const startCtx = new Context()
    try {
      await startCtx.plugin(SessionStore)
      await startCtx.plugin(TestPersistence)
      await startCtx.plugin(Storage)
      await startCtx.plugin(StorageJson, { root })
      await startCtx.plugin(StorageDomain, { backend: 'json' })
      await startCtx.plugin(SessionPinsService)
      const session = startCtx.sessions.create(SessionId('s-keep'), { meta: {} })
      const written = await startCtx.sessionPins.pin({ sessionId: session.id })
      expect(written.ok).toBe(true)
      await startCtx.fiber.dispose()

      const reopenCtx = new Context()
      try {
        await reopenCtx.plugin(SessionStore)
        await reopenCtx.plugin(TestPersistence)
        await reopenCtx.plugin(Storage)
        await reopenCtx.plugin(StorageJson, { root })
        await reopenCtx.plugin(StorageDomain, { backend: 'json' })
        await reopenCtx.plugin(SessionPinsService)
        const read = await reopenCtx.sessionPins.list()
        expect(read.ok).toBe(true)
        if (read.ok) expect([...read.value.sessionIds]).toEqual([SessionId('s-keep')])
      } finally {
        await reopenCtx.fiber.dispose()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
