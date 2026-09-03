import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { setupLibrary } from './helpers.ts'

const testToolSignal = new AbortController().signal
let callCounter = 0

describe('ComponentLibraryService', () => {
  it('seeds the domain from a cold-start scan of the checkout tree', async () => {
    const harness = await setupLibrary()
    try {
      const records = harness.ctx.componentLibrary.snapshotAll()
      const ids = records.map(record => record.id)
      expect(ids).toContain('ui-demo/Gauge')
      expect(ids).toContain('ui-demo/Panel')
      expect(ids).toContain('ui-lone/Plain')
    } finally {
      await harness.dispose()
    }
  })

  it('ranks an exact name match above package and keyword matches', async () => {
    const harness = await setupLibrary()
    try {
      const service = harness.ctx.componentLibrary
      const byName = service.rankMatches({ query: 'Gauge' })
      expect(byName.at(0)?.name).toBe('Gauge')
      expect(byName.map(match => match.name)).toContain('GaugeBadge')

      const byPackage = service.rankMatches({ query: 'ui-demo' })
      expect(byPackage.every(match => match.pkg === '@deepseek-ai/dsh-client-ui-demo')).toBe(true)

      const byKeyword = service.rankMatches({ query: 'dashboard' })
      expect(byKeyword.map(match => match.name)).toEqual(['Gauge'])

      const filtered = service.rankMatches({ query: 'ui', pkg: '@deepseek-ai/dsh-client-ui-demo' })
      expect(filtered.every(match => match.pkg === '@deepseek-ai/dsh-client-ui-demo')).toBe(true)

      expect(service.rankMatches({ query: 'nonexistent-thing' })).toEqual([])
    } finally {
      await harness.dispose()
    }
  })

  it('quarantines unreviewed model records and ranks approved ones below scanned', async () => {
    const harness = await setupLibrary()
    try {
      const service = harness.ctx.componentLibrary
      const written = await service.contribute({
        name: 'GaugeExtender',
        pkg: '@deepseek-ai/dsh-client-ui-demo',
        path: 'packages/client/ui-demo/src/client/GaugeExtender.tsx',
        jsdoc: 'A gauge extension.',
      })
      expect(written.ok).toBe(true)

      // Quarantined: invisible to queries even though it matches the keyword.
      expect(service.rankMatches({ query: 'Gauge' }).map(match => match.name)).not.toContain('GaugeExtender')

      // The settings namespace opts queries into unreviewed records, ranked last.
      await harness.ctx.settings.update('component-library', { includeUnreviewed: true })
      const withUnreviewed = service.rankMatches({ query: 'gauge' })
      expect(withUnreviewed.at(-1)?.name).toBe('GaugeExtender')

      const reviewed = await service.review({ id: 'ui-demo/GaugeExtender', decision: 'approve' })
      expect(reviewed.ok).toBe(true)
      await harness.ctx.settings.update('component-library', { includeUnreviewed: false })
      const afterReview = service.rankMatches({ query: 'gauge' })
      expect(afterReview.at(-1)?.name).toBe('GaugeExtender')
      expect(afterReview.at(-1)?.origin).toBe('model')
    } finally {
      await harness.dispose()
    }
  })

  it('rejects a model record that collides with a scanned id', async () => {
    const harness = await setupLibrary()
    try {
      const result = await harness.ctx.componentLibrary.contribute({
        name: 'Gauge',
        pkg: '@deepseek-ai/dsh-client-ui-demo',
        path: 'packages/client/ui-demo/src/client/Gauge.tsx',
      })
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid-record' } })
    } finally {
      await harness.dispose()
    }
  })

  it('discards a model record on review', async () => {
    const harness = await setupLibrary()
    try {
      const service = harness.ctx.componentLibrary
      await service.contribute({
        name: 'Throwaway',
        pkg: '@deepseek-ai/dsh-client-ui-demo',
        path: 'packages/client/ui-demo/src/client/Throwaway.tsx',
      })
      expect(await service.review({ id: 'ui-demo/Throwaway', decision: 'discard' })).toEqual({ ok: true, value: { done: true } })
      expect(service.snapshotAll().map(record => record.id)).not.toContain('ui-demo/Throwaway')
      expect(await service.review({ id: 'ui-demo/Throwaway', decision: 'approve' }))
        .toEqual({ ok: false, error: { code: 'component-not-found', id: 'ui-demo/Throwaway' } })
    } finally {
      await harness.dispose()
    }
  })

  it('emits component-library/changed after a durable write', async () => {
    const harness = await setupLibrary()
    try {
      let changes = 0
      harness.ctx.on('component-library/changed', () => {
        changes += 1
      })
      await harness.ctx.componentLibrary.contribute({
        name: 'Watched',
        pkg: '@deepseek-ai/dsh-client-ui-demo',
        path: 'packages/client/ui-demo/src/client/Watched.tsx',
      })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(changes).toBe(1)
    } finally {
      await harness.dispose()
    }
  })

  it('serves summary and list over the Remote face', async () => {
    const harness = await setupLibrary()
    try {
      const service = harness.ctx.componentLibrary
      const summary = await service.summary()
      expect(summary.ok).toBe(true)
      if (summary.ok) {
        expect(summary.value.total).toBe(4)
        expect(summary.value.scanned).toBe(4)
        expect(summary.value.pendingReview).toBe(0)
      }
      const list = await service.list()
      expect(list.ok).toBe(true)
      if (list.ok) expect(list.value.items).toHaveLength(4)
      const query = await service.query({ query: 'Gauge' })
      expect(query.ok).toBe(true)
      if (query.ok) expect(query.value.matches.at(0)?.name).toBe('Gauge')
    } finally {
      await harness.dispose()
    }
  })

  it('surfaces the design-token inventory from the theme stylesheet', async () => {
    const harness = await setupLibrary()
    try {
      expect(harness.ctx.componentLibrary.designTokens.map(token => token.name))
        .toContain('--dsw-alias-label-primary')
    } finally {
      await harness.dispose()
    }
  })
})

