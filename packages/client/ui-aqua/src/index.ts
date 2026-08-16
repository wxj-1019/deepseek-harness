/** Host registration: durable ui-aqua section, /backgrounds routes, and the boot glass style. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-attachment'
import { assertTrustedAuthority } from '@deepseek-ai/dsh-client-connection/trust'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  AQUA_DEFAULTS, AQUA_SETTINGS_NAMESPACE, AquaSectionSchema, aquaBootCss, aquaBootScript,
  type AquaSection,
} from './aqua-settings.ts'
import { CURRENT_PATH, handleCurrentWallpaper, handleWallpaperUpload } from './http.ts'

export {
  AQUA_ATTRIBUTE, AQUA_DEFAULTS, AQUA_MODES, AQUA_SETTINGS_NAMESPACE, AQUA_TOKEN_OVERRIDES,
  COMPAT_TOKEN_OVERRIDES, AquaSectionSchema, isVideoRef,
  type AquaSection, type WallpaperImageRef, type WallpaperRef, type WallpaperVideoRef,
} from './aqua-settings.ts'

const NAMESPACE = settingsNamespace(AQUA_SETTINGS_NAMESPACE)

/** Host-row config: the deployment's serving authorities for the route fence. */
export interface AquaHostConfig {
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
function readSection(ctx: Context): AquaSection {
  const settings = ctx.get('settings')
  if (settings === undefined) return AQUA_DEFAULTS
  return (settings.get(NAMESPACE) as AquaSection | undefined) ?? AQUA_DEFAULTS
}

/**
 * Register the durable ui-aqua section, the /backgrounds route, and the boot
 * glass transform when their optional Host services are composed.
 * @param ctx - Host context that may acquire settings, attachments, and HTTP services.
 * @param config - host-row config; an invalid `trustedHosts` entry fails the load.
 */
export function apply(ctx: Context, config?: AquaHostConfig): void {
  // Config boundary: a malformed entry fails the load loudly here rather than
  // silently authorizing its hostname prefix at request time.
  const trustedHosts = config?.trustedHosts ?? []
  for (const entry of trustedHosts) assertTrustedAuthority(entry)
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(NAMESPACE, AquaSectionSchema)
  })
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => httpCtx.webServer.tapIndex((html) => {
        const section = readSection(httpCtx)
        if (!section.enabled) return html
        const style = `<style>${aquaBootCss(section)}</style>`
        const script = `<script>${aquaBootScript(section)}</script>`
        const head = /<\/head\s*>/i.exec(html)
        if (head === null) return `${html}${style}${script}`
        const at = head.index
        return `${html.slice(0, at)}${style}${script}${html.slice(at)}`
      }),
      'client-ui-aqua: boot glass',
    )
  })
  ctx.inject(['webServer', 'attachments', 'settings'], (routeCtx) => {
    const deps = {
      attachments: routeCtx.attachments,
      settings: routeCtx.settings,
    }
    routeCtx.effect(() => routeCtx.webServer.register({
      kind: 'prefix',
      path: '/backgrounds',
      handler: (req, res) => {
        /* v8 ignore next -- `?? '/'` arm: node:http always sets url on server requests. */
        const path = new URL(req.url ?? '/', 'http://x').pathname
        if (req.method === 'POST' && path === '/backgrounds') return handleWallpaperUpload(req, res, deps)
        if ((req.method === 'GET' || req.method === 'HEAD') && path === CURRENT_PATH) {
          return handleCurrentWallpaper(req, res, deps)
        }
        res.writeHead(404)
        res.end()
      },
    }), 'client-ui-aqua: /backgrounds route')
  })
}
