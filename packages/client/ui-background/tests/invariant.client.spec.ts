/** The invariant companion registers package ownership and disposes cleanly. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'

const REGISTRATIONS = new Map<string, unknown>()

describe('ui-background invariant companion', () => {
  it('registers and disposes package ownership', async () => {
    const ctx = new Context()
    ctx.provide('invariants', {
      register: (name: string, install: unknown) => {
        REGISTRATIONS.set(name, install)
        return () => { REGISTRATIONS.delete(name) }
      },
    } as never)
    const { apply, inject, name } = await import('../src/invariant.ts')
    expect(inject).toEqual(['invariants'])
    expect(name).toBe('client-ui-background-invariant')
    const dispose = await apply(ctx)
    expect(REGISTRATIONS.has('@deepseek-ai/dsh-client-ui-background')).toBe(true)
    dispose()
    expect(REGISTRATIONS.has('@deepseek-ai/dsh-client-ui-background')).toBe(false)
  })
})
