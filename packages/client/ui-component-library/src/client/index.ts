/**
 * Client half: the component library card in the Plugins settings section's
 * configurable tab, keyed by the `component-library` settings namespace the
 * tab pairs with served card keys.
 * @module @deepseek-ai/dsh-client-ui-component-library/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the ctx.slots declaration merge (the slot registry service).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ctx.remote Context merge (the typed RPC client).
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { ComponentLibraryController } from './controller.ts'
import type { ComponentLibraryRemoteFace } from './controller.ts'
import { ComponentLibraryCard } from './ComponentLibraryCard.tsx'
import { NS, en, zh } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const LOCALE_NS = NS

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote', 'remote.componentLibrary']

export { ComponentLibraryController, filterRecords } from './controller.ts'
export type { ComponentLibraryRemoteFace, ComponentLibraryState, ComponentLibraryStatus } from './controller.ts'
export { ComponentLibraryCard } from './ComponentLibraryCard.tsx'
export type { ComponentLibraryCardComponentProps, ComponentLibraryCardFace } from './ComponentLibraryCard.tsx'

/**
 * Mount the component library card onto the Plugins configurable tab.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'ui-component-library: card dictionaries')

  const remote: ComponentLibraryRemoteFace = ctx.remote.componentLibrary
  const controller = new ComponentLibraryController(remote)

  // Pushed invalidations converge only what was read; a cold library stays
  // cold until the card first renders.
  ctx.effect(() => {
    const disposers = [
      ctx.remote.$on('component-library/changed', () => {
        if (!controller.cold) void controller.resync()
      }),
      ctx.on('connection/reset', () => {
        if (!controller.cold) void controller.resync()
      }),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'ui-component-library: pushed invalidations')

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: 'component-library',
    locale: LOCALE_NS,
    inject: () => ({
      hooks: { componentLibrary: controller.store },
      ensure: () => void controller.ensure(),
      setQuery: (query: string) => {
        controller.setQuery(query)
      },
      review: (id: string, decision: 'approve' | 'discard') => void controller.review(id, decision),
    }),
  }, ComponentLibraryCard))
}
