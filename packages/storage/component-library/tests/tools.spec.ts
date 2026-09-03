import { describe, expect, it } from 'vitest'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { setupLibrary } from './helpers.ts'

const testToolSignal = new AbortController().signal
let callCounter = 0

/** Render one ContentBlock list down to its joined text. */
function textOf(blocks: readonly { type: string; text?: string }[]): string {
  return blocks.map(block => block.type === 'text' ? block.text ?? '' : '').join('\n')
}

describe('component_query presentation', () => {
  it('renders the ranked list text and replay-safe meta', async () => {
    const harness = await setupLibrary()
    try {
      const definition = harness.ctx.tools.get('component_query')
      expect(definition).toBeDefined()
      if (definition === undefined) return

      const result = await harness.ctx.tools.execute({
        signal: testToolSignal,
        callId: ToolCallId(`presenter-${++callCounter}`),
        name: 'component_query',
        arguments: { query: 'Gauge' },
      })
      expect(result.isError).toBe(false)
      // The canonical value crosses the boundary as JsonValue; presenters take it as-is.
      const value = result.value
      if (value === undefined) throw new Error('component_query returned no canonical value')

      // output.render: the model-facing text names the match, its props and tokens.
      const rendered = definition.output.render({ query: 'Gauge' }, value)
      expect(textOf(rendered)).toContain('Gauge')
      expect(textOf(rendered)).toContain('label: string')
      expect(textOf(rendered)).toContain('--dsw-alias-label-primary')

      // presentationMeta + presentResult: the transcript card data round-trips.
      const meta = definition.output.presentationMeta?.({ query: 'Gauge' }, value)
      expect(meta).toMatchObject({ matchCount: 2 })
      const toolResult = { isError: false, meta, value }
      const view = definition.presentResult?.({ query: 'Gauge' }, toolResult as never)
      expect(view).toMatchObject({ card: 'generic', title: 'Component library: 2 match(es)' })

      // presentResult falls back to undefined for errors and malformed meta.
      expect(definition.presentResult?.({ query: 'x' }, { isError: true } as never)).toBeUndefined()
      expect(definition.presentResult?.({ query: 'x' }, { isError: false, meta: {}, value: { matches: [] } } as never)).toBeUndefined()
      expect(definition.presentResult?.({ query: 'x' }, { isError: false, meta: { matchCount: 'two' }, value: { matches: [] } } as never)).toBeUndefined()
    } finally {
      await harness.dispose()
    }
  })

  it('renders the empty-library guidance', async () => {
    const harness = await setupLibrary()
    try {
      const definition = harness.ctx.tools.get('component_query')
      expect(definition).toBeDefined()
      if (definition === undefined) return
      const rendered = definition.output.render({ query: 'ghost' }, { matches: [] })
      expect(textOf(rendered)).toContain('No library components match')
    } finally {
      await harness.dispose()
    }
  })
})

describe('component_record presentation and validation', () => {
  it('renders the quarantine confirmation and the id meta', async () => {
    const harness = await setupLibrary()
    try {
      const definition = harness.ctx.tools.get('component_record')
      expect(definition).toBeDefined()
      if (definition === undefined) return
      const args = { name: 'FreshCard', pkg: 'p', path: 'x' }
      const value = { done: true, id: 'ui-demo/FreshCard' }
      const rendered = definition.output.render(args, value)
      expect(textOf(rendered)).toContain('ui-demo/FreshCard')
      expect(definition.output.presentationMeta?.(args, value)).toEqual({ id: 'ui-demo/FreshCard' })
      expect(definition.presentCall?.(args))
        .toEqual({ card: 'generic', title: 'Record component', kind: 'other', rawInput: 'FreshCard' })
    } finally {
      await harness.dispose()
    }
  })

  it('records with every optional field and normalizes missing required flags', async () => {
    const harness = await setupLibrary()
    try {
      const result = await harness.ctx.tools.execute({
        signal: testToolSignal,
        callId: ToolCallId(`presenter-${++callCounter}`),
        name: 'component_record',
        arguments: {
          name: 'FullCard',
          pkg: '@deepseek-ai/dsh-client-ui-demo',
          path: 'packages/client/ui-demo/src/client/FullCard.tsx',
          props: [{ name: 'title', type: 'string' }, { name: 'count', type: 'number', required: true }],
          tokens: ['--dsw-alias-label-primary'],
          jsdoc: 'A fully specified card.',
          example: '<FullCard title="Hi" />',
        },
      })
      expect(result.isError).toBe(false)
      const record = harness.ctx.componentLibrary.snapshotAll().find(entry => entry.id === 'ui-demo/FullCard')
      expect(record?.props).toEqual([
        { name: 'title', type: 'string', required: false },
        { name: 'count', type: 'number', required: true },
      ])
      expect(record?.tokens).toEqual(['--dsw-alias-label-primary'])
      expect(record?.example).toBe('<FullCard title="Hi" />')
    } finally {
      await harness.dispose()
    }
  })

  it('surfaces the scanner-collision rejection as a tool error', async () => {
    const harness = await setupLibrary()
    try {
      const result = await harness.ctx.tools.execute({
        signal: testToolSignal,
        callId: ToolCallId(`presenter-${++callCounter}`),
        name: 'component_record',
        arguments: {
          name: 'Gauge',
          pkg: '@deepseek-ai/dsh-client-ui-demo',
          path: 'packages/client/ui-demo/src/client/Gauge.tsx',
        },
      })
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result)).toContain('already covered by the scanner')
    } finally {
      await harness.dispose()
    }
  })
})
