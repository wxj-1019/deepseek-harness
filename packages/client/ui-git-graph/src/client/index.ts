/**
 * Git commit-rail tab, browser half. Registers a `conversation.view` entry
 * ("Git") rendering the session workspace's commit history with the graph
 * rail; the view is read-only and fetches data from the git-graph host route.
 * @module @deepseek-ai/dsh-client-ui-git-graph/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.slots declaration merge (the slot registry service).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ctx.locale declaration merge (the locale seat).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the conversation SlotMap merge (the 'conversation.view' entry)
// and the session standard-kit merge (useSessions / sessionId).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { GitGraphTab } from './GitGraphTab.tsx'
import { en, NS, zh, type GitGraphKey } from './locales.ts'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale']

/** Conversation-view tab order: right of Trajectory (10) and Usage (20). */
const VIEW_ORDER = 30

/**
 * Mount the Git conversation view.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-git-graph: view dictionaries')

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'git-graph',
    order: VIEW_ORDER,
    label: () => t('view.git'),
    locale: NS,
    inject: () => ({ hooks: {} }),
  }, GitGraphTab))
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The git commit-rail view copy. */
    'ui-git-graph': GitGraphKey
  }
}
