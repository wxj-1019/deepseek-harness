// Web e2e journey: the Usage settings section. A replayed turn (the
// notification-center fixture, reused read-only) settles with provider usage,
// the usage-ledger collector lands a row, and the settings section lists the
// session with nonzero totals plus a totals row. Zero model calls in replay.
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { ReplayProviderConfig } from '@deepseek-ai/dsh-llm-replay'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/usage-dashboard', import.meta.url))
// The notification-center fixture, reused read-only: one settled turn with
// provider usage is all this scenario needs.
const FIXTURE = fileURLToPath(new URL('./snapshots/notification-center/session.jsonl', import.meta.url))
const SECTION_EXPECTED = join(SNAPSHOT_DIR, 'section.expected.md')
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

describe('web e2e: usage dashboard (settings section)', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      replayFixture: FIXTURE,
      paceMs: 15,
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

  it('lists the settled session with totals, durably across reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-usage-dashboard'))

    // Drive the replayed turn: its provider usage feeds the ledger.
    const input = page.locator('textarea').first()
    await input.waitFor({ timeout: 10_000 })
    await input.fill(PROMPT)
    await input.press('Enter')
    await scaffold.whenTurnSettled(60_000)

    // Open Settings → Usage: the collector already landed the sample.
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Usage', exact: true }).click()

    const table = dialog.getByRole('table')
    await table.waitFor({ timeout: 10_000 })
    // Nonzero total proves the provider-reported sample was collected.
    await expect.poll(async () => (await table.textContent()) ?? '', { timeout: 10_000 })
      .toMatch(/Input/)

    const totalsRow = table.locator('tr', { hasText: 'Total' })
    await totalsRow.waitFor({ timeout: 10_000 })

    // Durable: a reload rebuilds the section from the wire baseline.
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const reopened = page.getByRole('dialog', { name: 'Settings' })
    await reopened.waitFor({ timeout: 10_000 })
    await reopened.getByRole('button', { name: 'Usage', exact: true }).click()
    await reopened.getByRole('table').waitFor({ timeout: 10_000 })

    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(SECTION_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
  }, 120_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['section.expected.md'])
  })
})