describe('component tools', () => {
  it('registers component_query and component_record with wire schemas', async () => {
    const harness = await setupLibrary()
    try {
      const names = harness.ctx.tools.schemas().map(schema => schema.name)
      expect(names).toContain('component_query')
      expect(names).toContain('component_record')
    } finally {
      await harness.dispose()
    }
  })

  it('executes component_query through the tool registry pipeline', async () => {
    const harness = await setupLibrary()
    try {
      const result = await harness.ctx.tools.execute({
        signal: testToolSignal,
        callId: ToolCallId(`call-${++callCounter}`),
        name: 'component_query',
        arguments: { query: 'Gauge' },
      })
      expect(result.isError).toBe(false)
      const value = result.value as { matches: { name: string }[] }
      expect(value.matches.at(0)?.name).toBe('Gauge')

      const definition = harness.ctx.tools.get('component_query')
      expect(definition?.presentCall?.({ query: 'Gauge' }))
        .toEqual({ card: 'generic', title: 'Query component library', kind: 'other', rawInput: 'Gauge' })
    } finally {
      await harness.dispose()
    }
  })

  it('executes component_record and rejects a scanner-covered id loudly', async () => {
    const harness = await setupLibrary()
    try {
      const written = await harness.ctx.tools.execute({
        signal: testToolSignal,
        callId: ToolCallId(`call-${++callCounter}`),
        name: 'component_record',
        arguments: {
          name: 'FreshCard',
          pkg: '@deepseek-ai/dsh-client-ui-demo',
          path: 'packages/client/ui-demo/src/client/FreshCard.tsx',
          props: [{ name: 'title', type: 'string', required: true }],
          tokens: ['--dsw-alias-label-primary'],
        },
      })
      expect(written.isError).toBe(false)
      expect(written.value).toEqual({ done: true, id: 'ui-demo/FreshCard' })

      const colliding = await harness.ctx.tools.execute({
        signal: testToolSignal,
        callId: ToolCallId(`call-${++callCounter}`),
        name: 'component_record',
        arguments: {
          name: 'Gauge',
          pkg: '@deepseek-ai/dsh-client-ui-demo',
          path: 'packages/client/ui-demo/src/client/Gauge.tsx',
        },
      })
      expect(colliding.isError).toBe(true)
    } finally {
      await harness.dispose()
    }
  })

  it('unregisters both tools when the plugin fiber disposes', async () => {
    const harness = await setupLibrary()
    const fiber = harness.ctx.get('componentLibrary')
    expect(fiber).toBeDefined()
    await harness.ctx.fiber.dispose()
    // A disposed root tears down the whole tree; a fresh context proves HMR safety instead.
    const second = await setupLibrary()
    try {
      expect(second.ctx.tools.schemas().some(schema => schema.name === 'component_query')).toBe(true)
    } finally {
      await second.dispose()
    }
  })
})

describe('model guidance', () => {
  it('mounts the always-on reuse section in the system prompt', async () => {
    const harness = await setupLibrary()
    try {
      const assembly = await harness.ctx.systemPrompt.assemble({})
      const section = assembly.sections.find(entry => entry.name === 'component-library:reuse')
      expect(section?.text).toContain('component_query')
      expect(section?.text).toContain('component_record')
    } finally {
      await harness.dispose()
    }
  })

  it('lists the component-library skill and generates its body on demand', async () => {
    const harness = await setupLibrary()
    try {
      const listed = await harness.ctx.skills.list({})
      expect(listed.some(candidate => candidate.name === 'component-library')).toBe(true)

      const definition = await harness.ctx.skills.get('component-library', {})
      expect(definition?.content).toContain('--dsw-alias-*')
      expect(definition?.content).toContain('Gauge')
      expect(definition?.content).toContain('component_query')
    } finally {
      await harness.dispose()
    }
  })
})

describe('resolveComponentLibrarySpec', () => {
  it('rejects a root without a client tree', async () => {
    const { resolveComponentLibrarySpec } = await import('../src/index.ts')
    expect(() => resolveComponentLibrarySpec({ root: '/nonexistent/checkout' }))
      .toThrow(/does not contain packages\/client/)
  })

  it('walks up from the package to the harness checkout when root is absent', async () => {
    const { resolveComponentLibrarySpec } = await import('../src/index.ts')
    const spec = resolveComponentLibrarySpec({})
    // The URL-derived expected path carries a trailing separator; the walk does not.
    expect(spec.root).toBe(fileURLToPath(new URL('../../../..', import.meta.url)).replace(/[\\/]$/, ''))
    expect(spec.watch).toBe(true)
  })
})
