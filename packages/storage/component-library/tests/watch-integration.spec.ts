import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { setupLibrary } from './helpers.ts'

/** Build a minimal real checkout tree the watcher can observe. */
async function makeCheckout(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-component-library-watch-'))
  const client = join(root, 'packages', 'client', 'ui-live', 'src', 'client')
  await mkdir(client, { recursive: true })
  await writeFile(join(root, 'packages', 'client', 'ui-live', 'package.json'), '{"name":"@deepseek-ai/dsh-client-ui-live","type":"module"}\n')
  await writeFile(join(client, 'First.tsx'), '/** First live component. */\nexport function First() { return null }\n')
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
})
