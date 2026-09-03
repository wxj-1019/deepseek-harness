import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as ComponentLibraryInvariant from '../src/invariant.ts'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(InvariantRegistry)
  await ctx.plugin(ComponentLibraryInvariant)
  return ctx
}

describe('component-library invariants', () => {
  it('accepts a change broadcast that trails a durable library write', async () => {
    const ctx = await setup()
    ctx.emit('domain/changed', { domain: 'component_library', table: 'components', key: 'ui-demo/Gauge', operation: 'put', value: {} })
    ctx.emit('component-library/changed')
  })

  it('ignores writes to other storage domains', async () => {
    const ctx = await setup()
    ctx.emit('domain/changed', { domain: 'notifications', table: 'entries', key: 'x', operation: 'deleted' })
  })

  it('rejects a change broadcast with no preceding library write', async () => {
    const ctx = await setup()
    expect(() => ctx.emit('component-library/changed'))
      .toThrow(/without a preceding component_library domain write/)
  })
})
