// Web e2e scenario: the click-to-upload image entry end to end through the
// real wire. The composer's attach button opens the file picker; a chosen
// image rides the intake path the whole-page drop uses and lands as a
// thumbnail in the composer rail — no model call, so the scenario is keyless
// without fixtures. The intake pre-check reads the projected imageLimits from
// the host, which the attachment service serves with the shipped defaults.
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory,
  captureStableAria,
  compareOrRefreshGolden,
  launchWebScaffold,
  watchConsole,
  webSnapshotMode,
  type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/composer-attach', import.meta.url))
const EXPECTED = fileURLToPath(new URL('./snapshots/composer-attach/composer.expected.md', import.meta.url))
const MODE = webSnapshotMode()

/** A tiny valid PNG the browser can load into the rail thumbnail. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

describe('web e2e: composer image upload entry', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
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

  it('uploads an image through the attach button into the composer rail', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-composer-attach'))
    const attach = page.getByRole('button', { name: 'Attach image', exact: true })
    await attach.waitFor({ timeout: 15_000 })
    expect(await attach.isEnabled()).toBe(true)

    // The button opens a hidden file input; choose the image through it.
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({ name: 'composer.png', mimeType: 'image/png', buffer: PNG })
    // The intake lands a thumbnail in the composer rail (64px tile / 240px lone).
    await expect.poll(async () => page.locator('[data-composer-card] img').count(), {
      timeout: 10_000,
    }).toBeGreaterThan(0)

    const snapshot = await captureStableAria(page, '[data-composer-card]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 60_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['composer.expected.md'])
  })
})
