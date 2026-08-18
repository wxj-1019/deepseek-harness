/**
 * Desktop-notification plugin, browser half: the General settings row (the
 * opt-in and its permission flow) and the completion watcher over the session
 * list. The data arrives entirely through the `sessions.list` snapshot feed
 * and the bound settings scope, so the plugin issues no RPC of its own.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  DesktopNotifyRuntime,
  browserNotifyPort,
  documentHidden,
  focusWindow,
  notificationPermission,
  requestNotificationPermission,
} from './desktop-notify.ts'
import { NotificationRow } from './NotificationRow.tsx'
import type { NotificationRowInjected } from './NotificationRow.tsx'
import { DESKTOP_NOTIFY_SETTINGS_NAMESPACE, type DesktopNotifySettings } from '../desktop-notify-settings.ts'
import { en, NS, zh, type DesktopNotifyKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Desktop-notification settings row copy. */
    'settings.desktopNotify': DesktopNotifyKey
  }
}

/** Required services: the list feed, the slot and locale registries, and the settings scope. */
export const inject = ['sessions', 'slots', 'locale', 'settingsScope']

/**
 * Client plugin body: register the dictionaries, the completion watcher, and
 * the General settings row.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-desktop-notify: settings row dictionaries')

  const runtime = new DesktopNotifyRuntime({
    sessions: ctx.sessions,
    scope: ctx.settingsScope.bind<DesktopNotifySettings>({ namespace: DESKTOP_NOTIFY_SETTINGS_NAMESPACE }),
    notify: browserNotifyPort(),
    bodyText: () => t('body'),
    isHidden: documentHidden,
    focusWindow,
  })
  ctx.effect(() => runtime.start(), 'ui-desktop-notify: completion watcher')

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'desktop-notify',
    order: 30,
    locale: NS,
    inject: (): NotificationRowInjected => ({
      hooks: { enabled: runtime.enabled, editable: runtime.editable },
      setEnabled: (next) => { runtime.setEnabled(next) },
      permission: notificationPermission,
      requestPermission: requestNotificationPermission,
    }),
  }, NotificationRow))
}
