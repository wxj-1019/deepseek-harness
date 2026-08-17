// Web e2e scenario: the Dev checks settings page end to end through the real
// wire — the six per-machine gate switches render from the dev-checks
// namespace, a flip persists `e2e: false` into the same settings document the
// repo-side gate wrapper (scripts/dev-check-run.ts) reads, and flipping back
// restores the shipped all-on state for the pinned page. Zero model calls:
// configuration is pure settings traffic, so there is no fixture and a stray
// stream would fail loud because the adapter registry is empty.
import { readFile } from 'node:fs/promises'
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

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/dev-checks-settings', import.meta.url))
const EXPECTED = join(SNAPSHOT_DIR, 'dev-checks.expected.md')
const MODE = webSnapshotMode()

const ROW_LABELS = [
  'E2E (real API)',
  'Coverage',
  'Snapshot replay',
  'Doc sync',
  'Build & hygiene',
  'Pre-push typecheck',
]

describe('web e2e: Dev checks settings page switches local gates', () => {
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

  it('renders the six switches on, and a flip persists into the settings document', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-dev-checks'))
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Dev checks' }).click()
    await dialog.getByText('Per-machine switches', { exact: false }).waitFor({ timeout: 10_000 })

    // Every gate ships on; the switches enable once the scope's first read lands.
    for (const label of ROW_LABELS) {
      const toggle = dialog.getByRole('button', { name: label, exact: true })
      await expect.poll(async () => toggle.getAttribute('aria-pressed'), { timeout: 10_000 }).toBe('true')
      await expect.poll(async () => toggle.isEnabled(), { timeout: 10_000 }).toBe(true)
    }

    const e2eToggle = dialog.getByRole('button', { name: 'E2E (real API)', exact: true })
    await e2eToggle.click()
    await expect.poll(async () => e2eToggle.getAttribute('aria-pressed'), { timeout: 10_000 }).toBe('false')
    // The flip lands in the document the repo-side gate wrapper reads.
    await expect.poll(async () => {
      const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
      return document.includes('dev-checks:') && document.includes('e2e: false')
    }, { timeout: 15_000 }).toBe(true)

    // Flip back so the pinned page shows the shipped all-on state.
    await e2eToggle.click()
    await expect.poll(async () => e2eToggle.getAttribute('aria-pressed'), { timeout: 10_000 }).toBe('true')

    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 60_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['dev-checks.expected.md'])
  })
})
