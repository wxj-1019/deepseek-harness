import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { setupLibrary } from './helpers.ts'

/**
 * Build a minimal real checkout tree the watcher can observe. The root is
 * resolved to its long path: a short-path temp root (ADMINI~1) trips a libuv
 * fs-event assertion on Windows the moment the first change arrives.
 */
async function makeCheckout(): Promise<string> {
  const root = realpathSync.native(await mkdtemp(join(tmpdir(), 'dsh-component-library-watch-')))
  const client = join(root, 'packages', 'client', 'ui-live', 'src', 'client')
  await mkdir(client, { recursive: true })
  const theme = join(root, 'packages', 'client', 'ui-theme', 'src', 'styles')
  await mkdir(theme, { recursive: true })
  await writeFile(join(root, 'packages', 'client', 'ui-live', 'package.json'), '{"name":"@deepseek-ai/dsh-client-ui-live","type":"module"}\n')
  await writeFile(join(client, 'First.tsx'), '/** First live component. */\nexport function First() { return null }\n')
  await writeFile(join(theme, 'design-platform.css'), ':root {\n  --dsw-alias-label-primary: red;\n}\n')
  return root
}

describe('watcher-driven continuous learning', () => {
  it('re-learns a settled file and forgets a removed one', async () => {
    const root = await makeCheckout()
    const harness = await setupLibrary({ root, watch: true })
    try {
      const service = harness.ctx.componentLibrary
      expect(service.snapshotAll().map(record => record.id)).toEqual(['ui-live/First'])

      // Settled edit: a second component appears in the same file.
      const firstFile = join(root, 'packages', 'client', 'ui-live', 'src', 'client', 'First.tsx')
      await writeFile(firstFile, 'export function First() { return null }\nexport function Second(props: { label: string }) { return null }\n')
      await vi.waitFor(() => {
        expect(service.snapshotAll().map(record => record.id)).toContain('ui-live/Second')
      }, { timeout: 10000, interval: 100 })

      // Removal drops every record sourced from the file.
      await rm(firstFile)
      await vi.waitFor(() => {
        expect(service.snapshotAll()).toEqual([])
      }, { timeout: 10000, interval: 100 })
    } finally {
      await harness.dispose()
      await rm(root, { recursive: true, force: true })
    }
  }, 30000)

  it('re-reads the token inventory when the theme stylesheet settles', async () => {
    const root = await makeCheckout()
    const harness = await setupLibrary({ root, watch: true })
    try {
      const service = harness.ctx.componentLibrary
      expect(service.designTokens.map(token => token.name)).toEqual(['--dsw-alias-label-primary'])

      const theme = join(root, 'packages', 'client', 'ui-theme', 'src', 'styles', 'design-platform.css')
      await writeFile(theme, ':root {\n  --dsw-alias-label-primary: red;\n  --dsw-static-ink: #101010;\n}\n')
      await vi.waitFor(() => {
        expect(service.designTokens.map(token => token.name)).toContain('--dsw-static-ink')
      }, { timeout: 10000, interval: 100 })
    } finally {
      await harness.dispose()
      await rm(root, { recursive: true, force: true })
    }
  }, 30000)

  it('never learns a component declared outside src/client', async () => {
    const root = await makeCheckout()
    const harness = await setupLibrary({ root, watch: true })
    try {
      const service = harness.ctx.componentLibrary
      const testsDir = join(root, 'packages', 'client', 'ui-live', 'tests')
      await mkdir(testsDir, { recursive: true })
      await writeFile(join(testsDir, 'Late.spec.tsx'), 'export function Late() { return null }\n')
      // Quiescent window: a wrongly relevant event would settle within ~300 ms.
      await new Promise(resolve => setTimeout(resolve, 1000))
      expect(service.snapshotAll().map(record => record.id)).toEqual(['ui-live/First'])
    } finally {
      await harness.dispose()
      await rm(root, { recursive: true, force: true })
    }
  }, 30000)
})
