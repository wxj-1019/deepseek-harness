/**
 * Client half: the "Components" conversation-view gallery for visual browsing
 * of the component library records.
 * @module @deepseek-ai/dsh-client-ui-component-library/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the ctx.slots declaration merge (the slot registry service)
// and the conversation SlotMap merge (the 'conversation.view' entry).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the ctx.remote Context merge (the typed RPC client).
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { ComponentLibraryController } from './controller.ts'
import type { ComponentLibraryRemoteFace } from './controller.ts'
import { ComponentLibraryGallery } from './ComponentLibraryGallery.tsx'
import type { ComponentLibraryGalleryFace } from './ComponentLibraryGallery.tsx'
import { NS, en, zh } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const LOCALE_NS = NS

/** Gallery tab position: right of the Git rail (order 30). */
const GALLERY_VIEW_ORDER = 35

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote', 'remote.componentLibrary']

export { ComponentLibraryController, filterRecords } from './controller.ts'
export type { ComponentLibraryRemoteFace, ComponentLibraryState, ComponentLibraryStatus } from './controller.ts'
export { ComponentLibraryGallery } from './ComponentLibraryGallery.tsx'
export type { ComponentLibraryGalleryFace, ComponentLibraryGalleryProps } from './ComponentLibraryGallery.tsx'

/**
 * Mount the gallery onto the conversation view strip; the read converges the
 * shared controller.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(LOCALE_NS)
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'ui-component-library: card dictionaries')

  const remote: ComponentLibraryRemoteFace = ctx.remote.componentLibrary
  const controller = new ComponentLibraryController(remote)

  // Pushed invalidations converge only what was read; a cold library stays
  // cold until a surface first renders.
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

  const galleryFace = (): ComponentLibraryGalleryFace => ({
    hooks: { componentLibrary: controller.store },
    ensure: () => void controller.ensure(),
    setQuery: (query: string) => {
      controller.setQuery(query)
    },
  })

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'component-library',
    order: GALLERY_VIEW_ORDER,
    label: () => t('gallery.tab'),
    locale: LOCALE_NS,
    inject: galleryFace,
  }, ComponentLibraryGallery))
}
