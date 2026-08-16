/** Aqua glass-theme journey over the assembled web app: the durable ui-aqua
 * section paints the glass from boot, mode flips ride the settings scope and
 * survive reload, a wallpaper upload lands in the attachments store through
 * /backgrounds and serves back after reload, and the Plugins master switch
 * retracts every owned effect. The web lane's golden pins the stable aria of
 * the General settings page. Zero model calls: a stray stream fails loud on
 * the open llm seam. */

import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden, launchWebScaffold,
  watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/aqua-theme', import.meta.url))
const GENERAL_EXPECTED = join(SNAPSHOT_DIR, 'general.expected.md')
const MODE = webSnapshotMode()

/** One real 1x1 PNG (the attachment-local suite's constant): it must fully decode at admission. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

/** The aqua light-mode base token the boot style and the override layer both paint. */
const AQUA_LIGHT_BASE = '#F4F8FD'

describe('web e2e: aqua glass theme journey', () => {
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
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('paints the glass layer from the durable section at boot', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-aqua-boot'))
    await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-dsh-aqua')), {
      timeout: 15_000,
    }).toBe(true)
    // The override layer (boot style now, theme presenter after activation)
    // owns the base token.
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body)
      .getPropertyValue('--dsw-alias-bg-base').trim().toUpperCase()), { timeout: 15_000 })
      .toBe(AQUA_LIGHT_BASE)
    expect(await page.evaluate(() => document.querySelector('[data-dsh-aqua-ambient]') !== null)).toBe(true)
  }, 60_000)

  it('flips compat mode durably and the flip survives reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-aqua-mode'))
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'General' }).click()
    await dialog.getByRole('button', { name: 'Compatibility' }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-dsh-compat')), {
      timeout: 5_000,
    }).toBe(true)
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    // The durable section feeds the boot script: compat stands after reload.
    await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-dsh-compat')), {
      timeout: 15_000,
    }).toBe(true)
  }, 60_000)

  it('uploads a wallpaper through /backgrounds and it survives reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-aqua-wallpaper'))
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'General' }).click()
    await dialog.getByRole('button', { name: 'Wallpaper', exact: true }).click()
    await dialog.getByRole('button', { name: 'Choose image' }).click()
    await page.setInputFiles('input[accept^="image/"]', { name: 'wall.png', mimeType: 'image/png', buffer: PNG_1X1 })
    await expect.poll(() => page.evaluate(() => {
      const img = document.querySelector('[data-dsh-aqua-wallpaper-img]')
      return img === null ? '' : img.getAttribute('src') ?? ''
    }), { timeout: 15_000, message: 'wallpaper image must mount from the route' })
      .toContain('/backgrounds/current')

    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(GENERAL_EXPECTED, snapshot, MODE)

    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await expect.poll(() => page.evaluate(() => {
      const img = document.querySelector('[data-dsh-aqua-wallpaper-img]')
      return img === null ? '' : img.getAttribute('src') ?? ''
    }), { timeout: 15_000, message: 'the stored wallpaper must remount after reload' })
      .toContain('/backgrounds/current')
    // The pick re-encodes through the client-side downscale, so the stored
    // object is the compact JPEG that pipeline produces.
    const served = await page.evaluate(async () => {
      const response = await fetch('/backgrounds/current')
      return { status: response.status, type: response.headers.get('content-type') ?? '' }
    })
    expect(served).toEqual({ status: 200, type: 'image/jpeg' })
  }, 90_000)

  it('the Plugins master switch retracts every owned effect', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-aqua-off'))
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Plugins' }).click()
    await dialog.getByRole('listitem').filter({ hasText: 'Glass theme' })
      .getByRole('button', { name: 'On', exact: true }).click()
    await expect.poll(() => page.evaluate(() => ({
      aqua: document.documentElement.hasAttribute('data-dsh-aqua'),
      compat: document.documentElement.hasAttribute('data-dsh-compat'),
      ambient: document.querySelector('[data-dsh-aqua-ambient]') !== null,
    })), { timeout: 5_000 }).toEqual({ aqua: false, compat: false, ambient: false })
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it.skipIf(MODE === 'record')('keeps the golden inventory closed', async () => {
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['general.expected.md'])
  })
})
