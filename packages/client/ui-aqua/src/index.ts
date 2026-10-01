/** Host registration: durable ui-aqua section, /backgrounds routes, and the boot glass style. */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-attachment'
// Type-only: the `settings` service Context merge (the page-policy declaration).
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { assertTrustedAuthority } from '@deepseek-ai/dsh-client-connection/trust'
import {
  AQUA_BACKGROUNDS, AQUA_DEFAULTS, AQUA_MODES,
  WallpaperRefSchema, aquaBootCss, aquaBootScript,
  type AquaSection, type WallpaperRef,
} from './aqua-settings.ts'
import { CURRENT_PATH, handleCurrentWallpaper, handleWallpaperUpload } from './http.ts'

export {
  AQUA_ATTRIBUTE, AQUA_DEFAULTS, AQUA_MODES, AQUA_SETTINGS_NAMESPACE, AQUA_TOKEN_OVERRIDES,
  COMPAT_TOKEN_OVERRIDES, AquaSectionSchema, isVideoRef,
  type AquaSection, type WallpaperImageRef, type WallpaperRef, type WallpaperVideoRef,
} from './aqua-settings.ts'

/**
 * Host plugin Config: the deployment's serving authorities for the route
 * fence (restart-level) plus the durable glass section, every knob editable
 * live from the settings surfaces.
 */
export interface Config {
  /**
   * Non-loopback authorities this deployment serves, exactly the /api trust
   * fence's list (a composition derives it the same way, e.g.
   * `!!js ctx.webRuntime.trustedHosts`). Empty means loopback-only, the safe
   * standalone default; an entry that is not a bare `host[:port]` authority
   * fails the plugin load.
   */
  trustedHosts: string[]
  /** Master switch: off retracts every layer-owned effect. */
  enabled: Volatile<boolean>
  /** Rendering mode. */
  mode: Volatile<AquaSection['mode']>
  /** Glass backdrop blur radius, px. */
  blur: Volatile<number>
  /** Glass fill opacity, 0-100. */
  frost: Volatile<number>
  /** Fluid hue, degrees. */
  fluidHue: Volatile<number>
  /** Fluid depth, 0-100. */
  fluidDepth: Volatile<number>
  /** Background brightness, 0-100. */
  bgBrightness: Volatile<number>
  /** Backdrop source. */
  background: Volatile<AquaSection['background']>
  /** Stored wallpaper reference; absent while the fluid board owns the backdrop. */
  wallpaper: Volatile<WallpaperRef | undefined>
  /** Particle whale in the chat area center. */
  whale: Volatile<boolean>
  /** Ambient marine life. */
  critters: Volatile<boolean>
  /** Interactive mesh. */
  mesh: Volatile<boolean>
  /** Cursor spotlight glow. */
  spotlight: Volatile<boolean>
  /** Hover press-down. */
  press: Volatile<boolean>
  /** Wallpaper blur radius, px. */
  wallpaperBlur: Volatile<number>
  /** Wallpaper frost veil, 0-100. */
  wallpaperFrost: Volatile<number>
  /** Video wallpaper blur radius, px. */
  videoBlur: Volatile<number>
  /** Video wallpaper brightness, 0-100. */
  videoBrightness: Volatile<number>
}

/** Runtime schema for {@link Config}; the section knobs edit live. */
export const Config = z.object({
  trustedHosts: z.array(z.string()).default([]),
  enabled: z.boolean().default(true).volatile(),
  mode: z.union([...AQUA_MODES]).default('mica').volatile(),
  blur: z.number().step(1).min(0).max(40).default(AQUA_DEFAULTS.blur).volatile(),
  frost: z.number().step(1).min(0).max(100).default(AQUA_DEFAULTS.frost).volatile(),
  fluidHue: z.number().min(0).max(360).default(AQUA_DEFAULTS.fluidHue).volatile(),
  fluidDepth: z.number().step(1).min(0).max(100).default(AQUA_DEFAULTS.fluidDepth).volatile(),
  bgBrightness: z.number().step(1).min(0).max(100).default(AQUA_DEFAULTS.bgBrightness).volatile(),
  background: z.union([...AQUA_BACKGROUNDS]).default('fluid').volatile(),
  wallpaper: WallpaperRefSchema.required(false).volatile(),
  whale: z.boolean().default(true).volatile(),
  critters: z.boolean().default(true).volatile(),
  mesh: z.boolean().default(true).volatile(),
  spotlight: z.boolean().default(true).volatile(),
  press: z.boolean().default(true).volatile(),
  wallpaperBlur: z.number().step(1).min(0).max(40).default(AQUA_DEFAULTS.wallpaperBlur).volatile(),
  wallpaperFrost: z.number().step(1).min(0).max(100).default(AQUA_DEFAULTS.wallpaperFrost).volatile(),
  videoBlur: z.number().step(1).min(0).max(40).default(AQUA_DEFAULTS.videoBlur).volatile(),
  videoBrightness: z.number().step(1).min(0).max(100).default(AQUA_DEFAULTS.videoBrightness).volatile(),
})

/** Read the live section off the volatile Config references. */
function readSection(config: Config): AquaSection {
  const wallpaper = config.wallpaper.get()
  return {
    enabled: config.enabled.get(),
    mode: config.mode.get(),
    blur: config.blur.get(),
    frost: config.frost.get(),
    fluidHue: config.fluidHue.get(),
    fluidDepth: config.fluidDepth.get(),
    bgBrightness: config.bgBrightness.get(),
    background: config.background.get(),
    ...wallpaper !== undefined ? { wallpaper } : {},
    whale: config.whale.get(),
    critters: config.critters.get(),
    mesh: config.mesh.get(),
    spotlight: config.spotlight.get(),
    press: config.press.get(),
    wallpaperBlur: config.wallpaperBlur.get(),
    wallpaperFrost: config.wallpaperFrost.get(),
    videoBlur: config.videoBlur.get(),
    videoBrightness: config.videoBrightness.get(),
  }
}

/**
 * Register the durable ui-aqua section, the /backgrounds route, and the boot
 * glass transform when their optional Host services are composed.
 * @param ctx - Host context that may acquire settings, attachments, and HTTP services.
 * @param config - resolved entry Config; an invalid `trustedHosts` entry fails the load.
 */
export function apply(ctx: Context, config: Config): void {
  // Config boundary: a malformed entry fails the load loudly here rather than
  // silently authorizing its hostname prefix at request time.
  for (const entry of config.trustedHosts) assertTrustedAuthority(entry)
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => httpCtx.webServer.tapIndex((html) => {
        const section = readSection(config)
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
  ctx.inject(['webServer', 'attachments'], (routeCtx) => {
    const deps = {
      attachments: routeCtx.attachments,
      readSection: () => readSection(config),
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
