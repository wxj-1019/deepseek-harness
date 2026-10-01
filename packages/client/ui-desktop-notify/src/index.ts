/**
 * Host registration for the desktop-notify plugin: the durable
 * `ui-desktop-notify` entry the General settings row edits.
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.slots declaration merge (the slot registry service).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the `settings` service Context merge (the page-policy declaration).
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { ENABLED_FIELD } from './desktop-notify-settings.ts'
// Type-only: pulls the ctx.slots declaration merge (the slot registry service).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

export {
  DESKTOP_NOTIFY_SETTINGS_DEFAULTS,
  DESKTOP_NOTIFY_SETTINGS_NAMESPACE,
  DesktopNotifySettingsSchema,
  type DesktopNotifySettings,
} from './desktop-notify-settings.ts'

/** Durable desktop-notify preference, editable live from the General settings row. */
export interface Config {
  /** Whether a system desktop notification fires when a task completes. */
  enabled: Volatile<boolean>
}

/** Runtime schema for {@link Config}. */
export const Config = z.object({
  [ENABLED_FIELD]: z.boolean().default(false).volatile(),
})

/**
 * Serve the durable desktop-notify namespace through this entry's volatile
 * Config when the settings service is composed; the package ships its own
 * General row, so the generated page stays off.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
