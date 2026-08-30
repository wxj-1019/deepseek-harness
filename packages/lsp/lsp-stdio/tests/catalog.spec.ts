import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmod, mkdtemp, mkdir, rm, writeFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Lsp from '@deepseek-ai/dsh-lsp'
import * as LspLocal from '@deepseek-ai/dsh-lsp-stdio'
import type { Config } from '@deepseek-ai/dsh-lsp-stdio'

let root: string

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'lsp-catalog-')))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('mergeServersWithCatalog', () => {
  it('mounts seeds when catalog is omitted — the default is on', () => {
    const merged = LspLocal.mergeServersWithCatalog({}, undefined)
    expect([...merged.keys()]).toEqual(['typescript', 'python'])
  })

  it('mounts no seeds when catalog is off', () => {
    const merged = LspLocal.mergeServersWithCatalog({}, false)
    expect(merged.size).toBe(0)
  })

  it('an explicit entry shadows the same-id seed and other seeds still mount', () => {
    const merged = LspLocal.mergeServersWithCatalog({
      typescript: { command: 'my-ts-server', extensionToLanguage: { '.ts': 'typescript' } },
    }, undefined)
    expect(merged.get('typescript')?.command).toBe('my-ts-server')
    expect([...merged.keys()].sort()).toEqual(['python', 'typescript'])
  })
})

describe('catalogSectionText', () => {
  it('renders nothing without providers', () => {
    expect(LspLocal.catalogSectionText([])).toBe('')
  })

  it('lists sorted extensions and unique sorted languages per server', () => {
    const text = LspLocal.catalogSectionText([
      { id: 'typescript', extensionToLanguage: { '.tsx': 'typescript', '.js': 'javascript', '.ts': 'typescript' } },
    ])
    expect(text).toContain('typescript: .js .ts .tsx (javascript, typescript)')
    expect(text).toContain('A query on an extension not listed here fails')
  })

  it('caps the listed servers and extensions', () => {
    const many = Array.from({ length: 15 }, (_, index) => ({
      id: `server-${index}`,
      extensionToLanguage: Object.fromEntries(
        Array.from({ length: 30 }, (_, ext) => [`.e${String(ext).padStart(2, '0')}`, 'lang']),
      ),
    }))
    const text = LspLocal.catalogSectionText(many)
    expect(text).toContain('server-11')
    expect(text).not.toContain('server-12:')
    expect(text).toContain('(+6 more)')
    expect(text).toContain('and 3 more servers')
  })
})

describe('lsp-stdio catalog apply', () => {
  /** Mount the full plugin stack and return the assembled prompt section text. */
  async function mountedSection(config: Config) {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Lsp)
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(LocalFileSystem, { cwd: root })
    await ctx.plugin(LspLocal, config)
    const sections = (await ctx.systemPrompt.assemble()).sections
    await ctx.fiber.dispose()
    return sections.filter(section => section.name === 'lsp:language-catalog').map(section => section.text)
  }

  it('registers the availability section for an explicitly configured server', async () => {
    const texts = await mountedSection({
      servers: {
        node: { command: process.execPath, extensionToLanguage: { '.ts': 'typescript' } },
      },
      catalog: false,
    })
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('node: .ts (typescript)')
  })

  it('registers no availability section when no seed binary resolves', async () => {
    // A PATH with no executables: both catalog seeds skip, the plugin still
    // loads, and the availability section stays absent.
    const bin = join(root, 'empty-bin')
    await mkdir(bin)
    const savedPath = process.env.PATH
    process.env.PATH = bin
    try {
      const texts = await mountedSection({ servers: {} })
      expect(texts).toEqual([])
    } finally {
      if (savedPath === undefined) delete process.env.PATH
      else process.env.PATH = savedPath
    }
  })

  it('leaves no availability section when provider registration rolls back', async () => {
    // Two servers claiming the same extension: the second registerProvider
    // fails and the effect rolls back — the section must not outlive it.
    const texts = await mountedSection({
      servers: {
        one: { command: process.execPath, extensionToLanguage: { '.ts': 'typescript' } },
        two: { command: process.execPath, extensionToLanguage: { '.ts': 'typescript' } },
      },
      catalog: false,
    }).catch(() => [])
    expect(texts).toEqual([])
  })

  it('mounts a seed whose binary exists on PATH and skips the absent one without throwing', async () => {
    // A fake seed executable on a private PATH: the catalog seed for
    // typescript-language-server resolves, the pyright seed does not, and the
    // plugin must still load (skip, not fail) with the section present.
    const bin = join(root, 'bin')
    await mkdir(bin)
    const exe = join(bin, process.platform === 'win32' ? 'typescript-language-server.cmd' : 'typescript-language-server')
    await writeFile(exe, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n')
    if (process.platform !== 'win32') await chmod(exe, 0o755)
    const savedPath = process.env.PATH
    process.env.PATH = bin
    try {
      const texts = await mountedSection({ servers: {} })
      expect(texts).toHaveLength(1)
      expect(texts[0]).toContain('typescript: .cjs .js .jsx .mjs .ts .tsx')
    } finally {
      if (savedPath === undefined) delete process.env.PATH
      else process.env.PATH = savedPath
    }
  })
})
