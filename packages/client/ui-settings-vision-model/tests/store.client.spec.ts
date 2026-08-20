/**
 * The vision-model settings store: the catalog/settings join, image-capable
 * projection, stored-route read, and the optimistic revision-guarded writes.
 */
import { describe, expect, it, vi } from 'vitest'
import { VISION_MODEL_SETTINGS_NS, VisionModelSettingsStore } from '../src/client/store.ts'

/** One successful RPC envelope. */
function ok<T>(value: T): { result: { ok: true; value: T } } {
  return { result: { ok: true, value } }
}

/** One failed RPC envelope. */
function fail(message: string): { result: { ok: false; error: { code: string; message: string; details: object } } } {
  return { result: { ok: false, error: { code: 'internal', message, details: {} } } }
}

/** One catalog response envelope. */
type CatalogModel = { id: string; name: string; inputModalities?: string[] }
type CatalogGroup = { id: string; name: string; models: CatalogModel[] }
type CatalogEnvelope = {
  result: { ok: true; value: { groups: CatalogGroup[] } }
}

/** One settings-describe response envelope. */
type SettingsEnvelope = {
  result: { ok: true; value: { writable: boolean; hasDocument: boolean; namespaces: { ns: string; revision?: number; value?: object }[] } }
}

/** One settings-mutate response envelope. */
type MutateEnvelope =
  | { result: { ok: false; error: { code: string; message: string; details: object } } }
  | { result: { ok: true; value: object } }

/** A wire face over controllable llm/settings domains. */
function face(overrides: {
  models?: () => Promise<CatalogEnvelope>
  describe?: () => Promise<SettingsEnvelope>
  mutate?: (payload: object) => Promise<MutateEnvelope>
} = {}) {
  const models = overrides.models ?? (() => Promise.resolve(ok({ groups: [] })))
  const describe = overrides.describe ?? (() => Promise.resolve(
    ok({ writable: true, hasDocument: false, namespaces: [] }),
  ))
  const mutate = overrides.mutate ?? (() => Promise.resolve(ok({})))
  return { llm: { models }, settings: { describe, mutate } }}

const CATALOG = (() => ok({
  groups: [{
    id: 'qwen-dashscope',
    name: 'Qwen (DashScope)',
    models: [
      { id: 'qwen3-vl-plus', name: 'Qwen3-VL-Plus', inputModalities: ['text', 'image'] },
      { id: 'qwen3-flash', name: 'Qwen3-Flash' },
    ],
  }],
}))()

const STORED = (() => ok({
  writable: true,
  hasDocument: true,
  namespaces: [{
    ns: VISION_MODEL_SETTINGS_NS,
    revision: 7,
    value: { provider: 'qwen-dashscope', model: 'qwen3-vl-plus' },
  }],
}))()

describe('VisionModelSettingsStore.load', () => {
  it('projects image-capable groups, the stored route, writability, and the revision', async () => {
    const store = new VisionModelSettingsStore(face({
      models: () => Promise.resolve(CATALOG),
      describe: () => Promise.resolve(STORED),
    }))
    await store.load()
    const snapshot = store.store.getSnapshot()
    expect(snapshot.status).toBe('ready')
    expect(snapshot.writable).toBe(true)
    expect(snapshot.revision).toBe(7)
    expect(snapshot.groups).toEqual([{
      id: 'qwen-dashscope',
      name: 'Qwen (DashScope)',
      models: [{ id: 'qwen3-vl-plus', name: 'Qwen3-VL-Plus' }],
    }])
    expect(snapshot.current).toEqual({ provider: 'qwen-dashscope', model: 'qwen3-vl-plus' })
  })

  it('reports a denied catalog response as an error', async () => {
    const store = new VisionModelSettingsStore(face({
      models: () => Promise.resolve(fail('catalog down')),
    }))
    await store.load()
    const snapshot = store.store.getSnapshot()
    expect(snapshot.status).toBe('error')
    expect(snapshot.error).toBe('catalog down')
  })

  it('reports a denied settings response as an error', async () => {
    const store = new VisionModelSettingsStore(face({
      describe: () => Promise.resolve(fail('settings down')),
    }))
    await store.load()
    const snapshot = store.store.getSnapshot()
    expect(snapshot.status).toBe('error')
    expect(snapshot.error).toBe('settings down')
  })

  it('surfaces a transport throw through the error status', async () => {
    const store = new VisionModelSettingsStore(face({
      models: () => Promise.reject(new Error('network')),
    }))
    await store.load()
    const snapshot = store.store.getSnapshot()
    expect(snapshot.status).toBe('error')
    expect(snapshot.error).toBe('network')
  })

  it('keeps the newest generation when an older load settles later', async () => {
    let releaseA!: () => void
    let releaseB!: () => void
    const a = new Promise<void>((resolve) => { releaseA = resolve })
    const b = new Promise<void>((resolve) => { releaseB = resolve })
    // Generation A resolves second with writable=false; it must not overwrite
    // the newer B result (writable=true).
    const store = new VisionModelSettingsStore(face({
      describe: (() => {
        let calls = 0
        return () => {
          calls += 1
          const gate = calls === 1 ? a : b
          const value = calls === 1
            ? { writable: false, hasDocument: true, namespaces: [] }
            : { writable: true, hasDocument: true, namespaces: [] }
          return gate.then(() => ok(value))
        }
      })(),
    }))
    const firstLoad = store.load()
    const secondLoad = store.load()
    releaseB()
    await secondLoad
    expect(store.store.getSnapshot().writable).toBe(true)
    releaseA()
    await firstLoad
    expect(store.store.getSnapshot().writable).toBe(true)
  })

  it('ignores an error from a superseded load', async () => {
    let releaseA!: () => void
    let releaseB!: () => void
    const a = new Promise<never>((_, reject) => { releaseA = () => { reject(new Error('stale')) } })
    const b = new Promise<void>((resolve) => { releaseB = resolve })
    const store = new VisionModelSettingsStore(face({
      describe: (() => {
        let calls = 0
        return () => {
          calls += 1
          if (calls === 1) return a
          return b.then(() => ok({ writable: true, hasDocument: true, namespaces: [] }))
        }
      })(),
    }))
    const firstLoad = store.load()
    const secondLoad = store.load()
    releaseB()
    await secondLoad
    expect(store.store.getSnapshot().status).toBe('ready')
    // The stale A errors after B's acceptance: its catch returns on the
    // superseded generation and must not surface the failure.
    releaseA()
    await firstLoad
    expect(store.store.getSnapshot().status).toBe('ready')
  })

  it('omits provider groups that carry no image-capable model', async () => {
    const store = new VisionModelSettingsStore(face({
      models: () => Promise.resolve(ok({
        groups: [
          // One model without any modality declaration and one declaring text
          // only: neither reads as image-capable, so the whole group drops.
          {
            id: 'text-only',
            name: 'Text Only',
            models: [
              { id: 't1', name: 'T1' },
              { id: 't2', name: 'T2', inputModalities: ['text'] },
            ],
          },
          { id: 'qwen-dashscope', name: 'Qwen', models: [{ id: 'qwen3-vl-plus', name: 'Qwen3-VL-Plus', inputModalities: ['text', 'image'] }] },
        ],
      })),
    }))
    await store.load()
    const groups = store.store.getSnapshot().groups
    expect(groups).toEqual([{ id: 'qwen-dashscope', name: 'Qwen', models: [{ id: 'qwen3-vl-plus', name: 'Qwen3-VL-Plus' }] }])
    expect(groups.some(group => group.id === 'text-only')).toBe(false)
  })

  it('treats a partial or malformed stored route as unconfigured', async () => {
    // Every one of these views must read as "no route": a missing field, a
    // field of the wrong type, or an empty pair.
    const malformed = [
      { provider: 'qwen-dashscope' },
      { model: 'qwen3-vl-plus' },
      { provider: 123, model: 'qwen3-vl-plus' },
      { provider: 'qwen-dashscope', model: 456 },
    ]
    for (const value of malformed) {
      const store = new VisionModelSettingsStore(face({
        describe: () => Promise.resolve(ok({
          writable: true,
          hasDocument: true,
          namespaces: [{ ns: VISION_MODEL_SETTINGS_NS, revision: 1, value }],
        })),
      }))
      await store.load()
      expect(store.store.getSnapshot().current).toBeNull()
    }
  })
})

