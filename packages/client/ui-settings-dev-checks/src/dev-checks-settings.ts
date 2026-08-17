/**
 * Dev-checks preferences shared by the Host registration and the browser
 * settings page: the `dev-checks` namespace, its six per-machine local
 * quality-gate switches, and the shipped all-on defaults. The repo-side
 * reader (scripts/dev-checks.ts) consumes the same settings document;
 * scripts/dev-checks.spec.ts locks the two key inventories together so a
 * web-UI switch can never stop reaching the scripts that honor it.
 */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by this plugin (the Host brands it at registration). */
export const DEV_CHECKS_SETTINGS_NAMESPACE = 'dev-checks'

/** Durable dev-checks section: one switch per heavy routine quality gate. */
export interface DevChecksSettings {
  /** `pnpm run test:e2e` — the real-API suite. */
  e2e: boolean
  /** `pnpm run test:coverage` — the instrumented full unit run. */
  coverage: boolean
  /** `pnpm run test:snapshot` — the keyless transcript replay. */
  snapshot: boolean
  /** `pnpm run doc-sync` — the documentation gate aggregate. */
  docSync: boolean
  /** Agent-selected build, hygiene, and built-artifact smokes (advisory only; the scripts stay unguarded). */
  buildHygiene: boolean
  /** The lefthook pre-push typecheck. */
  prePushTypecheck: boolean
}

/** Shipped defaults: every gate runs. CI never consults this section. */
export const DEV_CHECKS_SETTINGS_DEFAULTS: DevChecksSettings = {
  e2e: true,
  coverage: true,
  snapshot: true,
  docSync: true,
  buildHygiene: true,
  prePushTypecheck: true,
}

/** Durable section schema; also the wire envelope the browser scope validates against. */
export const DevChecksSettingsSchema: z<DevChecksSettings> = z.object({
  e2e: z.boolean().default(true),
  coverage: z.boolean().default(true),
  snapshot: z.boolean().default(true),
  docSync: z.boolean().default(true),
  buildHygiene: z.boolean().default(true),
  prePushTypecheck: z.boolean().default(true),
})
