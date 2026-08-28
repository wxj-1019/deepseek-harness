// Web e2e journey: the usage tab's terminal-style statistics. A replayed
// live turn (scripted model, real agent loop) accumulates real ledger rows;
// the journey then opens the Usage tab and pins the summary strip, the
// per-model breakdown, and the per-session table. Zero model calls in replay.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  captureStableAria, compareOrRefreshGolden, fixtureUserPrompts,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/usage-panel', import.meta.url))
const FIXTURE = fileURLToPath(new URL('./snapshots/fresh-round-trip/session.jsonl', import.meta.url))
const GOLDEN = join(SNAPSHOT_DIR, 'panel.expected.md')
const MODE = webSnapshotMode()
const PROMPT = 'Use the bash tool to run exactly: echo WEB_E2E_OK. Then reply with the single word DONE and stop.'

describe('web e2e: usage tab statistics', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      ...(MODE === 'record' ? {} : { replayFixture: FIXTURE, paceMs: 15 }),
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

  it('accumulates a live turn and pins the usage statistics', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-usage-panel'))
    if (MODE !== 'record') {
      expect(fixtureUserPrompts(await readFile(FIXTURE, 'utf8'))).toContain(PROMPT)
    }

    // One live turn through the real agent loop: the ledger accumulates the
    // usage-bearing assistant messages as they stream.
    const input = page.locator('textarea').first()
    await input.waitFor({ timeout: 10_000 })
    const settled = scaffold.whenTurnSettled()
    await input.fill(PROMPT)
    await input.press('Enter')
    await settled
    await expect.poll(() => input.isEnabled(), { timeout: 30_000 }).toBe(true)
    // The turn must actually have produced the recorded reply before the
    // ledger assertions mean anything.
    await expect.poll(() => page.getByText('DONE', { exact: true }).count(), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1)

    // Open the usage tab; the strip must show the accumulated turn (the
    // fixture records exactly two usage samples; textContent carries no
    // inter-node whitespace, so the match hugs the markup).
    await page.getByRole('tab', { name: 'Usage', exact: true }).click()
    await expect.poll(async () =>
      page.getByRole('group', { name: 'Usage summary' }).textContent(), { timeout: 15_000 })
      .toContain('Requests2')
    console.log('TABLE_COUNT', await page.getByRole('table').count())
    console.log('SECTION_TEXT', (await page.locator('[data-usage-panel]').textContent())?.slice(0, 300))
    await expect.poll(async () =>
      page.getByRole('group', { name: 'Usage summary' }).textContent(), { timeout: 15_000 })
      .toContain('Requests2')

    const snapshot = await captureStableAria(page, '[data-usage-panel]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(GOLDEN, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
  }, 200_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    const { readdir } = await import('node:fs/promises')
    expect((await readdir(SNAPSHOT_DIR)).sort()).toEqual(['panel.expected.md'])
  })
})
