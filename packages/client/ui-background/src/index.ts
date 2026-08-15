/** Host registration: durable background section, /backgrounds routes, boot backdrop style. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-attachment'
import { assertTrustedAuthority } from '@deepseek-ai/dsh-client-connection/trust'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { injectBootBackground } from './boot-background.ts'
import { handleBackgroundUpload, handleCurrentBackground } from './http.ts'
import {
  BACKGROUND_SETTINGS_NAMESPACE, BACKGROUND_UPLOAD_PATH, BACKDROP_IMAGE_URL, BackgroundSettingsSchema,
  DEFAULT_BACKGROUND, type BackgroundSettings,
} from './background-settings.ts'

export {
  BACKGROUND_IMAGE_MEDIA_TYPES, BACKGROUND_PREFERENCES, BACKGROUND_PRESETS, BACKGROUND_SETTINGS_NAMESPACE,
  BACKGROUND_UPLOAD_PATH, BACKDROP_IMAGE_URL, DEFAULT_BACKGROUND, DEFAULT_DIMMING,
  BackgroundSettingsSchema, resolveBackdrop,
  type BackgroundImageRef, type BackgroundPreset, type BackgroundSettings, type BackdropResolution,
} from './background-settings.ts'

const NAMESPACE = settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE)

/** Host-row config: the deployment's serving authorities for the route fence. */
export interface BackgroundHostConfig {
  /**
   * Non-loopback authorities this deployment serves, exactly the /api trust
   * fence's list (a composition derives it the same way, e.g.
   * `!!js ctx.webRuntime.trustedHosts`). Absent means loopback-only, the safe
   * standalone default; an entry that is not a bare `host[:port]` authority
   * fails the plugin load.
   */
  trustedHosts?: string[]
}

/** Read the registered section or the default without a settings provider. */
function readSection(ctx: Context): BackgroundSettings {
  const settings = ctx.get('settings')
  if (settings === undefined) return DEFAULT_BACKGROUND
  return (settings.get(NAMESPACE) as BackgroundSettings | undefined) ?? DEFAULT_BACKGROUND
}

/**
 * Register the durable background section, the /backgrounds route, and the
 * boot backdrop transform when their optional Host services are composed.
 * @param ctx - Host context that may acquire settings, attachments, and HTTP services.
 * @param config - host-row config; an invalid `trustedHosts` entry fails the load.
 */
export function apply(ctx: Context, config?: BackgroundHostConfig): void {
  // Config boundary: a malformed entry fails the load loudly here rather than
  // silently authorizing its hostname prefix at request time.
  const trustedHosts = config?.trustedHosts ?? []
  for (const entry of trustedHosts) assertTrustedAuthority(entry)
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(NAMESPACE, BackgroundSettingsSchema)
  })
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => httpCtx.webServer.tapIndex(html => injectBootBackground(html, readSection(httpCtx))),
      'client-ui-background: boot backdrop',
    )
  })
  ctx.inject(['webServer', 'attachments', 'settings'], (routeCtx) => {
    const deps = {
      attachments: routeCtx.attachments,
      settings: routeCtx.settings,
      trustedHosts,
    }
    routeCtx.effect(() => routeCtx.webServer.register({
      kind: 'prefix',
      path: BACKGROUND_UPLOAD_PATH,
      handler: (req, res) => {
        /* v8 ignore next -- `?? '/'` arm: node:http always sets url on server requests. */
        const path = new URL(req.url ?? '/', 'http://x').pathname
        if (req.method === 'POST' && path === BACKGROUND_UPLOAD_PATH) return handleBackgroundUpload(req, res, deps)
        if ((req.method === 'GET' || req.method === 'HEAD') && path === BACKDROP_IMAGE_URL) {
          return handleCurrentBackground(req, res, deps)
        }
        res.writeHead(404)
        res.end()
      },
    }), 'client-ui-background: /backgrounds route')
  })
}
