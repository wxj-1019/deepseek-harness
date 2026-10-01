import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import {
  apply,
  Config,
  DEV_CHECKS_SETTINGS_DEFAULTS,
} from '@deepseek-ai/dsh-client-ui-settings-dev-checks'

describe('ui-settings-dev-checks host', () => {
  it('resolves an empty config into the shipped defaults and rejects invalid values', () => {
    const resolved = Config({})
    const plain = Object.fromEntries(
      Object.entries(resolved).map(([key, ref]) => [key, (ref as { get(): unknown }).get()]),
    )
    expect(plain).toEqual(DEV_CHECKS_SETTINGS_DEFAULTS)
    expect(() => Config({ e2e: 'no' } as never)).toThrow()
  })

  it('declares its generated-page policy through the settings service when composed', async () => {
    const ctx = new Context()
    const release = vi.fn()
    const configure = vi.fn<(policy: { auto: boolean }) => () => void>(() => release)
    ctx.provide('settings', { configure } as never)
    const fiber = ctx.plugin({ Config, apply })
    await fiber.await()
    expect(configure).toHaveBeenCalledOnce()
    expect(configure.mock.calls[0]?.[0]).toEqual({ auto: false })
    await fiber.dispose()
    expect(release).toHaveBeenCalledOnce()
  })
})
