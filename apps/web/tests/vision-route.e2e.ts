// Web e2e journey: vision-model routing. The Settings page configures the
// vision route (provider + model over the image-capable catalog), the
// configured route reroutes the first image-bearing request to the vision
// model, and the session stays on that model afterwards — its history now
// carries the image, which a text-only adapter rejects. Zero-model-call
// surfaces stay keyless; the routing leg replays a fixture recorded against
// the real vision provider.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ReplayProviderConfig } from '@deepseek-ai/dsh-llm-replay'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden, fixtureUserPrompts,
  launchWebScaffold, recordFixture, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/vision-route', import.meta.url))
const FIXTURE = join(SNAPSHOT_DIR, 'session.jsonl')
const SETTINGS_EXPECTED = join(SNAPSHOT_DIR, 'settings.expected.md')
const MODE = webSnapshotMode()

/**
 * Replay roster: the shipped text-only DeepSeek route plus a declared vision
 * route. The session model stays text-only so routing is observable.
 */
const ROSTER: ReplayProviderConfig[] = [
  {
    id: 'deepseek-official',
    name: 'DeepSeek',
    models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', contextWindow: 128_000 }],
  },
  {
    id: 'qwen-dashscope',
    name: 'Qwen (DashScope)',
    models: [{
      id: 'qwen3-vl-plus', name: 'Qwen3-VL-Plus', contextWindow: 128_000,
      inputModalities: ['text', 'image'],
    }],
  },
]

/**
 * A 64x64 two-color PNG (left warm, right cool): small enough to embed,
 * large enough for the vision model's minimum dimensions, and with content
 * the model can describe.
 */
const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAbElEQVR4nO3QMQ0AMAgAMCQhAWlIxckmg5D0qIHGVL1N2bMqBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAgPsBH9IlckoGb+09AAAAAElFTkSuQmCC',
  'base64',
)

const IMAGE_PROMPT = 'What is in this image? Answer in one sentence.'
const TEXT_PROMPT = 'Reply with the single word OK and stop.'

describe('web e2e: vision-model routing', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  const sessionEvents: SessionEvent[] = []

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      ...(MODE === 'record' ? {} : { replayFixture: FIXTURE, paceMs: 15 }),
      replayProviders: ROSTER,
    })
    if (MODE === 'record') {
      // The real vision route: the pi-ai adapter mounts the provider profile
      // from its settings namespace; the key resolves from the repo-root .env.
      // Registration is reactive, so wait for the route to land before the
      // browser's catalog loads.
      await scaffold.ctx.settings.replace('llm-pi-ai', {
        providers: {
          'qwen-dashscope': {
            apiKeyEnv: 'DASHSCOPE_API_KEY',
            api: 'openai-completions',
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            models: [{ id: 'qwen3-vl-plus', input: ['text', 'image'] }],
          },
        },
      })
      const deadline = Date.now() + 15_000
      while (!scaffold.ctx.llm.listProviders().some(provider => provider.id === 'qwen-dashscope')) {
        if (Date.now() > deadline) throw new Error('vision-route e2e: qwen-dashscope route never registered')
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
    scaffold.ctx.on('session/event', (_session, event: SessionEvent) => { sessionEvents.push(event) })
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

  it('configures the vision model in Settings and it persists', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-vision-settings'))
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Vision model' }).click()
    // Only image-capable models are selectable: qwen3-vl-plus under the
    // qwen-dashscope provider (the text-only DeepSeek route is absent).
    const provider = dialog.getByRole('combobox', { name: 'Provider' })
    await provider.waitFor({ timeout: 10_000 })
    await expect.poll(async () => provider.locator('option[value="qwen-dashscope"]').count(), {
      timeout: 10_000,
    }).toBe(1)
    await provider.selectOption('qwen-dashscope')
    const model = dialog.getByRole('combobox', { name: 'Model' })
    await expect.poll(async () => model.locator('option[value="qwen3-vl-plus"]').count(), {
      timeout: 10_000,
    }).toBe(1)
    await model.selectOption('qwen3-vl-plus')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(async () => {
      const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
      return document.includes('vision-model:') && document.includes('qwen3-vl-plus')
    }, { timeout: 15_000 }).toBe(true)
    await page.keyboard.press('Escape')
    await expect.poll(() => page.getByRole('dialog').count(), { timeout: 10_000 }).toBe(0)
  }, 60_000)

  it.skipIf(MODE === 'record')('pins the configured Vision model page', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Vision model' }).click()
    // The section loads asynchronously; the golden must pin the ready state
    // (enabled selects over the stored route), not the loading skeleton.
    const provider = dialog.getByRole('combobox', { name: 'Provider' })
    await expect.poll(async () => provider.isEnabled(), { timeout: 10_000 }).toBe(true)
    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(SETTINGS_EXPECTED, snapshot, MODE)
    await page.keyboard.press('Escape')
    await expect.poll(() => page.getByRole('dialog').count(), { timeout: 10_000 }).toBe(0)
  })

  it('routes the image-bearing turn to the vision model and the session stays there', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-vision-route'))
    if (MODE !== 'record') {
      expect(fixtureUserPrompts(await readFile(FIXTURE, 'utf8'))).toEqual([IMAGE_PROMPT, TEXT_PROMPT])
    }
    const input = page.locator('textarea').first()
    await input.waitFor({ timeout: 10_000 })

    // The composer admits images through paste/drop; a synthetic drop is the
    // same intake path a real user drags through.
    await page.evaluate(([bytes]) => {
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array(bytes)], 'pixel.png', { type: 'image/png' }))
      document.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    }, [Array.from(TEST_PNG)])
    await expect.poll(async () => page.locator('[role="group"][aria-label="Pending images"]').count(), {
      timeout: 15_000,
    }).toBe(1)

    const firstSettled = scaffold.whenTurnSettled(MODE === 'record' ? 240_000 : 60_000)
    await input.fill(IMAGE_PROMPT)
    await input.press('Enter')
    const sessionId = await firstSettled

    const imageReply = sessionEvents.filter((event): event is SessionEvent<'assistant/message'> =>
      event.type === 'assistant/message').at(-1)
    expect(imageReply?.data.message.source).toMatchObject({ kind: 'model', provider: 'qwen-dashscope', model: 'qwen3-vl-plus' })
    const replyText = imageReply?.data.message.content
      .filter(block => block.type === 'text').map(block => block.text).join('')
    expect(replyText?.length ?? 0).toBeGreaterThan(0)
    if (replyText !== undefined && replyText.length > 0) {
      await expect.poll(() => page.getByText(replyText, { exact: false }).count(), { timeout: 20_000 })
        .toBeGreaterThanOrEqual(1)
    }

    // The session history now carries the image, so later text-only turns
    // stay on the vision model (a text-only adapter rejects the history).
    const secondSettled = scaffold.whenTurnSettled(MODE === 'record' ? 240_000 : 60_000)
    await input.fill(TEXT_PROMPT)
    await input.press('Enter')
    await secondSettled

    const textReply = sessionEvents.filter((event): event is SessionEvent<'assistant/message'> =>
      event.type === 'assistant/message').at(-1)
    expect(textReply?.data.message.source).toMatchObject({ kind: 'model', provider: 'qwen-dashscope', model: 'qwen3-vl-plus' })
    expect(textReply?.data.message.content.some(block =>
      block.type === 'text' && block.text.trim().length > 0)).toBe(true)

    if (MODE === 'record') {
      await recordFixture(scaffold, sessionId, FIXTURE)
      return
    }
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 300_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['session.jsonl', 'settings.expected.md'])
  })
})
