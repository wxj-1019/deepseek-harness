/** Background settings journey: opening Settings → Background, selecting a
 * preset paints the backdrop behind the conversation, the dimming slider
 * changes the scrim live, and None retracts to the flat page. The web lane's
 * golden pins the stable aria of the section page. Zero model calls: a stray
 * stream fails loud on the open llm seam. */

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

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/background-settings', import.meta.url))
const SECTION_EXPECTED = join(SNAPSHOT_DIR, 'section.expected.md')
const MODE = webSnapshotMode()

describe('web e2e: background settings journey', () => {
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

  it('selects a preset, dims, and retracts', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-background-settings'))
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Background' }).click()
    // A fresh section is `none`, so the preset swatches are not rendered yet:
    // the Presets card enters preset mode before a swatch can be chosen.
    await dialog.getByRole('button', { name: 'Presets', exact: true }).click()
    await dialog.getByRole('radio', { name: 'Aurora' }).click()

    const paint = await page.evaluate(() => {
      const backdrop = document.querySelector('[class*="backdrop"]') as HTMLElement | null
      const scrim = document.querySelector('[class*="scrim"]') as HTMLElement | null
      if (backdrop === null || scrim === null) throw new Error('backdrop layers missing')
      return {
        image: getComputedStyle(backdrop).backgroundImage,
        scrimColor: getComputedStyle(scrim).backgroundColor,
      }
    })
    expect(paint.image).toContain('linear-gradient')
    expect(paint.scrimColor).not.toBe('rgba(0, 0, 0, 0)')

    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(SECTION_EXPECTED, snapshot, MODE)

    const slider = dialog.getByRole('slider', { name: 'Dimming' })
    await slider.fill('80')
    const dimmed = await page.evaluate(() => {
      const scrim = document.querySelector('[class*="scrim"]') as HTMLElement
      return getComputedStyle(scrim).backgroundColor
    })
    expect(dimmed).not.toBe(paint.scrimColor)

    await dialog.getByRole('button', { name: 'None' }).click()
    await expect.poll(
      () => page.evaluate(() => document.querySelector('style[data-dsh-background]')),
      { timeout: 5_000, message: 'background style must retract on none' },
    ).toBeNull()
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it.skipIf(MODE === 'record')('keeps the golden inventory closed', async () => {
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['section.expected.md'])
  })
})
