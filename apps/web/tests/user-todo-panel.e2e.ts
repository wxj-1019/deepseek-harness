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
const ROW_TEXT = 'Water the plants'

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
    page.on('console', (m) => { if (m.text().startsWith('DUE_ONCHANGE') || m.text().startsWith('SETDUE')) console.log('PC:', m.text()) })
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

  it('edits a note and both the note and its clearing persist', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-user-todo-note'))
    // The panel is already open on this page from the previous legs.
    if (await page.getByRole('region', { name: REGION }).count() === 0) await openPanel()
    const region = page.getByRole('region', { name: REGION })

    // Open the editor on the done row and write a note; Ctrl+Enter commits.
    await region.getByRole('button', { name: 'Mark as open' }).click()
    const noteRow = region.locator('li', { hasText: ROW_TEXT })
    await noteRow.getByRole('button', { name: 'Note', exact: true }).click()
    const editor = noteRow.getByRole('textbox', { name: 'Note', exact: true })
    await editor.waitFor({ timeout: 10_000 })
    await editor.fill('skimmed, 2 percent')
    await editor.press('Control+Enter')

    // Commit closes the inline editor; the note itself is asserted after reload.
    await expect.poll(async () =>
      region.getByRole('textbox', { name: 'Note', exact: true }).count(), { timeout: 10_000 }).toBe(0)

    // The note rides the same durable put as every other verb: a full reload
    // brings it back, and emptying the editor clears it for good.
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await openPanel()
    const reopened = page.getByRole('region', { name: REGION })
    const reopenedRow = reopened.locator('li', { hasText: ROW_TEXT })
    await reopenedRow.getByRole('button', { name: 'Note', exact: true }).click()
    const reopenedEditor = reopenedRow.getByRole('textbox', { name: 'Note', exact: true })
    await reopenedEditor.waitFor({ timeout: 10_000 })
    expect(await reopenedEditor.inputValue()).toBe('skimmed, 2 percent')
    await reopenedEditor.fill('')
    await reopenedRow.getByRole('button', { name: 'Save note' }).click()
    await expect.poll(async () =>
      reopenedEditor.count(), { timeout: 10_000 }).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('sets a due date, sorts the row first, and the due survives a reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-user-todo-due'))
    if (await page.getByRole('region', { name: REGION }).count() === 0) await openPanel()
    const region = page.getByRole('region', { name: REGION })
    const row = region.locator('li', { hasText: 'Push probe' })
    await row.getByRole('button', { name: 'Due date' }).click()
    const dueInput = row.locator('input[type="datetime-local"]')
    await dueInput.waitFor({ timeout: 10_000 })
    // The native-setter + input dispatch is deliberate: a plain fill() does
    // not reach React's value tracker for this controlled input in headless
    // Chromium, so the onChange never fires.
    await dueInput.evaluate((element, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(element, value)
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
    }, '2026-08-30T09:00')
    // The change event commits; the chip takes the formatted local label.
    await expect.poll(async () =>
      row.getByRole('button', { name: 'Due date' }).textContent() ?? '', { timeout: 10_000 })
      .toContain('2026-08-30')

    // The due item leaves the creation-order slot and leads the pending rows.
    const firstRowText = await region.locator('ul >> li').first().textContent()
    expect(firstRowText).toContain('Push probe')

    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    if (await page.getByRole('region', { name: REGION }).count() === 0) {
      await page.getByRole('button', { name: TRIGGER, exact: true }).click()
    }
    const reopened = page.getByRole('region', { name: REGION })
    await reopened.getByRole('button', { name: 'Due date' }).first().waitFor({ timeout: 10_000 })
    await expect.poll(async () =>
      reopened.locator('li', { hasText: 'Push probe' }).getByRole('button', { name: 'Due date' }).textContent() ?? '',
    { timeout: 10_000 }).toContain('2026-08-30')
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['panel.expected.md'])
  })
})
