import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import ComponentLibraryService from '../src/index.ts'
import type { Config } from '../src/index.ts'

/** Checkout fixture the scanner learns during tests. */
export const FIXTURE_ROOT = fileURLToPath(new URL('../fixtures/checkout', import.meta.url))

export interface LibraryHarness {
  readonly ctx: Context
  readonly storageRoot: string
  dispose(): Promise<void>
}

/** Compose the service over the real storage hub/domain/JSON backend and consumer seams. */
export async function setupLibrary(config: Config = { root: FIXTURE_ROOT, watch: false }): Promise<LibraryHarness> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'dsh-component-library-test-'))
  const ctx = new Context()
  try {
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root: storageRoot })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(ComponentLibraryService, config)
  } catch (error) {
    await ctx.fiber.dispose()
    await rm(storageRoot, { recursive: true, force: true })
    throw error
  }
  return {
    ctx,
    storageRoot,
    async dispose() {
      await ctx.fiber.dispose()
      await rm(storageRoot, { recursive: true, force: true })
    },
  }
}
