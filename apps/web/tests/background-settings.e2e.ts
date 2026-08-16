/** Background settings journey over a seeded transcript: opening Settings →
 * Background, selecting a preset paints the backdrop behind the conversation
 * while the chat message column keeps its readability veil, the dimming
 * slider changes the scrim live but never the veil, and None retracts to the
 * flat page. The web lane's golden pins the stable aria of the section page.
 * Zero model calls: a stray stream fails loud on the open llm seam. */

import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden, launchWebScaffold,
  seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { createChatScrollFixture } from './chat-scroll-fixture.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/background-settings', import.meta.url))
const SECTION_EXPECTED = join(SNAPSHOT_DIR, 'section.expected.md')
const MODE = webSnapshotMode()

/** One closed turn so the journey asserts against a rendered transcript. */
const VEIL_FIXTURE = createChatScrollFixture({ markerPrefix: 'VEIL', title: 'Backdrop veil journey', turns: 1 })
const VEIL_SESSION_ID = 'background-veil-journey'

// The seed's header line carries the only `{{cwd}}` placeholder this fixture
// has (one turn, no tool events); realizeSeedFixture substitutes the raw
// workspace path into it before re-parsing the line as JSON, and a Windows
// workspace path's backslashes are invalid JSON escapes. A POSIX literal keeps
// the line parseable everywhere; seedSession builds the persisted header with
// the real workspace cwd regardless, and the literal feeds only the fixture's
// own path-rewrite detector, which finds nothing else to rewrite.
const VEIL_LOG = VEIL_FIXTURE.log.replace('"cwd":"{{cwd}}"', '"cwd":"/veil-journey"')

/** Computed background color of the chat message column, the veil consumer. */
function chatColumnPaint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const column = document.querySelector('[class*="scroll"] > [class*="column"]') as HTMLElement | null
    if (column === null) throw new Error('chat message column missing')
    return getComputedStyle(column).backgroundColor
  })
}

/** Extract the alpha channel from a serialized css color (`rgba(...)` or `color(srgb ... / a)`). */
function colorAlpha(color: string): number {
  const slash = /\/\s*([\d.]+)\s*\)$/.exec(color)
  if (slash !== null) return Number(slash[1])
  const rgba = /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/.exec(color)
  if (rgba !== null) return Number(rgba[1])
  return 1
}

/** Open the seeded session through the sidebar search (the stable identity of a cold summary is the first user marker). */
async function openSeed(page: Page): Promise<void> {
  const searchButton = page.getByRole('button', { name: 'Search sessions' })
  if (await searchButton.getAttribute('aria-expanded') !== 'true') await searchButton.click()
  const search = page.getByRole('textbox', { name: 'Search sessions...', exact: true })
  await search.fill(VEIL_FIXTURE.markers.user(1))
  const results = page.getByRole('tree', { name: 'Search results' }).getByRole('treeitem')
  await expect.poll(() => results.count(), { timeout: 60_000 }).toBe(1)
  await results.click()
  await page.getByText(VEIL_FIXTURE.markers.assistant(1), { exact: false }).last().waitFor({ timeout: 30_000 })
}

describe('web e2e: background settings journey', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, VEIL_LOG, VEIL_SESSION_ID)
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
    await openSeed(page)
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

    // The readability veil stands over the transcript: translucent (the
    // backdrop shows through the fill) but not transparent (prose keeps a
    // readable base behind it).
    const veilAtPreset = await chatColumnPaint(page)
    expect(colorAlpha(veilAtPreset)).toBeGreaterThan(0)
    expect(colorAlpha(veilAtPreset)).toBeLessThan(1)

    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(SECTION_EXPECTED, snapshot, MODE)

    const slider = dialog.getByRole('slider', { name: 'Dimming' })
    await slider.fill('80')
    const dimmed = await page.evaluate(() => {
      const scrim = document.querySelector('[class*="scrim"]') as HTMLElement
      return getComputedStyle(scrim).backgroundColor
    })
    expect(dimmed).not.toBe(paint.scrimColor)
    // Dimming moves the scrim only: the veil is a fixed readability floor.
    expect(await chatColumnPaint(page)).toBe(veilAtPreset)

    await dialog.getByRole('button', { name: 'None' }).click()
    await expect.poll(
      () => page.evaluate(() => document.querySelector('style[data-dsh-background]')),
      { timeout: 5_000, message: 'background style must retract on none' },
    ).toBeNull()
    // Without a backdrop the column repaints the flat base: fully opaque.
    expect(colorAlpha(await chatColumnPaint(page))).toBe(1)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it.skipIf(MODE === 'record')('keeps the golden inventory closed', async () => {
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['section.expected.md'])
  })
})
