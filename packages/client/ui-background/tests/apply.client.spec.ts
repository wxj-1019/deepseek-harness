/** ui-background apply wiring: service provision, settings dictionaries riding
 * the locale service, section registration into settings.section, snapshot
 * projection into the section store, and HMR collapse recovery. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { SettingsScopeBinder } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, BackgroundRuntime, inject, SETTINGS_NS } from '../src/client/index.ts'
import { BackgroundSection, type BackgroundSectionInjected } from '../src/client/BackgroundSection.tsx'
import { BackgroundSettingsSchema, BACKGROUND_SETTINGS_NAMESPACE, type BackgroundImageRef, type BackgroundSettings } from '../src/background-settings.ts'
import type { createBackgroundSectionStore } from '../src/client/settings-store.ts'

// The service reads its initial locale from the browser; these specs assert
// the shipped Chinese copy, so they state the browser they assume.
usePinnedBrowserLanguages('zh-CN')

const SLOT = 'settings.section'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const namespace = () => ({
    ns: BACKGROUND_SETTINGS_NAMESPACE,
    schema: BackgroundSettingsSchema.toJSON(),
    value: { preference: 'none', dimming: 45 } satisfies BackgroundSettings,
    applies: 'live' as const,
    secrets: [],
    revision: 0,
  })
  const describe = vi.fn(() => Promise.resolve({
    rpcId: 'background-describe' as never,
    result: { ok: true as const, value: { writable: true, hasDocument: true, namespaces: [namespace()] } },
  }))
  const mutate = vi.fn(() => Promise.resolve({
    rpcId: 'background-mutate' as never,
    result: { ok: true as const, value: namespace() },
  }))
  ctx.provide('connection', { api: { settings: { describe, mutate } }, isLoopback: true } as never)
  // The settings transport and the forwarded-event port the plugin injects.
  new TestRemote(ctx)
  await ctx.plugin(SettingsScopeBinder).await()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, describe, mutate }
}

/** Stand in for the settings shell: declare the section list slot from root. */
function declareSections(slots: SlotRegistry): () => void {
  return slots.register(
    { name: 'root', children: { [SLOT]: { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
}

describe('ui-background apply', () => {
  it('declares the slot and locale services', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'remote', 'settingsScope'])
  })

  it('provides the service, registers localized copy, and registers the section', async () => {
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.ctx.get('background')).toBeInstanceOf(BackgroundRuntime)
    expect(b.locale.bind(SETTINGS_NS)('nav')).toBe('背景')
    const entry = b.slots.entries(SLOT).find(e => e.component === BackgroundSection)!
    // The label thunk re-reads the active locale on every evaluation.
    expect((entry.options.label as () => string)()).toBe('背景')
    b.locale.setLocale('en')
    expect((entry.options.label as () => string)()).toBe('Background')
    expect(b.locale.bind(SETTINGS_NS)('nav')).toBe('Background')
    expect(entry.options).toMatchObject({ id: 'background', order: 5 })
    expect(entry.locale).toBe(SETTINGS_NS)
  })

  it('routes face writes back through the service', async () => {
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const background = b.ctx.get('background') as BackgroundRuntime
    const entry = b.slots.entries(SLOT).find(e => e.component === BackgroundSection)!
    const handle = entry.store as ReturnType<typeof createBackgroundSectionStore>
    const instance = handle.create()
    const face = (entry.inject as unknown as (a: typeof instance.actions) => BackgroundSectionInjected)(instance.actions)
    // The node lane has no Host route: a scripted fetch stands in for the Host
    // so the resolved upload chain (POST /backgrounds, then setImage) runs here.
    const REF: BackgroundImageRef = { attachmentId: `sha256:${'a'.repeat(64)}`, mediaType: 'image/png', bytes: 3, width: 2, height: 2 }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(REF), { status: 201, headers: { 'content-type': 'application/json' } })))
    await face.uploadImage(new File([new Uint8Array([1])], 'bg.png', { type: 'image/png' }))
    expect(background.getBackground().section.preference).toBe('image')
    face.setNone()
    expect(background.getBackground().section.preference).toBe('none')
    // The same scripted Host answers the probe's HEAD with a 2xx.
    expect(await face.probeImage()).toBe(true)
    face.setPreset('aurora')
    expect(background.getBackground().section.preference).toBe('preset')
    // Writes cross the settings transport queue, so the mutate call settles
    // asynchronously; the store mirror is optimistic and synchronous.
    await vi.waitFor(() => { expect(b.mutate).toHaveBeenCalled() })
    face.setDimming(70)
    expect(instance.getSnapshot().section.dimming).toBe(70)
    vi.unstubAllGlobals()
  })

  it('recovers after an HMR collapse of the declaring entry', async () => {
    const b = await bench()
    const host = declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries(SLOT)).toHaveLength(1)
    host()
    expect(b.slots.entries(SLOT)).toHaveLength(0)
    declareSections(b.slots)
    await Promise.resolve()
    expect(b.slots.entries(SLOT).some(e => e.component === BackgroundSection)).toBe(true)
  })

  it('teardown removes the section and the dictionaries', async () => {
    const b = await bench()
    declareSections(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(SLOT)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(SLOT)).toHaveLength(0)
    // Dictionary disposal: translation falls back to the bare key.
    expect(b.locale.bind(SETTINGS_NS)('nav')).toBe('nav')
  })
})
