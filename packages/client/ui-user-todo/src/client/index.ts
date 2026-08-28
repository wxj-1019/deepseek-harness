/**
 * Daily-todo plugin, browser half. Registers the sidebar-foot entry: one
 * trigger button that opens the today panel over the user-todo storage
 * domain. One controller backs every instance; pushed `user-todo/changed`
 * events and reconnects converge an already-loaded list.
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ui-layout's SlotMap merge (the shell.overlay seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { UserTodoController } from './controller.ts'
import type { UserTodosRemoteFace } from './controller.ts'
import { TodoDrawer } from './UserTodoButton.tsx'
import type { UserTodoInjected } from './slots.ts'
import { en, zh, type UserTodoKey } from './locales.ts'

export type { UserTodoController, UserTodosRemoteFace } from './controller.ts'
export type { TodoDrawerProps } from './UserTodoButton.tsx'
export { earlierCompleted, todayItems } from './view.ts'
export type { localDayKey, sameLocalDay } from './day.ts'
export type { UserTodoInjected } from './slots.ts'
export type { UserTodoKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The daily-todo page copy. */
    'userTodo': UserTodoKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'userTodo'

/**
 * Required services (cordis fiber inject). The target seat is declared by
 * ui-sidebar's apply; registration depends on it through `slots.inject()`.
 */
export const inject = ['slots', 'locale', 'remote', 'remote.userTodos']

/**
 * Register the dictionaries and the sidebar-foot entry, and keep a loaded
 * panel converged on host-side changes.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-user-todo: copy dictionaries')

  const t = ctx.locale.bind(NS)
  const remote: UserTodosRemoteFace = ctx.remote.userTodos
  const controller = new UserTodoController(remote)
  const actions: Omit<UserTodoInjected, 'hooks'> = {
    ensure: () => controller.ensure(),
    resync: () => controller.resync(),
    add: title => controller.add(title),
    toggle: (id, done) => controller.toggle(id, done),
    retitle: (id, title) => controller.retitle(id, title),
    setWorkspaceLink: (id, workspaceId) => controller.setWorkspaceLink(id, workspaceId),
    setSessionLink: (id, sessionId) => controller.setSessionLink(id, sessionId),
    openSession: (sessionId) => { ctx.sessions.open(sessionId) },
    setNote: (id, note) => controller.setNote(id, note),
    setDue: (id, dueMs) => controller.setDue(id, dueMs),
    remove: id => controller.remove(id),
  }

  // Pushed invalidations converge only what was read; a cold list stays cold.
  ctx.effect(() => {
    const disposers = [
      ctx.remote.$on('user-todo/changed', () => {
        if (!controller.cold) void controller.resync()
      }),
      ctx.on('connection/reset', () => {
        if (!controller.cold) void controller.resync()
      }),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-user-todo: pushed invalidations')

  // Due reminders: a desktop notification per item as its due instant
  // passes, fired only while this mount is alive and only when the site
  // already holds notification permission (we never prompt). The per-item
  // fired set lives for the mount, so a surviving window re-arms on reload.
  ctx.effect(() => {
    // Load once at mount: reminders must work without the panel ever opening.
    void controller.ensure()
    const notified = new Set<string>()
    const timer = setInterval(() => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      const now = Date.now()
      for (const item of controller.getSnapshot().items) {
        if (item.done || item.dueAt === undefined || item.dueAt > now) continue
        // Re-arm when a re-dated item moves its instant: the fired key is
        // the (id, instant) pair, not the id alone.
        const firedKey = `${item.id}:${item.dueAt}`
        if (notified.has(firedKey)) continue
        notified.add(firedKey)
        const notification = new Notification(t('notify.title'), { body: item.title, tag: `user-todo:${item.id}` })
        notification.onclick = (): void => { window.focus(); notification.close() }
      }
    }, 30_000)
    return () => clearInterval(timer)
  }, 'ui-user-todo: due reminders')

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'user-todo',
    locale: NS,
    inject: (): UserTodoInjected & typeof actions => ({
      hooks: { todo: controller.store },
      ...actions,
    }),
  }, TodoDrawer))
}
