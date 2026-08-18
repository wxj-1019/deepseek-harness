/** Desktop-notification preference stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the desktop-notify plugin. */
export const DESKTOP_NOTIFY_SETTINGS_NAMESPACE = 'ui-desktop-notify'

/** Field carrying the completion-notification opt-in. */
export const ENABLED_FIELD = 'enabled'

/** Durable desktop-notify section shared by the Host schema and the browser scope. */
export interface DesktopNotifySettings {
  /** Whether a system desktop notification fires when a task completes. */
  enabled: boolean
}

/** Default off: the OS permission prompt must never surprise. */
export const DESKTOP_NOTIFY_SETTINGS_DEFAULTS: DesktopNotifySettings = { enabled: false }

/** Durable desktop-notify schema; also the wire envelope the browser scope validates against. */
export const DesktopNotifySettingsSchema: z<DesktopNotifySettings> = z.object({
  [ENABLED_FIELD]: z.boolean().default(false),
})