describe('VisionModelSettingsStore.save', () => {
  it('writes the route with the namespace revision and reloads on success', async () => {
    const mutate = vi.fn(() => Promise.resolve(ok({})))
    const store = new VisionModelSettingsStore(face({ mutate }))
    // Revision present only after a successful load.
    store.store.update((s) => { s.revision = 3 })
    const failure = await store.save('qwen-dashscope', 'qwen3-vl-plus')
    expect(failure).toBeUndefined()
    expect(mutate).toHaveBeenCalledWith({
      ns: 'vision-model',
      ops: [
        { op: 'set', path: ['provider'], value: 'qwen-dashscope' },
        { op: 'set', path: ['model'], value: 'qwen3-vl-plus' },
      ],
      expectedRevision: 3,
    })
  })

  it('omits the expected revision before the first load and reports a denied write', async () => {
    const mutate = vi.fn(() => Promise.resolve(fail('settings-conflict')))
    const store = new VisionModelSettingsStore(face({ mutate }))
    const failure = await store.save('qwen-dashscope', 'qwen3-vl-plus')
    expect(failure).toBe('settings-conflict')
    const call = mutate.mock.calls[0]![0] as Record<string, unknown>
    expect(call).toMatchObject({ ns: 'vision-model' })
    expect(call.ops).toEqual([
      { op: 'set', path: ['provider'], value: 'qwen-dashscope' },
      { op: 'set', path: ['model'], value: 'qwen3-vl-plus' },
    ])
    expect(call).not.toHaveProperty('expectedRevision')
  })

  it('maps a transport throw to its message without a write', async () => {
    const mutate = vi.fn(() => Promise.reject(new Error('offline')))
    const store = new VisionModelSettingsStore(face({ mutate }))
    const failure = await store.save('qwen-dashscope', 'qwen3-vl-plus')
    expect(failure).toBe('offline')
  })

})

describe('VisionModelSettingsStore.clear', () => {
  it('unsets both fields with the revision and reloads on success', async () => {
    const mutate = vi.fn(() => Promise.resolve(ok({})))
    const store = new VisionModelSettingsStore(face({ mutate }))
    store.store.update((s) => { s.revision = 5 })
    const failure = await store.clear()
    expect(failure).toBeUndefined()
    expect(mutate).toHaveBeenCalledWith({
      ns: 'vision-model',
      ops: [
        { op: 'unset', path: ['provider'] },
        { op: 'unset', path: ['model'] },
      ],
      expectedRevision: 5,
    })
  })

  it('reports a denied clear', async () => {
    const store = new VisionModelSettingsStore(face({
      mutate: () => Promise.resolve(fail('settings-conflict')),
    }))
    expect(await store.clear()).toBe('settings-conflict')
  })

  it('maps a clear transport throw to its message and omits the revision before the first load', async () => {
    const mutate = vi.fn(() => Promise.reject(new Error('offline')))
    const store = new VisionModelSettingsStore(face({ mutate }))
    expect(await store.clear()).toBe('offline')
    expect(mutate.mock.calls[0]![0]).not.toHaveProperty('expectedRevision')
  })
})
