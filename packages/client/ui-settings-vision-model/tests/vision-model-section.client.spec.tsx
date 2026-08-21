// @vitest-environment jsdom
/**
 * The Models-page vision-model block: every render posture and the save/clear
 * mutation flows against a real store over a fake wire whose route mutates on
 * write, so the post-save reload reflects the host acceptance.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { VisionModelSection, type VisionModelSectionProps } from '../src/client/VisionModelSection.tsx'
import { VISION_MODEL_SETTINGS_NS, VisionModelSettingsStore } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

/** One successful RPC envelope. */
function ok<T>(value: T): { result: { ok: true; value: T } } {
  return { result: { ok: true, value } }
}

const GROUPS = { groups: [
  {
    id: 'qwen-dashscope',
    name: 'Qwen (DashScope)',
    models: [
      { id: 'qwen3-vl-plus', name: 'Qwen3-VL-Plus', inputModalities: ['text', 'image'] },
      { id: 'qwen3-vl-max', name: 'Qwen3-VL-Max', inputModalities: ['image'] },
      { id: 'qwen3-flash', name: 'Qwen3-Flash' },
    ],
  },
  {
    id: 'other-vision',
    name: 'Other Vision',
    models: [{ id: 'other-vl', name: 'Other-VL', inputModalities: ['image'] }],
  },
] }

type Route = { provider: string; model: string }
type MutatePayload = { ns: string; ops: { op: 'set' | 'unset'; path: string[]; value?: string }[] }

/** A wire face whose stored route mutates on writes (the host acceptance). */
function fakeApi(initial?: Route, writable = true) {
  let route = initial
  const namespacesOf = (): { ns: string; revision: number; value: Route }[] =>
    route === undefined ? [] : [{ ns: VISION_MODEL_SETTINGS_NS, revision: 1, value: route }]
  const llm = { models: vi.fn(() => Promise.resolve(ok(GROUPS))) }
  const settings = {
    describe: vi.fn(() => Promise.resolve(ok({ writable, hasDocument: true, namespaces: namespacesOf() }))),
    mutate: vi.fn((payload: MutatePayload) => {
      let next: Partial<Route> = { ...route }
      for (const op of payload.ops) {
        if (op.op === 'set' && op.value !== undefined) {
          next = { ...next, [op.path[0]!]: op.value }
        } else {
          const dropped = op.path[0] as keyof Route
          next = Object.fromEntries(Object.entries(next).filter(([key]) => key !== dropped))
        }
      }
      route = next.provider !== undefined && next.model !== undefined
        ? { provider: next.provider, model: next.model }
        : undefined
      return Promise.resolve(ok({}))
    }),
  }
  return { llm, settings }
}

/** Render the section over a freshly mounted store; hooks wait for its load. */
async function bench(api: ReturnType<typeof fakeApi>) {
  const store = new VisionModelSettingsStore(api as never)
  const props: VisionModelSectionProps = {
    controller: store,
    useVisionModel: bindSnapshotSelector(store.store),
    t,
  }
  render(<VisionModelSection {...props} />)
  await flush()
  return { store, api }
}

/** Flush pending promises (component load and post-save reloads). */
async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}

const t = makeTranslate(zh) as NonNullable<VisionModelSectionProps['t']>

