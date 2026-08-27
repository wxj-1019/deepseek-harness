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
// Type-only: pulls ui-sidebar's SlotMap merge (the footer-action seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { UserTodoController } from './controller.ts'
import type { UserTodosRemoteFace } from './controller.ts'
import { UserTodoButton } from './UserTodoButton.tsx'
import type { UserTodoInjected } from './slots.ts'
import { en, zh, type UserTodoKey } from './locales.ts'

export type { UserTodoController, UserTodosRemoteFace } from './controller.ts'
export type { UserTodoButtonProps } from './UserTodoButton.tsx'
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

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'user-todo',
    order: 30,
    locale: NS,
    inject: (): UserTodoInjected & typeof actions => ({
      hooks: { todo: controller.store },
      ...actions,
    }),
  }, UserTodoButton))
}
