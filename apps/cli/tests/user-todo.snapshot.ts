/** Assembled snapshot: the user-todos pre-step catalog, on and off. */
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const binScript = fileURLToPath(new URL('./fixtures/user-todo/snapshot.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/user-todo/cordis.yml', import.meta.url))
const defaultConfigPath = fileURLToPath(new URL('./fixtures/user-todo/default.cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))

describe('user-todo model-visible catalog', () => {
  it('projects a full-replacement catalog at the step boundary, digest-gated', async () => {
    const enabled = await runLoaderSmoke({
      label: 'user-todo model-visible snapshot',
      tempDirPrefix: 'headless-snapshot-user-todo-on-',
      binScript,
      libBinScript: binScript,
      configPath,
      tsconfigPath,
    })
    const snapshot = JSON.parse(enabled.stdout) as {
      initialForm: string | null
      initialLines: string[] | null
      secondNew: number
      updateForm: string | null
      updateLines: string[] | null
    }

    expect(enabled.stderr).toBe('')
    expect(snapshot.initialForm).toBe('catalog')
    expect(snapshot.initialLines).toEqual([
      'Open items:',
      '- [ ] Buy milk (due: 2026-08-30 09:00) (project: Demo WS)',
      '- [ ] Water the plants',
    ])
    expect(snapshot.secondNew).toBe(0)
    expect(snapshot.updateForm).toBe('catalog-update')
    expect(snapshot.updateLines).toEqual(['Open items:', '- [ ] Water the plants'])
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)

  it('ships no catalog when the deployment leaves the projection off', async () => {
    const disabled = await runLoaderSmoke({
      label: 'user-todo model-hidden snapshot',
      tempDirPrefix: 'headless-snapshot-user-todo-off-',
      binScript,
      libBinScript: binScript,
      configPath: defaultConfigPath,
      tsconfigPath,
    })
    const snapshot = JSON.parse(disabled.stdout) as {
      initialForm: string | null
      secondNew: number
      updateForm: string | null
    }

    expect(disabled.stderr).toBe('')
    expect(snapshot).toEqual({
      initialForm: null, initialLines: null, secondNew: 0, updateForm: null, updateLines: null,
    })
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
