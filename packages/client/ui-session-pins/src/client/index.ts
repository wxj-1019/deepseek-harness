/**
 * Session-pins plugin, browser half. Registers the header star (session
 * scope) and the sidebar pinned section (root scope), both backed by one
 * controller over the session-pins storage domain. Pushed
 * `session-pins/changed` events and reconnects converge a loaded set.
 * Export discipline: packages/client/AGENTS.md.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the pinned seat) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls ui-conversation's SlotMap merge (the header-actions entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SessionPinsController } from './controller.ts'
import type { SessionPinsRemoteFace } from './controller.ts'
import { PinStar } from './PinStar.tsx'
import { PinnedSection } from './PinnedSection.tsx'
import type { SessionPinsInjected } from './slots.ts'
import { en, zh, type SessionPinsKey } from './locales.ts'
// Type-only: pulls the ctx.slots declaration merge (the slot registry service).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ctx.sessions declaration merge (the session object layer).
import type {} from '@deepseek-ai/dsh-api-session-controller/client'

export type { SessionPinsController, SessionPinsRemoteFace } from './controller.ts'
export type { PinStarProps, StarGlyph } from './PinStar.tsx'
export type { PinnedSectionProps } from './PinnedSection.tsx'
export type { SessionPinsInjected } from './slots.ts'
export type { SessionPinsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The pinned-session copy. */
    'sessionPins': SessionPinsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'sessionPins'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'remote', 'remote.sessionPins']

/**
 * Register the dictionaries and both surfaces, and keep a loaded set
 * converged on host-side changes.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-session-pins: copy dictionaries')

  const remote: SessionPinsRemoteFace = ctx.remote.sessionPins
  const controller = new SessionPinsController(remote)
  const actions = {
    ensure: () => controller.ensure(),
    toggle: (sessionId: Parameters<typeof controller.toggle>[0]) => controller.toggle(sessionId),
    unpin: (sessionId: Parameters<typeof controller.unpin>[0]) => controller.unpin(sessionId),
    openSession: (sessionId: Parameters<typeof controller.toggle>[0]) => { ctx.sessions.open(sessionId) },
  }

  // Pushed invalidations converge only what was read; a cold set stays cold.
  ctx.effect(() => {
    const disposers = [
      ctx.remote.$on('session-pins/changed', () => {
        if (!controller.cold) void controller.resync()
      }),
      ctx.on('connection/reset', () => {
        if (!controller.cold) void controller.resync()
      }),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-session-pins: pushed invalidations')

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'pin-toggle',
    order: 30,
    locale: NS,
    inject: (): SessionPinsInjected => ({ hooks: { pins: controller.store }, ...actions }),
  }, PinStar))

  ctx.slots.inject('sidebar.pinned', () => ctx.slots.register({
    name: 'sidebar.pinned',
    locale: NS,
    inject: (): SessionPinsInjected => ({ hooks: { pins: controller.store }, ...actions }),
  }, PinnedSection))
}
