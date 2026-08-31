// @vitest-environment jsdom
/**
 * ui-desktop-notify plugin halves: the browser entry's dictionary and
 * General-row registrations against the real SlotRegistry (with fiber
 * teardown proving removal — HMR safety) and the watcher subscription, the
 * inert node entry, and the invariant companion's ownership reservation.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { DesktopNotifySettingsSchema } from '../src/desktop-notify-settings.ts'
import * as NotifyInvariant from '../src/invariant.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import { listState, summary } from './support.client.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The Web Notification seam against a stubbed global (jsdom ships none). */
class StubNotification {
  static permission: NotificationPermission = 'granted'
  static readonly instances: StubNotification[] = []
  onclick: (() => void) | null = null
  constructor(
    public readonly title: string,
    public readonly options?: { body?: string; tag?: string },
  ) {
    StubNotification.instances.push(this)
  }
}

/** Slot ledger reader: entry ids currently registered in the General list. */
function generalItemIds(ctx: Context): (string | undefined)[] {
  return ctx.slots
    .entries('settings.general.item')
    .map(entry => entry.options.id)
}

/** Boot the browser half over a real slot tree that declares the General list.
 * Each settings namespace gets its own stub scope, so publishing into one
 * namespace never leaks into another plugin's adoption path. */
async function bench(): Promise<{
  ctx: Context
  fiber: ReturnType<Context['plugin']>
  stubs: Map<string, ReturnType<typeof stubSettingsScope>>
  sessions: { list: ReturnType<typeof createSnapshotStore>; open: ReturnType<typeof vi.fn> }
}> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'settings.general.item': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  const sessions = {
    list: createSnapshotStore(listState([])),
    open: vi.fn(),
  }
  ctx.provide('sessions', sessions as never)
  // The locale plugin binds a settings scope, which reads the connection handle
  // and the forwarded-event port.
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  const stubs = new Map<string, ReturnType<typeof stubSettingsScope>>()
  ctx.provide('settingsScope', {
    bind: (opts: { namespace: string }) => {
      let stub = stubs.get(opts.namespace)
      if (stub === undefined) {
        stub = stubSettingsScope()
        stubs.set(opts.namespace, stub)
      }
      return stub.scope
    },
  } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, stubs, sessions }
}

describe('ui-desktop-notify browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['sessions', 'slots', 'locale', 'settingsScope'])
  })

  it('registers the General settings row, and fiber teardown removes it (HMR safety)', async () => {
    const { ctx, fiber } = await bench()
    expect(generalItemIds(ctx)).toContain('desktop-notify')
    await fiber.dispose()
    expect(generalItemIds(ctx)).not.toContain('desktop-notify')
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    // jsdom's navigator reports English: pin zh before asserting the source copy.
    ctx.locale.setLocale('zh')
    expect(translate('rowTitle')).toBe(zh.rowTitle)
    ctx.locale.setLocale('en')
    expect(translate('rowTitle')).toBe(en.rowTitle)

    // Withdrawn dictionaries leave the key unresolved rather than translated.
    await fiber.dispose()
    expect(translate('rowTitle')).not.toBe(en.rowTitle)
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('serves the row face: replica hooks, the durable write, and the permission readers', async () => {
    const { ctx, stubs } = await bench()
    const stub = stubs.get('ui-desktop-notify')!
    const entry = ctx.slots.entries('settings.general.item').find(item => item.options.id === 'desktop-notify')
    expect(entry).toBeDefined()
    const face = entry!.inject!() as {
      hooks: { enabled: { getSnapshot(): boolean }; editable: { getSnapshot(): boolean } }
      setEnabled: (next: boolean) => void
      permission: () => string
      requestPermission: () => Promise<NotificationPermission> | undefined
    }
    expect(face.hooks.enabled.getSnapshot()).toBe(false)
    expect(face.hooks.editable.getSnapshot()).toBe(false)
    face.setEnabled(true)
    expect(stub.set).toHaveBeenCalledWith('enabled', true)
    // Node specs run without the Notification global: the readers report it.
    expect(face.permission()).toBe('unsupported')
    expect(face.requestPermission()).toBeUndefined()
  })

  it('fires a granted toast through the apply wiring when an unfocused session completes', async () => {
    vi.stubGlobal('Notification', StubNotification)
    const { ctx, fiber, stubs, sessions } = await bench()
    ctx.locale.setLocale('zh')
    stubs.get('ui-desktop-notify')!.publish({ status: 'ready', writable: true, value: { enabled: true } })
    sessions.list.set(listState([summary('a', true, 'Refactor work'), summary('b', false)], 'b'))
    sessions.list.set(listState([summary('a', false, 'Refactor work'), summary('b', false)], 'b'))
    const toast = StubNotification.instances.at(-1)!
    expect(toast.title).toBe('Refactor work')
    expect(toast.options?.body).toBe(zh.body)
    expect(toast.options?.tag).toBe('a')
    await fiber.dispose()
  })
})

describe('ui-desktop-notify node half', () => {
  it('contributes no host behavior without the settings service', () => {
    // The namespace registration waits for a settings service this bench never provides.
    expect(() => { applyNode(new Context()) }).not.toThrow()
  })

  it('registers the durable namespace once the settings service is present', async () => {
    const ctx = new Context()
    const register = vi.fn()
    ctx.provide('settings', { register })
    const fiber = ctx.plugin({ inject: ['settings'], apply: applyNode })
    await fiber.await()
    expect(register).toHaveBeenCalledOnce()
    expect(register).toHaveBeenCalledWith('ui-desktop-notify', DesktopNotifySettingsSchema)
    await fiber.dispose()
  })
})

describe('ui-desktop-notify invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true }).await()
    const fiber = ctx.plugin(NotifyInvariant)
    await fiber.await()
    expect(NotifyInvariant.name).toBe('client-ui-desktop-notify-invariant')
    expect(NotifyInvariant.inject).toEqual(['invariants'])
    // Emitting an unrelated event proves the companion installed no audit.
    expect(() => { (ctx.emit as (event: string) => void)('slots/changed') }).not.toThrow()
    await fiber.dispose()
  })
})
