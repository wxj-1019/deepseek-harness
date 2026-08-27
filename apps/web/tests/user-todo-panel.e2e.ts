// Web e2e scenario: the daily-todo sidebar panel end to end through the real
// wire — an item added from the composer persists into the user-todo storage
// domain, the done flip survives a full page reload, and the pinned open-panel
// snapshot shows the today view (open items carried over, plus completions).
// Zero model calls: the surface is pure storage-domain traffic, so there is no
// fixture and a stray stream would fail loud because the adapter registry is
// empty.
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/user-todo-panel', import.meta.url))
const PANEL_EXPECTED = join(SNAPSHOT_DIR, 'panel.expected.md')
const MODE = webSnapshotMode()

const TRIGGER = 'Today’s todos'
const REGION = 'Daily todo list'
const COMPOSER = 'Add a todo, Enter to confirm'

describe('web e2e: daily-todo sidebar panel', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let pageTwo: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    pageTwo = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await pageTwo.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await pageTwo.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  /** Open the trigger and wait for the region. */
  async function openPanel(): Promise<void> {
    await page.getByRole('button', { name: TRIGGER, exact: true }).click()
    await page.getByRole('region', { name: REGION }).waitFor({ timeout: 10_000 })
  }

  it('adds an item, completes it, and both survive a reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-user-todo'))
    await openPanel()

    const region = page.getByRole('region', { name: REGION })
    const composer = region.getByLabel(COMPOSER)
    await composer.fill('Buy milk')
    await region.getByRole('button', { name: 'Add', exact: true }).click()

    const check = region.getByRole('button', { name: 'Mark as done' })
    await expect.poll(async () => check.count(), { timeout: 10_000 }).toBe(1)
    await expect.poll(async () => region.getByText('Buy milk').count(), { timeout: 10_000 }).toBe(1)

    await check.click()
    await expect.poll(async () =>
      region.getByRole('button', { name: 'Mark as open' }).count(), { timeout: 10_000 }).toBe(1)

    // A reload walks the whole stack again: built bundle → Remote → domain.
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await openPanel()
    const reopenedRegion = page.getByRole('region', { name: REGION })
    await expect.poll(async () =>
      reopenedRegion.getByRole('button', { name: 'Mark as open' }).count(),
    { timeout: 10_000 }).toBe(1)
    await expect.poll(async () => reopenedRegion.getByText('Buy milk').count(), { timeout: 10_000 }).toBe(1)

    // Leave one open row so the replayed golden shows both day buckets.
    const composer2 = page.getByRole('region', { name: REGION }).getByLabel(COMPOSER)
    await composer2.fill('Water the plants')
    await page.getByRole('region', { name: REGION }).getByRole('button', { name: 'Add', exact: true }).click()
    await expect.poll(async () =>
      page.getByRole('region', { name: REGION }).getByRole('button', { name: 'Mark as done' }).count(),
    { timeout: 10_000 }).toBe(1)

    const snapshot = await captureStableAria(page, '[aria-label="Daily todo list"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(PANEL_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 60_000)


  it('converges a second window through the pushed change event', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-user-todo-push'))
    // Window one's panel is already open from the previous leg (same page and
    // same harness home); only window two opens fresh here.
    if (await page.getByRole('region', { name: REGION }).count() === 0) await openPanel()
    await pageTwo.getByRole('button', { name: TRIGGER, exact: true }).click()
    const regionTwo = pageTwo.getByRole('region', { name: REGION })
    await regionTwo.waitFor({ timeout: 10_000 })

    // A cold list in window two converges without any polling code: the
    // allowlisted `user-todo/changed` push drives exactly one refetch.
    const composer = page.getByRole('region', { name: REGION }).getByLabel(COMPOSER)
    await composer.fill('Push probe')
    await page.getByRole('region', { name: REGION }).getByRole('button', { name: 'Add', exact: true }).click()
    await expect.poll(async () => regionTwo.getByText('Push probe').count(), { timeout: 10_000 }).toBe(1)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['panel.expected.md'])
  })
})
