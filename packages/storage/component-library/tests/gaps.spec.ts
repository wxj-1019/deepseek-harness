import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { extractComponents } from '../src/extract.ts'
import { parseDesignTokens } from '../src/tokens.ts'
import { scanComponentLibrary } from '../src/scanner.ts'
import { setupLibrary } from './helpers.ts'

describe('extractComponents edge cases', () => {
  it('joins a JSDoc comment built from inline-tag parts', () => {
    const source = `
/** See {@link Gauge} for the gauge. */
export function Linker(props: { label: string }) { return null }
`
    const [component] = extractComponents('Linker.tsx', source)
    expect(component?.jsdoc).toContain('See')
    expect(component?.jsdoc).toContain('Gauge')
  })

  it('treats a props literal with a method signature as too dynamic', () => {
    const source = 'export function Saver(props: { onSave(): void }) { return null }'
    const [component] = extractComponents('Saver.tsx', source)
    expect(component?.propsInferred).toBe(false)
    expect(component?.rawProps).toBe('{ onSave(): void }')
  })

  it('reads a parenthesized props type alias chain', () => {
    const source = `
type Inner = { label: string }
type Outer = (Inner)
export function Chain(props: Outer) { return null }
`
    const [component] = extractComponents('Chain.tsx', source)
    expect(component?.propsInferred).toBe(true)
    expect(component?.props).toEqual([{ name: 'label', type: 'string', required: true }])
  })
})

describe('parseDesignTokens edge cases', () => {
  it('keeps the first declaration of a duplicated token name', () => {
    const css = `
body { --dsw-static-blue-500: rgb(0, 0, 1); }
.overlay { --dsw-static-blue-500: rgb(0, 0, 2); }
`
    const tokens = parseDesignTokens(css)
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.value).toBe('rgb(0, 0, 1)')
  })
})

describe('scanComponentLibrary edge cases', () => {
  it('logs and falls back for a package without a manifest, an invalid manifest, and a file-shaped client dir', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-component-library-edge-'))
    try {
      const client = join(root, 'packages', 'client')
      // A package whose src/client is a plain file: the walk skips it loudly.
      await mkdir(join(client, 'ui-file', 'src'), { recursive: true })
      await writeFile(join(client, 'ui-file', 'src', 'client'), 'not a directory')
      // A package with an unreadable manifest shape (directory in its place).
      await mkdir(join(client, 'ui-nomanifest', 'src', 'client'), { recursive: true })
      await writeFile(join(client, 'ui-nomanifest', 'src', 'client', 'Bare.tsx'), 'export function Bare() { return null }\n')
      // A package whose manifest is not JSON.
      await mkdir(join(client, 'ui-badmanifest', 'src', 'client'), { recursive: true })
      await writeFile(join(client, 'ui-badmanifest', 'package.json'), '{not json')
      await writeFile(join(client, 'ui-badmanifest', 'src', 'client', 'Odd.tsx'), 'export function Odd() { return null }\n')

      const lines: string[] = []
      const records = await scanComponentLibrary(root, line => lines.push(line))
      const ids = records.map(record => record.id)
      expect(ids).toContain('ui-nomanifest/Bare')
      expect(ids).toContain('ui-badmanifest/Odd')
      expect(ids).not.toContain('ui-file/client')
      expect(lines.filter(line => line.includes('ui-nomanifest')).length).toBeGreaterThan(0)
      expect(lines.filter(line => line.includes('ui-badmanifest')).length).toBeGreaterThan(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('skill body edge cases', () => {
  it('generates the empty-library body when the checkout has no components', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-component-library-empty-'))
    try {
      await mkdir(join(root, 'packages', 'client'), { recursive: true })
      const harness = await setupLibrary({ root, watch: false })
      try {
        const definition = await harness.ctx.skills.get('component-library', {})
        expect(definition?.content).toContain('no components yet')
        expect(definition?.content).toContain('inventory is unavailable')
      } finally {
        await harness.dispose()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('ComponentLibraryService review and contribution edges', () => {
  it('approving an already-reviewed record is a no-op ack', async () => {
    const harness = await setupLibrary()
    try {
      // Scanned records are born reviewed; approving one changes nothing.
      const result = await harness.ctx.componentLibrary.review({ id: 'ui-demo/Gauge', decision: 'approve' })
      expect(result).toEqual({ ok: true, value: { done: true } })
    } finally {
      await harness.dispose()
    }
  })

  it('a model can update its own previous record without losing the review flag', async () => {
    const harness = await setupLibrary()
    try {
      const service = harness.ctx.componentLibrary
      const request = {
        name: 'Evolving',
        pkg: '@deepseek-ai/dsh-client-ui-demo',
        path: 'packages/client/ui-demo/src/client/Evolving.tsx',
      }
      await service.contribute(request)
      await service.review({ id: 'ui-demo/Evolving', decision: 'approve' })
      const updated = await service.contribute({ ...request, jsdoc: 'Second pass.' })
      expect(updated.ok).toBe(true)
      const record = service.snapshotAll().find(entry => entry.id === 'ui-demo/Evolving')
      expect(record?.jsdoc).toBe('Second pass.')
      expect(record?.reviewed).toBe(true)
    } finally {
      await harness.dispose()
    }
  })

  it('honors the query limit', async () => {
    const harness = await setupLibrary()
    try {
      const matches = harness.ctx.componentLibrary.rankMatches({ query: 'ui', limit: 1 })
      expect(matches).toHaveLength(1)
    } finally {
      await harness.dispose()
    }
  })
})

describe('resolveComponentLibrarySpec walk failure', () => {
  it('throws when no ancestor contains the client tree', async () => {
    const { resolveComponentLibrarySpec } = await import('../src/index.ts')
    // A path far outside any checkout, given explicitly, must fail loud.
    expect(() => resolveComponentLibrarySpec({ root: join(tmpdir(), 'definitely-not-a-checkout') }))
      .toThrow(/does not contain packages\/client/)
  })
})

describe('fixture sanity', () => {
  it('keeps the fixture checkout stable for the service suite', async () => {
    const lines: string[] = []
    const root = fileURLToPath(new URL('../fixtures/checkout', import.meta.url))
    const records = await scanComponentLibrary(root, line => lines.push(line))
    expect(records.map(record => record.id).sort()).toEqual([
      'ui-demo/Gauge',
      'ui-demo/GaugeBadge',
      'ui-demo/Panel',
      'ui-lone/Plain',
    ])
  })
})
