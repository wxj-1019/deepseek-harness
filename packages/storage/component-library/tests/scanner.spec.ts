import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { extractFile, scanComponentLibrary, scanDesignTokens } from '../src/scanner.ts'

const FIXTURE_ROOT = fileURLToPath(new URL('../fixtures/checkout', import.meta.url))

/** Collect log lines for assertions without touching the console. */
function logSink(): { lines: string[]; log: (line: string) => void } {
  const lines: string[] = []
  return { lines, log: line => lines.push(line) }
}

describe('scanComponentLibrary', () => {
  it('learns every component under packages/client with tokens, examples, and package names', async () => {
    const { lines, log } = logSink()
    const records = await scanComponentLibrary(FIXTURE_ROOT, log)
    const byId = new Map(records.map(record => [record.id, record]))

    const gauge = byId.get('ui-demo/Gauge')
    expect(gauge).toMatchObject({
      pkg: '@deepseek-ai/dsh-client-ui-demo',
      name: 'Gauge',
      path: 'packages/client/ui-demo/src/client/Gauge.tsx',
      props: [
        { name: 'label', type: 'string', required: true },
        { name: 'value', type: 'number', required: true },
        { name: 'hint', type: 'string', required: false },
      ],
      tokens: ['--dsw-alias-label-primary', '--dsw-static-blue-500'],
      jsdoc: 'One dashboard gauge.',
      example: '<Gauge label="Sessions" value={3} hint="this week" />',
      origin: 'scanned',
      propsInferred: true,
      reviewed: true,
    })

    const badge = byId.get('ui-demo/GaugeBadge')
    expect(badge?.props).toEqual([{ name: 'tone', type: "'info' | 'warn'", required: true }])
    // Same-basename CSS module covers every component in the file.
    expect(badge?.tokens).toEqual(['--dsw-alias-label-primary', '--dsw-static-blue-500'])

    const panel = byId.get('ui-demo/Panel')
    expect(panel?.propsInferred).toBe(false)
    expect(panel?.rawProps).toBe('BaseProps & { title: string }')
    // No spec mounts a Panel and no CSS module exists beside it.
    expect(panel?.example).toBe('')
    expect(panel?.tokens).toEqual([])

    // A manifest without a string name falls back to the directory name, loudly.
    const plain = byId.get('ui-lone/Plain')
    expect(plain?.pkg).toBe('ui-lone')
    expect(lines.some(line => line.includes('ui-lone'))).toBe(true)
  })

  it('reports an empty scan when the client tree is missing', async () => {
    const { lines, log } = logSink()
    const records = await scanComponentLibrary(fileURLToPath(new URL('../fixtures', import.meta.url)), log)
    expect(records).toEqual([])
    expect(lines).toHaveLength(1)
  })
})

describe('extractFile', () => {
  it('extracts one file standalone, as the watcher does', async () => {
    const { log } = logSink()
    const file = fileURLToPath(new URL('../fixtures/checkout/packages/client/ui-demo/src/client/Gauge.tsx', import.meta.url))
    const records = await extractFile(FIXTURE_ROOT, file, log)
    expect(records.map(record => record.id)).toEqual(['ui-demo/Gauge', 'ui-demo/GaugeBadge'])
  })

  it('skips an unreadable file with a log line', async () => {
    const { lines, log } = logSink()
    const records = await extractFile(FIXTURE_ROOT, '/nonexistent/Nope.tsx', log)
    expect(records).toEqual([])
    expect(lines).toHaveLength(1)
  })
})

describe('scanDesignTokens', () => {
  it('parses the theme stylesheet into a tiered inventory', async () => {
    const tokens = await scanDesignTokens(FIXTURE_ROOT)
    expect(tokens).toEqual([
      { name: '--dsw-static-blue-500', value: 'rgb(59, 130, 246)', tier: 'static' },
      { name: '--dsw-static-neutral-bluish-1000', value: 'rgb(10, 12, 18)', tier: 'static' },
      { name: '--dsw-alias-label-primary', value: 'var(--dsw-static-neutral-bluish-1000)', tier: 'alias' },
      { name: '--dsw-specific-bubble-highlight', value: 'var(--dsw-static-blue-500)', tier: 'specific' },
    ])
  })

  it('returns an empty inventory when the stylesheet is absent', async () => {
    expect(await scanDesignTokens(fileURLToPath(new URL('../fixtures', import.meta.url)))).toEqual([])
  })
})
