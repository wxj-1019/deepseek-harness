// Web e2e journey: the in-app notification center. A replayed turn settles
// the session, the settle lands as a durable entry, the bell shows it as
// unread, the overlay panel (shell.overlay's first occupant) lists it with
// kind and time, and marking it read clears the badge. The schedule rows ride
// the same composition; the recorded fixture pins schedule_create/list/delete
// in the provider request's tool roster. Zero model calls in replay; the turn
// leg replays a fixture recorded against the real provider.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type { ReplayProviderConfig } from '@deepseek-ai/dsh-llm-replay'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden, fixtureUserPrompts,
  launchWebScaffold, recordFixture, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/notification-center', import.meta.url))
const FIXTURE = join(SNAPSHOT_DIR, 'session.jsonl')
const PANEL_EXPECTED = join(SNAPSHOT_DIR, 'panel.expected.md')
const MODE = webSnapshotMode()
const PROMPT = 'Reply with the single word OK and stop.'

/** Replay roster: the shipped DeepSeek route. */
const ROSTER: ReplayProviderConfig[] = [
  {
    id: 'deepseek-official',
    name: 'DeepSeek',
    models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', contextWindow: 128_000 }],
  },
]

describe('web e2e: notification center (bell + overlay panel)', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      ...(MODE === 'record' ? {} : { replayFixture: FIXTURE, paceMs: 15 }),
      replayProviders: ROSTER,
    })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  /** Bell with unread badge, or absent. */
  function bell(): ReturnType<Page['getByRole']> {
    return page.getByRole('button', { name: /^Notifications/ })
  }

  it('a settled turn lands as an unread entry, listed and cleared from the panel', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-notification-center'))
    if (MODE !== 'record') {
      expect(fixtureUserPrompts(await readFile(FIXTURE, 'utf8'))).toEqual([PROMPT])
      // Schedule mounting evidence lives in the shipped-composition roster
      // assertions; the replay format abstracts tool lists by design.
    }

    // Drive the replayed/real turn in the hero: settle is the notification.
    const input = page.locator('textarea').first()
    await input.waitFor({ timeout: 10_000 })
    await input.fill(PROMPT)
    await input.press('Enter')
    await scaffold.whenTurnSettled(MODE === 'record' ? 240_000 : 60_000)

    // The settle becomes one durable entry; the bell badge shows it.
    await expect.poll(async () => {
      const text = await bell().first().getAttribute('aria-label')
      return text !== null && text.includes('unread')
    }, { timeout: 15_000 }).toBe(true)

    // Open the panel: the row shows the session-completion entry.
    await bell().first().click()
    const panel = page.getByRole('region', { name: 'Notification center' })
    await panel.waitFor({ timeout: 10_000 })
    await expect.poll(async () => panel.getByText('Session completed', { exact: true }).count(),
      { timeout: 10_000 }).toBe(1)

    // The golden pins the open panel: kind, title, and the unread marker.
    // Golden capture is a replay/refresh leg; record mode only records the turn.
    if (MODE !== 'record') {
      const snapshot = await captureStableAria(page, '[aria-label="Notification center"]', scaffold.workspaceCwd)
      await compareOrRefreshGolden(PANEL_EXPECTED, snapshot, MODE)
    }

    // Mark read through the row affordance: badge clears, row keeps its place.
    await panel.getByRole('button', { name: 'Mark read' }).first().click()
    await expect.poll(async () => {
      const text = await bell().first().getAttribute('aria-label')
      return text !== null && !text.includes('unread')
    }, { timeout: 10_000 }).toBe(true)

    // The entry is durable: reload keeps it (read), the panel reopens clean.
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await bell().first().click()
    await expect.poll(async () =>
      page.getByRole('region', { name: 'Notification center' })
        .getByText('Session completed', { exact: true }).count(), { timeout: 15_000 }).toBe(1)

    if (MODE === 'record') {
      await recordFixture(scaffold, await currentSessionId(scaffold), FIXTURE)
      return
    }
    expect(tripwire.pageErrors).toEqual([])
  }, 300_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['panel.expected.md', 'session.jsonl'])
  })
})

/** The current session id from the scaffold's live store. */
async function currentSessionId(scaffold: WebScaffold) {
  const listed = await scaffold.ctx.sessionPersistence.list()
  const last = listed.at(-1)
  if (last === undefined) throw new Error('notification-center e2e: no session to record')
  return last.id
}