describe('VisionModelSection', () => {
  it('renders nothing before the inject face is complete', () => {
    render(<VisionModelSection />)
    expect(screen.queryByText(t('unconfiguredHint'))).toBeNull()
  })

  it('renders the configured posture over the stored route', async () => {
    await bench(fakeApi({ provider: 'qwen-dashscope', model: 'qwen3-vl-plus' }))
    expect(screen.getByText(t('configuredHint'))).toBeDefined()
    const provider = screen.getByRole('combobox', { name: t('provider') }) as HTMLSelectElement
    expect(provider.value).toBe('qwen-dashscope')
    const model = screen.getByRole('combobox', { name: t('model') }) as HTMLSelectElement
    expect(model.value).toBe('qwen3-vl-plus')
    // Only the image-capable models are listed; the text-only sibling is absent.
    expect(within(model).queryByText('Qwen3-Flash')).toBeNull()
    expect(screen.getByRole('button', { name: t('clear') })).toBeDefined()
  })

  it('renders the unconfigured posture and enables the model select once a provider is chosen', async () => {
    await bench(fakeApi())
    expect(screen.getByText(t('unconfiguredHint'))).toBeDefined()
    const provider = screen.getByRole('combobox', { name: t('provider') }) as HTMLSelectElement
    const model = screen.getByRole('combobox', { name: t('model') }) as HTMLSelectElement
    expect(model.disabled).toBe(true)
    fireEvent.change(provider, { target: { value: 'qwen-dashscope' } })
    await flush()
    expect(provider.value).toBe('qwen-dashscope')
    expect(model.disabled).toBe(false)
  })

  it('renders the no-models error and the load-failure posture', async () => {
    const empty = fakeApi()
    empty.llm.models.mockResolvedValueOnce(ok({ groups: [] }))
    await bench(empty)
    expect(screen.getByText(t('noImageModels'))).toBeDefined()

    const failing = fakeApi()
    failing.llm.models.mockRejectedValueOnce(new Error('catalog'))
    const store = new VisionModelSettingsStore(failing as never)
    render(<VisionModelSection controller={store} useVisionModel={bindSnapshotSelector(store.store)} t={t} />)
    await flush()
    // The error branch surfaces the store's message verbatim.
    expect(screen.getByText('catalog')).toBeDefined()
  })

  it('shows the read-only notice and disables edits when the document is not writable', async () => {
    await bench(fakeApi({ provider: 'qwen-dashscope', model: 'qwen3-vl-plus' }, false))
    expect(screen.getByText(t('readOnly'))).toBeDefined()
    const provider = screen.getByRole('combobox', { name: t('provider') }) as HTMLSelectElement
    expect(provider.disabled).toBe(true)
  })

  it('enables Save only with a complete differing draft, writes the route, and announces the save', async () => {
    const api = fakeApi({ provider: 'qwen-dashscope', model: 'qwen3-vl-plus' })
    const { store } = await bench(api)
    const save = screen.getByRole('button', { name: t('save') }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    // Switching provider clears the stale model: it must not fall back to the
    // old provider's model id, and Save stays disabled until a model is picked.
    const provider = screen.getByRole('combobox', { name: t('provider') })
    fireEvent.change(provider, { target: { value: 'other-vision' } })
    await flush()
    const model = screen.getByRole('combobox', { name: t('model') }) as HTMLSelectElement
    expect(model.value).toBe('')
    expect(save.disabled).toBe(true)
    fireEvent.change(model, { target: { value: 'other-vl' } })
    await flush()
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await flush()
    expect(api.settings.mutate).toHaveBeenCalledWith(expect.objectContaining({
      ns: VISION_MODEL_SETTINGS_NS,
      ops: [
        { op: 'set', path: ['provider'], value: 'other-vision' },
        { op: 'set', path: ['model'], value: 'other-vl' },
      ],
    }))
    expect(store.store.getSnapshot().status).toBe('ready')
    expect(screen.getByText(t('saved'))).toBeDefined()
  })

  it('treats a model-only change under the same provider as a dirty draft', async () => {
    const api = fakeApi({ provider: 'qwen-dashscope', model: 'qwen3-vl-plus' })
    await bench(api)
    const model = screen.getByRole('combobox', { name: t('model') })
    fireEvent.change(model, { target: { value: 'qwen3-vl-max' } })
    await flush()
    const save = screen.getByRole('button', { name: t('save') }) as HTMLButtonElement
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await flush()
    expect(api.settings.mutate).toHaveBeenCalledWith(expect.objectContaining({
      ns: VISION_MODEL_SETTINGS_NS,
      ops: [
        { op: 'set', path: ['provider'], value: 'qwen-dashscope' },
        { op: 'set', path: ['model'], value: 'qwen3-vl-max' },
      ],
    }))
  })

  it('keeps the save disabled when the draft equals the stored route', async () => {
    await bench(fakeApi({ provider: 'qwen-dashscope', model: 'qwen3-vl-plus' }))
    // Re-selecting the stored values still fires the change handlers; the
    // drafts now equal the route, so nothing is dirty.
    fireEvent.change(screen.getByRole('combobox', { name: t('provider') }), { target: { value: 'qwen-dashscope' } })
    fireEvent.change(screen.getByRole('combobox', { name: t('model') }), { target: { value: 'qwen3-vl-plus' } })
    await flush()
    const saveButton = screen.getByRole('button', { name: t('save') }) as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)
  })

  it('announces a write conflict and keeps the drafts', async () => {
    const api = fakeApi({ provider: 'qwen-dashscope', model: 'qwen3-vl-plus' })
    api.settings.mutate.mockRejectedValueOnce(new Error('conflict'))
    await bench(api)
    const provider = screen.getByRole('combobox', { name: t('provider') })
    fireEvent.change(provider, { target: { value: 'other-vision' } })
    const model = screen.getByRole('combobox', { name: t('model') })
    fireEvent.change(model, { target: { value: 'other-vl' } })
    await flush()
    fireEvent.click(screen.getByRole('button', { name: t('save') }))
    await flush()
    expect(screen.getByText(t('conflict'))).toBeDefined()
  })

  it('clears a configured route and the reload shows the unconfigured posture', async () => {
    const api = fakeApi({ provider: 'qwen-dashscope', model: 'qwen3-vl-plus' })
    await bench(api)
    fireEvent.click(screen.getByRole('button', { name: t('clear') }))
    await flush()
    expect(api.settings.mutate).toHaveBeenCalledWith(expect.objectContaining({
      ns: VISION_MODEL_SETTINGS_NS,
      ops: [{ op: 'unset', path: ['provider'] }, { op: 'unset', path: ['model'] }],
    }))
    expect(screen.queryByText(t('configuredHint'))).toBeNull()
    expect(screen.getByText(t('unconfiguredHint'))).toBeDefined()
  })

  it('announces a denied clear as a conflict', async () => {
    const api = fakeApi({ provider: 'qwen-dashscope', model: 'qwen3-vl-plus' })
    api.settings.mutate.mockRejectedValueOnce(new Error('conflict'))
    await bench(api)
    fireEvent.click(screen.getByRole('button', { name: t('clear') }))
    await flush()
    expect(screen.getByText(t('conflict'))).toBeDefined()
  })
})
