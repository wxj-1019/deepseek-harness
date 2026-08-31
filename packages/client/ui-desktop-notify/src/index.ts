/**
 * Host registration for the desktop-notify plugin: the durable
 * `ui-desktop-notify` namespace the General settings row edits.
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.slots declaration merge (the slot registry service).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-settings'
import { DESKTOP_NOTIFY_SETTINGS_NAMESPACE, DesktopNotifySettingsSchema } from './desktop-notify-settings.ts'
// Type-only: pulls the ctx.slots declaration merge (the slot registry service).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

export {
  DESKTOP_NOTIFY_SETTINGS_DEFAULTS,
  DESKTOP_NOTIFY_SETTINGS_NAMESPACE,
  DesktopNotifySettingsSchema,
  type DesktopNotifySettings,
} from './desktop-notify-settings.ts'

const NAMESPACE = DESKTOP_NOTIFY_SETTINGS_NAMESPACE

/**
 * Register the durable desktop-notify namespace when the settings service is composed.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(NAMESPACE, DesktopNotifySettingsSchema)
  })
}
