/**
 * Host registration for the dev-checks settings plugin: the durable
 * `dev-checks` entry the web "Dev checks" page edits and the repo-side
 * gate wrapper (scripts/dev-check-run.ts) reads from the same settings
 * document.
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
// Type-only: the `settings` service Context merge (the page-policy declaration).
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

export {
  DEV_CHECKS_SETTINGS_DEFAULTS,
  DEV_CHECKS_SETTINGS_NAMESPACE,
  DevChecksSettingsSchema,
  type DevChecksSettings,
} from './dev-checks-settings.ts'

/** Per-machine quality-gate switches, each editable live from the settings page. */
export interface Config {
  /** `pnpm run test:e2e` — the real-API suite. */
  e2e: Volatile<boolean>
  /** `pnpm run test:coverage` — the instrumented full unit run. */
  coverage: Volatile<boolean>
  /** `pnpm run test:snapshot` — the keyless transcript replay. */
  snapshot: Volatile<boolean>
  /** `pnpm run doc-sync` — the documentation gate aggregate. */
  docSync: Volatile<boolean>
  /** Agent-selected build, hygiene, and built-artifact smokes (advisory only; the scripts stay unguarded). */
  buildHygiene: Volatile<boolean>
  /** The lefthook pre-push typecheck. */
  prePushTypecheck: Volatile<boolean>
}

/** Runtime schema for {@link Config}; every switch edits live. */
export const Config = z.object({
  e2e: z.boolean().default(true).volatile(),
  coverage: z.boolean().default(true).volatile(),
  snapshot: z.boolean().default(true).volatile(),
  docSync: z.boolean().default(true).volatile(),
  buildHygiene: z.boolean().default(true).volatile(),
  prePushTypecheck: z.boolean().default(true).volatile(),
})

/**
 * Serve the durable dev-checks namespace through this entry's volatile Config
 * when the settings service is composed; the package ships its own settings
 * page, so the generated page stays off.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
