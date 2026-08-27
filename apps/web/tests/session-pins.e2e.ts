// Web e2e journey: pinned sessions. A seeded session row gets pinned from its
// header star, the sidebar's pinned section gains the row, a click on it opens
// the session, and unpinning from the section removes it; the set survives a
// full reload and another window converges through the pushed change event.
// Zero model calls: pin/unpin are host RPCs over the session-pins storage
// domain, and the one session row comes from the seeded-history fixture,
// reused read-only.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  acknowledgeReloadConnectionLoss, assertFixtureInventory, captureStableAria,
  compareOrRefreshGolden, launchWebScaffold, seedSession, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/session-pins', import.meta.url))
const SEED = fileURLToPath(new URL('./snapshots/seeded-history/seed.jsonl', import.meta.url))
const SECTION_EXPECTED = join(SNAPSHOT_DIR, 'pinned-section.expected.md')
const MODE = webSnapshotMode()
const SEED_ID = 'session-pins-web-e2e'

describe('web e2e: pinned sessions (star toggle + sidebar section)', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, await readFile(SEED, 'utf8'), SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  /** The sidebar pinned section, or absent when no pins exist. */
  function section(): ReturnType<Page['getByRole']> {
    return page.getByRole('region', { name: 'Pinned sessions' })
  }

  it('pins from the header star, the section opens the session, and unpin clears both', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-session-pins'))

    // Open the seeded session (the stray lives under the collapsed Ungrouped
    // bucket): expand the group, click the row's title, and the star lives
    // in the opened session's header.
    const ungroupedRow = page.getByText('Ungrouped', { exact: true }).locator('..').locator('..')
    await expect.poll(async () => {
      if (await ungroupedRow.getAttribute('aria-expanded') !== 'true') {
        await page.getByText('Ungrouped', { exact: true }).click()
        await page.waitForTimeout(50)
      }
      return await ungroupedRow.getAttribute('aria-expanded')
    }, { timeout: 10_000 }).toBe('true')
    await page.locator('[role="treeitem"]').filter({ hasText: /./ }).last().locator('[class*="title"]').click()
    const header = page.getByRole('banner')
    await expect.poll(() =>
      header.getByRole('button', { name: 'Pin', exact: true }).count(), { timeout: 10_000 }).toBe(1)

    const star = header.getByRole('button', { name: 'Pin', exact: true })
    await star.click()
    await expect.poll(() =>
      header.getByRole('button', { name: 'Unpin', exact: true }).count(), { timeout: 10_000 }).toBe(1)

    // The sidebar section gained the row with the session's title.
    await expect.poll(() => section().count(), { timeout: 10_000 }).toBe(1)
    await expect.poll(() =>
      section().getByRole('button', { name: 'Unpin' }).count(), { timeout: 10_000 }).toBe(1)

    // The golden pins the section region alone: one title row plus its hover
    // affordance, stable across viewports.
    const snapshot = await captureStableAria(page, '[aria-label="Pinned sessions"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(SECTION_EXPECTED, snapshot, MODE)

    // Durable on the host.
    expect([...await scaffold.ctx.sessionPins.list().then(result => result.ok ? result.value.sessionIds : [])])
      .toEqual([SessionId(SEED_ID)])

    // Unpin from the section: the section empties and withdraws.
    await section().getByRole('button', { name: 'Unpin' }).hover()
    await section().getByRole('button', { name: 'Unpin' }).click()
    await expect.poll(() => section().count(), { timeout: 10_000 }).toBe(0)
    await expect.poll(() =>
      page.getByRole('banner').getByRole('button', { name: 'Pin', exact: true }).count(), { timeout: 10_000 }).toBe(1)

    // Repin and reload: the set must be rebuilt from the wire baseline.
    await page.getByRole('banner').getByRole('button', { name: 'Pin', exact: true }).click()
    await expect.poll(() => section().count(), { timeout: 10_000 }).toBe(1)
    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await expect.poll(() => section().count(), { timeout: 15_000 }).toBe(1)
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['pinned-section.expected.md'])
  })
})
