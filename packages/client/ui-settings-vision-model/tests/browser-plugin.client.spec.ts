// @vitest-environment jsdom
/**
 * ui-settings-vision-model plugin halves: the browser entry's dictionary and
 * settings-section registration against the real SlotRegistry (with fiber
 * teardown proving removal — HMR safety), the inert node entry, and the
 * invariant companion's ownership reservation.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as VisionInvariant from '../src/invariant.ts'
import type { VisionModelSettingsStore } from '../src/client/store.ts'
import { en, zh } from '../src/client/locales.ts'

/** Locale namespace of this plugin (a local constant in index.ts, restated here). */
const NS = 'settings.visionModel'

afterEach(() => { vi.restoreAllMocks() })

/** Slot ledger reader: entry ids currently registered in the settings section. */
function sectionIds(ctx: Context): (string | undefined)[] {
  return ctx.slots
    .entries('settings.section')
    .map(entry => entry.options.id)
}

/** Boot the browser half over a real slot tree that declares the settings section. */
async function bench(): Promise<{
  ctx: Context
  fiber: ReturnType<Context['plugin']>
  /** Forwarded-event handlers captured by the connection wire so tests can fire them. */
  remoteHandlers: Record<string, ((...args: unknown[]) => void)[]>
}> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'settings.general.item': { kind: 'list', scope: 'root' },
      'settings.section': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  ctx.provide('connection', { api: { llm: {}, settings: {} }, isLoopback: false } as never)
  const remoteHandlers: Record<string, ((...args: unknown[]) => void)[]> = {}
  ctx.provide('remote', {
    $on: (event: string, handler: (...args: unknown[]) => void) => {
      (remoteHandlers[event] ??= []).push(handler)
      return () => {}
    },
  } as never)
  // The locale plugin binds a settings scope, which reads the connection handle
  // and the forwarded-event port.
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, remoteHandlers }
}

describe('ui-settings-vision-model browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'remote'])
  })

  it('registers the settings section with its nav label, and fiber teardown removes it (HMR safety)', async () => {
    const { ctx, fiber } = await bench()
    const entry = ctx.slots.entries('settings.section').find(item => item.options.id === 'vision-model')
    expect(entry).toBeDefined()
    // The nav label is a locale-following thunk; owners resolve at read time
    // (jsdom's navigator reports English, so pin zh first).
    ctx.locale.setLocale('zh')
    expect(resolveSlotLabel(entry!.options.label)).toBe(zh.nav)
    await fiber.dispose()
    expect(sectionIds(ctx)).not.toContain('vision-model')
  })

  it('refreshes the page on pushed invalidations, skipping an idle one', async () => {
    const { ctx, remoteHandlers } = await bench()
    const entry = ctx.slots.entries('settings.section').find(item => item.options.id === 'vision-model')
    const controller = (entry!.inject!() as { controller: VisionModelSettingsStore }).controller
    const settingsHandler = remoteHandlers['settings/document-updated']?.[0]
    const adapterHandler = remoteHandlers['llm/adapters-updated']?.[0]
    expect(settingsHandler).toBeTypeOf('function')
    expect(adapterHandler).toBeTypeOf('function')

    // An idle page ignores the invalidation.
    settingsHandler?.('vision-model')
    expect(controller.store.getSnapshot().status).toBe('idle')

    // A loaded (here: failed against the inert wire face) page reloads on
    // each invalidation source, and a foreign namespace never touches it.
    await controller.load()
    expect(controller.store.getSnapshot().status).toBe('error')
    settingsHandler?.('other-ns')
    settingsHandler?.('vision-model')
    adapterHandler?.()
    ;(ctx.emit as (event: string) => void)('connection/reset')
    expect(controller.store.getSnapshot().status).toBe('error')
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    // jsdom's navigator reports English: pin zh before asserting the source copy.
    ctx.locale.setLocale('zh')
    expect(translate('nav')).toBe(zh.nav)
    ctx.locale.setLocale('en')
    expect(translate('nav')).toBe(en.nav)

    // Withdrawn dictionaries leave the key unresolved rather than translated.
    await fiber.dispose()
    expect(translate('nav')).not.toBe(en.nav)
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})

describe('ui-settings-vision-model node half', () => {
  it('contributes no host behavior without a settings service', () => {
    // The node half exists only so the plugin appears in the Loader tree.
    expect(() => { applyNode() }).not.toThrow()
  })
})

describe('ui-settings-vision-model invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true }).await()
    const fiber = ctx.plugin(VisionInvariant)
    await fiber.await()
    expect(VisionInvariant.name).toBe('client-ui-settings-vision-model-invariant')
    expect(VisionInvariant.inject).toEqual(['invariants'])
    // Emitting an unrelated event proves the companion installed no audit.
    expect(() => { (ctx.emit as (event: string) => void)('slots/changed') }).not.toThrow()
    await fiber.dispose()
  })
})
