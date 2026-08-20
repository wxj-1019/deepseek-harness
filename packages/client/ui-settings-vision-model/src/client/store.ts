/**
 * Vision-model settings page store: one snapshot joining the session-free
 * model catalog (`llm.models`) with the `vision-model` settings namespace
 * (`settings.describe`). The host stays the single fact source — every
 * mutation writes through the wire and the page re-renders from the next
 * describe, pushed or refetched.
 */

import type { IApiClient, ModelProviderGroup, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** The host-owned settings namespace this page edits. */
export const VISION_MODEL_SETTINGS_NS = 'vision-model'

/** One provider group with at least one image-capable model. */
export interface VisionModelGroup {
  /** Provider route id used for requests. */
  id: string
  /** Provider display name. */
  name: string
  /** Image-capable models in provider order. */
  models: { id: string; name: string }[]
}

/** Page snapshot. */
export interface VisionModelState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Whole-load failure text; write failures stay in the section. */
  error: string | null
  /** Whether the settings provider accepts writes. */
  writable: boolean
  /** Provider groups carrying at least one image-capable model. */
  groups: readonly VisionModelGroup[]
  /** The stored vision-model route, or null while unconfigured. */
  current: { provider: string; model: string } | null
  /** Namespace revision for optimistic-conflict mutation. */
  revision: number | undefined
}

/**
 * Human text for a rejected wire call; the host or the transport can reject
 * with anything, and the page still has to say something.
 * @param error - the rejection value.
 * @returns the message to show.
 */
export function messageOf(error: unknown): string {
  /* v8 ignore next -- transports reject with Errors; the String arm satisfies the unknown type */
  return error instanceof Error ? error.message : String(error)
}

/** Whether a model's declared modalities include image input. */
function isImageCapable(modalities: readonly string[] | undefined): boolean {
  return modalities?.includes('image') ?? false
}

/** The stored route of the vision-model namespace view, or null when empty. */
function storedRoute(view: SettingsNamespaceView | undefined): { provider: string; model: string } | null {
  if (view === undefined) return null
  const value = view.value as { provider?: unknown; model?: unknown } | undefined
  const provider = typeof value?.provider === 'string' ? value.provider : ''
  const model = typeof value?.model === 'string' ? value.model : ''
  return provider.length > 0 && model.length > 0 ? { provider, model } : null
}

/** The vision-model settings page controller (one per settings surface). */
export class VisionModelSettingsStore {
  /** The snapshot the section renders from (uSES-safe store). */
  readonly store: SnapshotStore<VisionModelState> = createSnapshotStore<VisionModelState>({
    status: 'idle', error: null, writable: false, groups: [], current: null, revision: undefined,
  })

  /** Latest load wins; an older response never overwrites a newer one. */
  private generation = 0

  /**
   * @param api - the wire face (llm/settings domains).
   */
  constructor(private readonly api: Pick<IApiClient, 'llm' | 'settings'>) {}

  /**
   * Refresh the whole page snapshot: catalog and settings in parallel, then
   * project the image-capable groups and the stored route. A failure keeps
   * the last good snapshot and surfaces the error.
   * @returns nothing; the snapshot carries the outcome.
   */
  async load(): Promise<void> {
    const generation = ++this.generation
    this.store.update((s) => { s.status = 'loading'; s.error = null })
    let writable: boolean
    let view: SettingsNamespaceView | undefined
    let groups: readonly ModelProviderGroup[]
    try {
      const [catalogResponse, settingsResponse] = await Promise.all([
        this.api.llm.models({}),
        this.api.settings.describe({}),
      ])
      if (!catalogResponse.result.ok) throw new Error(catalogResponse.result.error.message)
      if (!settingsResponse.result.ok) throw new Error(settingsResponse.result.error.message)
      groups = catalogResponse.result.value.groups
      writable = settingsResponse.result.value.writable
      view = settingsResponse.result.value.namespaces.find(namespace => namespace.ns === VISION_MODEL_SETTINGS_NS)
    } catch (error) {
      if (generation !== this.generation) return
      this.store.update((s) => {
        s.status = 'error'
        /* v8 ignore next -- transports reject with Errors; the String arm satisfies the unknown type */
        s.error = error instanceof Error ? error.message : String(error)
      })
      return
    }
    if (generation !== this.generation) return
    this.store.update((s) => {
      s.status = 'ready'
      s.error = null
      s.writable = writable
      s.groups = groups.flatMap((group) => {
        const models = group.models
          .filter(model => isImageCapable(model.inputModalities))
          .map(model => ({ id: model.id, name: model.name }))
        return models.length === 0 ? [] : [{ id: group.id, name: group.name, models }]
      })
      s.current = storedRoute(view)
      s.revision = view?.revision
    })
  }

  /**
   * Save the complete vision-model route. The write is optimistic on the
   * namespace revision, so a concurrent edit fails loud instead of silently
   * overwriting; the caller reloads on success.
   * @param provider - registered provider route.
   * @param model - provider-owned model id.
   * @returns the failure message, or undefined once the write settled.
   */
  async save(provider: string, model: string): Promise<string | undefined> {
    const revision = this.store.getSnapshot().revision
    try {
      const response = await this.api.settings.mutate({
        ns: VISION_MODEL_SETTINGS_NS,
        ops: [
          { op: 'set', path: ['provider'], value: provider },
          { op: 'set', path: ['model'], value: model },
        ],
        ...revision === undefined ? {} : { expectedRevision: revision },
      })
      if (!response.result.ok) return response.result.error.message
    } catch (error) {
      return messageOf(error)
    }
    await this.load()
    return undefined
  }

  /**
   * Clear the vision-model route (falls back to the empty composition base).
   * @returns the failure message, or undefined once the write settled.
   */
  async clear(): Promise<string | undefined> {
    const revision = this.store.getSnapshot().revision
    try {
      const response = await this.api.settings.mutate({
        ns: VISION_MODEL_SETTINGS_NS,
        ops: [
          { op: 'unset', path: ['provider'] },
          { op: 'unset', path: ['model'] },
        ],
        ...revision === undefined ? {} : { expectedRevision: revision },
      })
      if (!response.result.ok) return response.result.error.message
    } catch (error) {
      return messageOf(error)
    }
    await this.load()
    return undefined
  }
}
