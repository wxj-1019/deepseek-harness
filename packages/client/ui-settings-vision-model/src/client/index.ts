/**
 * Vision-model routing settings plugin, browser half. It registers the
 * "识图模型 / Vision model" settings section: one provider/model pair that
 * routes image-bearing requests, over the `vision-model` settings namespace
 * and the session-free model catalog.
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ctx.remote merge and the forwarded-event key face
// (settings invalidations ride the allowlist) into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { VisionModelSection } from './VisionModelSection.tsx'
import type { VisionModelSectionInjected } from './VisionModelSection.tsx'
import { VISION_MODEL_SETTINGS_NS, VisionModelSettingsStore, type VisionModelState } from './store.ts'
import { en, zh, type VisionModelKey } from './locales.ts'

export type { VisionModelSectionInjected, VisionModelSectionProps } from './VisionModelSection.tsx'
export type { VisionModelKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The vision-model routing page copy. */
    'settings.visionModel': VisionModelKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.visionModel'

/**
 * Refetch the page snapshot only after its first load: an unopened page must
 * not fetch on background invalidations.
 * @param controller - the page store.
 */
export function refreshIfLoaded(controller: VisionModelSettingsStore): void {
  if (controller.store.getSnapshot().status === 'idle') return
  void controller.load()
}

/**
 * Required services (cordis fiber inject). The target slot is declared by
 * ui-settings' apply, whose activation order relative to this one is NOT
 * constrained; registration depends on each slot through `slots.inject()`.
 */
export const inject = ['slots', 'locale', 'connection', 'remote']

/**
 * Register the vision-model section once the `settings.section` declaration
 * is on the ledger, wire its store to the connection, and keep it fresh on
 * every pushed invalidation (settings or provider topology).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-vision-model: copy dictionaries')

  const connection = ctx.get('connection') as ConnectionHandle
  const controller = new VisionModelSettingsStore(connection.api)
  // The page snapshot rides the reserved hooks compartment: the renderer
  // binds the bare store into the component's `useVisionModel` selector hook
  // (business components never carry subscription machinery).
  const visionModelSource: HostObservable<VisionModelState> = controller.store
  // Registration-time text (the nav label thunk) and the inject face share
  // one bound translate; copy freshness rides the locale revision.
  const t = ctx.locale.bind(NS) as VisionModelSectionInjected['t']
  const injected = (): VisionModelSectionInjected => ({
    controller,
    hooks: { visionModel: visionModelSource },
    t,
  })

  // Pushed invalidations converge the open page without polling: any
  // settings or topology change refetches once the section loaded.
  ctx.effect(() => {
    const disposers = [
      ctx.remote.$on('settings/document-updated', (ns) => {
        if (ns === VISION_MODEL_SETTINGS_NS) refreshIfLoaded(controller)
      }),
      ctx.remote.$on('llm/adapters-updated', () => refreshIfLoaded(controller)),
      ctx.on('connection/reset', () => refreshIfLoaded(controller)),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-settings-vision-model: pushed invalidations')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'vision-model',
    order: 11,
    label: () => t('nav'),
    inject: injected,
  }, VisionModelSection))
}
