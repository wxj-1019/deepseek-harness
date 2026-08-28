/**
 * Notification-center plugin, browser half. Registers the footer bell and the
 * shell.overlay panel (its first occupant), both backed by one controller
 * over the notifications storage domain. Pushed `notifications/changed`
 * events and reconnects converge a loaded list.
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the footer-action seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls ui-layout's SlotMap merge (the shell.overlay seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { NotificationsController } from './controller.ts'
import type { NotificationsRemoteFace } from './controller.ts'
import { NotificationBell } from './NotificationBell.tsx'
import { NotificationPanel } from './NotificationPanel.tsx'
import type { NotificationCenterInjected } from './slots.ts'
import { en, zh, type NotificationCenterKey } from './locales.ts'

export type { NotificationsController, NotificationsRemoteFace } from './controller.ts'
export type { NotificationBellProps, BellGlyph } from './NotificationBell.tsx'
export type { NotificationPanelProps } from './NotificationPanel.tsx'
export type { NotificationCenterInjected } from './slots.ts'
export type { NotificationCenterKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The notification-center copy. */
    'notificationCenter': NotificationCenterKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'notificationCenter'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'remote', 'remote.notifications']

/**
 * Register the dictionaries and both surfaces, and keep a loaded list
 * converged on host-side changes.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-notification-center: copy dictionaries')

  const remote: NotificationsRemoteFace = ctx.remote.notifications
  const controller = new NotificationsController(remote)
  const actions = {
    ensure: () => controller.ensure(),
    toggleOpen: () => { controller.toggleOpen() },
    close: () => { controller.close() },
    markRead: (id: Parameters<typeof controller.markRead>[0]) => controller.markRead(id),
    markAllRead: () => controller.markAllRead(),
    clearRead: () => controller.clearRead(),
    openSession: (sessionId: SessionId) => { ctx.sessions.open(sessionId) },
  }

  // Pushed invalidations converge only what was read; a cold list stays cold.
  ctx.effect(() => {
    const disposers = [
      ctx.remote.$on('notifications/changed', () => {
        if (!controller.cold) void controller.resync()
      }),
      ctx.on('connection/reset', () => {
        if (!controller.cold) void controller.resync()
      }),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-notification-center: pushed invalidations')

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'notification-center',
    order: 40,
    locale: NS,
    inject: (): NotificationCenterInjected => ({ hooks: { notifications: controller.store }, ...actions }),
  }, NotificationBell))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'notification-center',
    locale: NS,
    inject: (): NotificationCenterInjected => ({ hooks: { notifications: controller.store }, ...actions }),
  }, NotificationPanel))
}
