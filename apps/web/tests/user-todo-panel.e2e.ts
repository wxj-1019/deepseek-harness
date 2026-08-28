// Web e2e journey: the daily-todo right-edge drawer. A seeded session pins
// the drawer's flows to real state: a row's expanded detail card carries the
// note editor, the due editor, and the project link picker; the due chip
// survives a full reload. Zero model calls in replay; the one session row
// comes from the seeded-history fixture, reused read-only.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/user-todo-panel', import.meta.url))
const SEED = fileURLToPath(new URL('./snapshots/seeded-history/seed.jsonl', import.meta.url))
const DRAWER_EXPECTED = join(SNAPSHOT_DIR, 'panel.expected.md')
const MODE = webSnapshotMode()
const SEED_ID = 'user-todo-panel-web-e2e'
const TRIGGER = 'Today\u2019s todos'
const REGION = 'Daily todo list'

describe('web e2e: daily-todo right-edge drawer', () => {
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

  it('adds an item, sets a due, and everything survives a reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-user-todo-drawer'))

    // Open the drawer from the right-edge tab.
    await page.getByRole('button', { name: TRIGGER, exact: true }).click()
    const drawer = page.getByRole('region', { name: REGION })
    await drawer.waitFor({ timeout: 10_000 })

    // Add one item from the composer (located structurally: the only
    // textbox in the drawer's top composer form).
    const composer = drawer.locator('form input').first()
    await composer.fill('Buy milk')
    await drawer.getByRole('button', { name: 'Add', exact: true }).click()
    const row = drawer.locator('li', { hasText: 'Buy milk' })
    await expect.poll(async () => row.count(), { timeout: 10_000 }).toBe(1)

    // Expand the row's detail card and set a note.
    await row.getByRole('button', { name: 'Details' }).click()
    const noteEditor = row.getByLabel('Note', { exact: true })
    await noteEditor.waitFor({ timeout: 10_000 })
    await noteEditor.fill('skimmed, 2 percent')

    // Set a due through the datetime editor.
    await row.locator('input[type="datetime-local"]').fill('2030-01-01T09:00')
    await expect.poll(async () =>
      row.locator('span[class*="dueChip"]').textContent(), { timeout: 10_000 }).toContain('2030-01-01')

    // Reload: title, note, and due are durable on the Host.
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await page.getByRole('button', { name: TRIGGER, exact: true }).click()
    const reopened = page.getByRole('region', { name: REGION })
    await reopened.waitFor({ timeout: 10_000 })
    await expect.poll(async () => reopened.getByText('Buy milk').count(), { timeout: 10_000 }).toBe(1)

    // The golden pins the open drawer: composer, the expanded row card with
    // its note editor and due input, and the due chip.
    const snapshot = await captureStableAria(page, '[aria-label="Daily todo list"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(DRAWER_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
  }, 120_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['panel.expected.md'])
  })
})
