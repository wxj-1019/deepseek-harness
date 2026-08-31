/**
 * Host registration for the dev-checks settings plugin: the durable
 * `dev-checks` namespace the web "Dev checks" page edits and the repo-side
 * gate wrapper (scripts/dev-check-run.ts) reads from the same settings
 * document.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { DEV_CHECKS_SETTINGS_NAMESPACE, DevChecksSettingsSchema } from './dev-checks-settings.ts'

export {
  DEV_CHECKS_SETTINGS_DEFAULTS,
  DEV_CHECKS_SETTINGS_NAMESPACE,
  DevChecksSettingsSchema,
  type DevChecksSettings,
} from './dev-checks-settings.ts'

const NAMESPACE = DEV_CHECKS_SETTINGS_NAMESPACE

/**
 * Register the durable dev-checks namespace when the settings service is composed.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  // Type-only: pulls the settings service Context merge.
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(NAMESPACE, DevChecksSettingsSchema)
  })
}
