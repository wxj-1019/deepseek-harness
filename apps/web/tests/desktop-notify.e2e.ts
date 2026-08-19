// Web e2e scenario: the desktop-notification opt-in end to end through the
// real wire — the General settings row renders from the ui-desktop-notify
// namespace under a stubbed granted Web Notification API, a flip persists
// `enabled: true` into the settings document, and flipping back restores the
// shipped off state for the pinned page. Zero model calls: configuration is
// pure settings traffic, so there is no fixture and a stray stream would fail
// loud because the adapter registry is empty. The firing path itself (the
// running→idle edge over the session list) is covered by the package's
// jsdom bench over the real apply wiring; this scenario owns the assembled
// settings surface.
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

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/desktop-notify', import.meta.url))
const EXPECTED = join(SNAPSHOT_DIR, 'desktop-notify.expected.md')
const MODE = webSnapshotMode()

const ROW_LABEL = 'Desktop notification on completion'

/** Install a granted Web Notification API recording every construction. */
async function stubGrantedNotifications(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const shown: { title: string; body: string | undefined; tag: string | undefined }[] = []
    class StubNotification {
      static permission: NotificationPermission = 'granted'
      static readonly requestPermission = async (): Promise<NotificationPermission> => 'granted'
      onclick: (() => void) | null = null
      constructor(
        public readonly title: string,
        public readonly options?: { body?: string; tag?: string },
      ) {
        shown.push({ title, body: options?.body, tag: options?.tag })
      }
    }
    Object.defineProperty(window, 'Notification', { value: StubNotification, configurable: true })
    Object.defineProperty(window, '__desktopNotifications', { value: shown, configurable: true })
  })
}

describe('web e2e: Desktop notification settings row opts into the toast', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    await stubGrantedNotifications(page)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders the off row, and a flip persists into the settings document', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-desktop-notify'))
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.waitFor({ timeout: 10_000 })

    const toggle = dialog.getByRole('button', { name: ROW_LABEL, exact: true })
    await expect.poll(async () => toggle.getAttribute('aria-pressed'), { timeout: 10_000 }).toBe('false')
    await expect.poll(async () => toggle.isEnabled(), { timeout: 10_000 }).toBe(true)

    await toggle.click()
    await expect.poll(async () => toggle.getAttribute('aria-pressed'), { timeout: 10_000 }).toBe('true')
    // The opt-in lands in the durable document the watcher reads on boot.
    await expect.poll(async () => {
      const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
      return document.includes('ui-desktop-notify:') && document.includes('enabled: true')
    }, { timeout: 15_000 }).toBe(true)

    // Flip back so the pinned page shows the shipped off state.
    await toggle.click()
    await expect.poll(async () => toggle.getAttribute('aria-pressed'), { timeout: 10_000 }).toBe('false')

    const notifications = await page.evaluate(() => (window as unknown as {
      __desktopNotifications?: unknown[]
    }).__desktopNotifications)
    expect(notifications).toEqual([])

    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 60_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['desktop-notify.expected.md'])
  })
})
