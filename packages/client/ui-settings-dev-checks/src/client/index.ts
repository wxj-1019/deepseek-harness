/**
 * Dev-checks settings plugin, browser half. It registers the "开发校验 /
 * Dev checks" settings section: six per-machine switches over the
 * `dev-checks` namespace that narrow the heavy routine quality gates
 * (e2e, coverage, snapshot, doc-sync, pre-push typecheck) on this machine;
 * CI never consults them. Reads and writes ride the settingsScope transport.
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry)
// and the ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { DevChecksSection } from './DevChecksSection.tsx'
import type { DevChecksSectionInjected } from './DevChecksSection.tsx'
import { en, zh, type DevChecksKey } from './locales.ts'
import { DEV_CHECKS_SETTINGS_NAMESPACE, type DevChecksSettings } from '../dev-checks-settings.ts'

export type { DevChecksSectionInjected, DevChecksSectionProps } from './DevChecksSection.tsx'
export type { DevChecksKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The dev-checks settings page copy. */
    'settings.devChecks': DevChecksKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.devChecks'

/**
 * Required services (cordis fiber inject): slots and locale for the section
 * registration, settingsScope for the transport, and connection/remote which
 * the bound scope reads through the caller's context.
 */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * Register the dev-checks section once the `settings.section` declaration is
 * on the ledger; the bound scope keeps the page fresh on pushed settings
 * invalidations.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-dev-checks: copy dictionaries')

  const scope = ctx.settingsScope.bind<DevChecksSettings>({ namespace: DEV_CHECKS_SETTINGS_NAMESPACE })
  // Registration-time text (the nav label thunk) and the inject face share
  // one bound translate; copy freshness rides the locale revision.
  const t = ctx.locale.bind(NS) as DevChecksSectionInjected['t']
  const injected = (): DevChecksSectionInjected => ({ scope, t })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'dev-checks',
    order: 12,
    label: () => t('nav'),
    inject: injected,
  }, DevChecksSection))
}
