/**
 * Usage plugin, browser half. Contributes the "Usage / 用量" view tab to the
 * conversation header strip (right of Trajectory), rendering the per-session
 * token-usage table from the usage-ledger storage domain. Export discipline:
 * packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the conversation SlotMap merge (the 'conversation.view' entry)
// and the sessions Context merge (standard kit visibility).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { UsageLedgerController } from './controller.ts'
import type { UsageLedgerRemoteFace } from './controller.ts'
import { UsageSection } from './UsageSection.tsx'
import type { UsageSectionInjected } from './slots.ts'
import { en, zh, type UsageKey } from './locales.ts'

export type { UsageLedgerController, UsageLedgerRemoteFace } from './controller.ts'
export type { UsageSectionProps } from './UsageSection.tsx'
export type { UsageSectionInjected } from './slots.ts'
export type { UsageKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The usage view copy. */
    'usage': UsageKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'usage'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'remote', 'remote.usageLedger']

/**
 * Register the Usage view tab. The ledger loads lazily when the tab first
 * renders and converges on pushed changes.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-usage: copy dictionaries')

  const t = ctx.locale.bind(NS)
  const remote: UsageLedgerRemoteFace = ctx.remote.usageLedger
  const controller = new UsageLedgerController(remote)
  const injected = (): UsageSectionInjected => ({ hooks: { usage: controller.store }, ensure: () => controller.ensure() })

  // Pushed invalidations converge only what was read; a cold ledger stays
  // cold until the view first renders.
  ctx.effect(() => {
    const disposers = [
      ctx.remote.$on('usage-ledger/changed', () => {
        if (!controller.cold) void controller.resync()
      }),
      ctx.on('connection/reset', () => {
        if (!controller.cold) void controller.resync()
      }),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-usage: pushed invalidations')

  // order 20 sits the tab right of Trajectory (order 10) in the header strip.
  // The usage ledger is user-level, so the injected face ignores the seat's
  // per-session binding.
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'usage',
    order: 20,
    label: () => t('view.usage'),
    locale: NS,
    inject: injected,
  }, UsageSection))
}
