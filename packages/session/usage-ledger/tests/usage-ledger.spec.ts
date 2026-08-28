/**
 * Behavior of the usage-ledger service over the real storage stack:
 * accumulation from usage-bearing assistant/message events, per-session
 * chaining, and durability across a service restart.
 * @module @deepseek-ai/dsh-usage-ledger/tests/usage-ledger.spec
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import type { UsageLedgerRecord } from '../src/index.ts'
import UsageLedgerService from '../src/index.ts'

/** Append one usage-bearing assistant message to a live session. */
function appendUsage(session: Session, turn: number, step: number, usage: {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}, model = 'test'): void {
  const message = createAssistantMessage({
    content: [{ type: 'text', text: `step ${step}` }],
    source: { provider: 'test', model },
  })
  session.append('assistant/message', { turn, step, message, usage }, { surfaceOp: 'append' })
}

/** Compose the service over the real storage stack plus a live session store. */
async function setupFixture(): Promise<{ ctx: Context; dispose(): Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-usage-ledger-test-'))
  const ctx = new Context()
  try {
    await ctx.plugin(SessionStore)
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    await ctx.plugin(UsageLedgerService)
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

/** The current rows keyed by session id. */
async function rows(ctx: Context): Promise<Record<string, UsageLedgerRecord>> {
  const listed = await ctx.usageLedger.list()
  expect(listed.ok).toBe(true)
  const out: Record<string, UsageLedgerRecord> = {}
  if (listed.ok) {
    for (const row of listed.value.items) out[String(row.sessionId)] = row.record
  }
  return out
}

describe('usage ledger service', () => {
  test('accumulates usage samples per session, most recent first', async () => {
    const { ctx, dispose } = await setupFixture()
    try {
      const s1 = ctx.sessions.create(SessionId('u-1'), { meta: {} }).id
      const s2 = ctx.sessions.create(SessionId('u-2'), { meta: {} }).id

      appendUsage(ctx.sessions.get(s1)!, 1, 1, { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 1 })
      appendUsage(ctx.sessions.get(s1)!, 1, 2, { inputTokens: 20, outputTokens: 8 })
      // Separate the samples on the wall clock so the recency ordering is
      // deterministic even on coarse timers.
      await new Promise(resolve => setTimeout(resolve, 5))
      appendUsage(ctx.sessions.get(s2)!, 1, 1, { inputTokens: 100, outputTokens: 50 })

      const table = await rows(ctx)
      expect(table[String(s1)]).toMatchObject({ inputTokens: 30, outputTokens: 13, cacheReadTokens: 2, cacheWriteTokens: 1, requests: 2 })
      expect(table[String(s2)]).toMatchObject({ inputTokens: 100, outputTokens: 50, requests: 1 })

      // Most recently active first: s2 sampled last.
      const listed = await ctx.usageLedger.list()
      if (listed.ok) expect(listed.value.items[0]?.sessionId).toBe(s2)

      // Usage-free assistant messages accumulate nothing.
      const message = createAssistantMessage({
        content: [{ type: 'text', text: 'no usage' }],
        source: { provider: 'test', model: 'test' },
      })
      ctx.sessions.get(s2)?.append('assistant/message', { turn: 1, step: 2, message }, { surfaceOp: 'append' })
      expect((await rows(ctx))[String(s2)]?.requests).toBe(1)
    } finally {
      await dispose()
    }
  })

  test('slices samples per model and stamps the first-sample wall clock', async () => {
    const { ctx, dispose } = await setupFixture()
    try {
      const s1 = ctx.sessions.create(SessionId('m-1'), { meta: {} }).id
      appendUsage(ctx.sessions.get(s1)!, 1, 1, { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2 }, 'alpha')
      appendUsage(ctx.sessions.get(s1)!, 1, 2, { inputTokens: 20, outputTokens: 8, cacheWriteTokens: 3 }, 'alpha')
      appendUsage(ctx.sessions.get(s1)!, 1, 3, { inputTokens: 100, outputTokens: 50 }, 'beta')

      const listed = await ctx.usageLedger.list()
      expect(listed.ok).toBe(true)
      if (listed.ok) {
        const record = listed.value.items[0]?.record
        expect(record).toMatchObject({ inputTokens: 130, outputTokens: 63, cacheReadTokens: 2, cacheWriteTokens: 3, requests: 3 })
        expect(record?.firstAt).toBeGreaterThan(0)
        // Slice rollup reproduces the top-level totals: both count the same samples.
        expect(record?.models?.alpha).toMatchObject({ inputTokens: 30, outputTokens: 13, cacheReadTokens: 2, cacheWriteTokens: 3 })
        expect(record?.models?.beta).toMatchObject({ inputTokens: 100, outputTokens: 50, requests: 1 })
        // Day slices mirror the model slices: same samples, host-local day keys.
        const dayEntries = Object.entries(record?.days ?? {})
        expect(dayEntries).toHaveLength(1)
        const [dayKey, daySlice] = dayEntries[0] ?? []
        expect(dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(daySlice).toMatchObject({ inputTokens: 130, outputTokens: 63, requests: 3 })
      }
    } finally {
      await dispose()
    }
  })

  test('publishes the configured price table on list', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-usage-ledger-pricing-'))
    const ctx = new Context()
    try {
      await ctx.plugin(SessionStore)
      await ctx.plugin(Storage)
      await ctx.plugin(StorageJson, { root })
      await ctx.plugin(StorageDomain, { backend: 'json' })
      await ctx.plugin(UsageLedgerService, {
        pricing: { '*': { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0 } },
      })
      const listed = await ctx.usageLedger.list()
      expect(listed.ok).toBe(true)
      if (listed.ok) {
        expect(listed.value.pricing?.['*']).toMatchObject({ input: 0.27, output: 1.1 })
      }
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  test('entries survive a full service restart over the same storage root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-usage-ledger-restart-'))
    const first = new Context()
    try {
      await first.plugin(SessionStore)
      await first.plugin(Storage)
      await first.plugin(StorageJson, { root })
      await first.plugin(StorageDomain, { backend: 'json' })
      await first.plugin(UsageLedgerService)
      const session = first.sessions.create(SessionId('u-keep'), { meta: {} })
      appendUsage(session, 1, 1, { inputTokens: 7, outputTokens: 3, cacheWriteTokens: 4 }, 'keep')
      await expect.poll(async () => Object.keys(await rows(first)).length, { timeout: 5_000 }).toBe(1)
      await first.fiber.dispose()

      const second = new Context()
      try {
        await second.plugin(SessionStore)
        await second.plugin(Storage)
        await second.plugin(StorageJson, { root })
        await second.plugin(StorageDomain, { backend: 'json' })
        await second.plugin(UsageLedgerService)
        const table = await rows(second)
        expect(table[String(SessionId('u-keep'))]).toMatchObject({ inputTokens: 7, outputTokens: 3, cacheWriteTokens: 4, requests: 1 })
        // The restart path keeps the per-model slices: durable state, not
        // process-local bookkeeping.
        const listed = await second.usageLedger.list()
        if (listed.ok) {
          expect(listed.value.items[0]?.record.models?.keep).toMatchObject({ inputTokens: 7, outputTokens: 3, requests: 1 })
        }
      } finally {
        await second.fiber.dispose()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
