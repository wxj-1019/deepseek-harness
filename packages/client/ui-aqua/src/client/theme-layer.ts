/**
 * Aqua theme layer: one toggleable visual skin over the whole Web surface.
 * Everything this layer owns is an effect — token overrides ride the theme
 * service's override stack, the CSS hooks ride a `data-dsh-aqua` attribute on
 * <html> (the stylesheet only applies under it), the ambient scene and page
 * fades are mounted/removed with the layer — so switching the section's
 * enable flag off (or unloading the plugin) restores the stock UI exactly:
 * no residue, no reload.
 *
 * The layer is a pure applier: the durable `ui-aqua` section arrives from
 * the runtime (settings-scope adoption), and this file never reads or writes
 * storage. Wallpapers render from the `/backgrounds/current` route address
 * of the section's stored reference, so no media bytes live in the browser.
 */
import type { Context } from '@deepseek-ai/cordis'
import {
  AQUA_TOKEN_OVERRIDES, COMPAT_TOKEN_OVERRIDES, OVERRIDE_SOURCE, WALLPAPER_URL,
  isVideoRef, type AquaSection, type WallpaperRef,
} from '../aqua-settings.ts'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ensureAmbientScene, removeAmbientScene, ensurePageFades, removePageFades } from './critters.ts'
import { attachFluidShader, SITE_FLUID_PARAMS, type FluidParams, type FluidShaderHandle } from './fluid-shader.ts'
import { fluidToneColors, HUE_BASE } from './fluid-tones.ts'
import { attachFluidInteractions } from './fluid-interactions.ts'
import { startSeamStamper } from './seam-stamper.ts'
import { mountWhale, type WhaleHandle } from './whale.ts'
import { mountMesh, type MeshHandle } from './mesh.ts'
import { startSpotlight, SPOTLIGHT_ATTRIBUTE, PRESS_ATTRIBUTE } from './spotlight.ts'

/** The layer's identity on <html>: re-exported so the boot transform's twin stays one import away. */
export { AQUA_ATTRIBUTE } from '../aqua-settings.ts'

/** Served wallpaper address for one reference (the content address busts the cache on switch). */
function wallpaperSrc(ref: WallpaperRef): string {
  return `${WALLPAPER_URL}?v=${ref.attachmentId}`
}

/** Current scheme from the presenter-owned body attribute. */
function activeScheme(): 'light' | 'dark' {
  return document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
}

/**
 * Owns the Aqua layer lifecycle: applies or retracts every owned effect for
 * one durable section. Every subscription and mounted effect is released when
 * the plugin fiber is disposed; repeated {@link AquaLayer.apply} calls with
 * the same section are idempotent (the wallpaper elements only reload when
 * the stored reference actually changes).
 */
export class AquaLayer {
  private enabled = false
  private section: AquaSection | undefined
  /** Resolved palette scheme: dark = the brightness knob darkens, light = it brightens. */
  private dark = false
  private tokenDisposer: (() => void) | undefined
  private mainFluid: FluidShaderHandle | undefined
  private interactionDisposer: (() => void) | undefined
  private themeListener: (() => void) | undefined
  private seamDisposer: (() => void) | undefined
  private spotlightDisposer: (() => void) | undefined
  private whaleHandle: WhaleHandle | undefined
  private meshHandle: MeshHandle | undefined
  private readonly ctx: Context

  /**
   * @param ctx - owning client context.
   */
  constructor(ctx: Context) {
    this.ctx = ctx
    ctx.effect(() => {
      // Follow the Appearance switch: the brightness knob's half-range and
      // the overlay direction flip with the resolved scheme (`system` follows
      // the OS). Runs even while disabled so the settings row stays correct.
      this.themeListener = this.ctx.on('theme/change', () => {
        this.dark = this.resolveScheme()
        this.whaleHandle?.setDark(this.dark)
        if (this.enabled && this.section !== undefined) {
          this.applySettings(this.section)
          this.applyFluidPalettes(this.section)
        }
      })
      return () => {
        this.themeListener?.()
        this.themeListener = undefined
        this.unmount()
      }
    }, 'ui-aqua: layer lifecycle')
    this.dark = this.resolveScheme()
  }

  /**
   * Whether the resolved palette is dark (the brightness knob darkens).
   * @returns the resolved scheme is dark.
   */
  getDark(): boolean {
    return this.dark
  }

  /** Resolved scheme from the theme service (falls back to the body attribute). */
  private resolveScheme(): boolean {
    try {
      return this.ctx.theme.getTheme().active.colorScheme === 'dark'
    } catch {
      return activeScheme() === 'dark'
    }
  }

  /**
   * Apply one durable section: mount or retract the layer, then repaint every
   * knob-driven surface. The runtime calls this on every adoption and write.
   * @param section - durable section (defaults already applied).
   */
  apply(section: AquaSection): void {
    this.section = section
    if (!section.enabled) {
      this.enabled = false
      this.unmount()
      return
    }
    const wasEnabled = this.enabled
    this.enabled = true
    if (!wasEnabled) this.mount()
    this.applySettings(section)
    this.applyTokens(section)
    this.applyFluidPalettes(section)
    this.syncWhale(section)
    this.syncMesh(section)
  }

  /** Write the knob-driven CSS variables and mode attributes onto <html>. */
  private applySettings(section: AquaSection): void {
    const style = document.documentElement.style
    style.setProperty('--dsh-aqua-blur', `${section.blur}px`)
    // Frost 0-100 → a 0-1.4 alpha multiplier (50 = 1x). Capped so max frost
    // stays translucent frosted glass instead of collapsing to a solid
    // opaque slab (the dark card would otherwise hit 100% and read as solid
    // navy).
    style.setProperty('--dsh-aqua-frost', String(Math.min(section.frost / 50, 1.4)))
    // The new-session button's frost rides the same knob, +20 points.
    style.setProperty('--dsh-aqua-surface-frost', String(Math.min((section.frost + 20) / 50, 1.4)))
    // The cursor glow follows the fluid tone — same hue as the bloom stops,
    // so 色调 320 glows the same cyan-blue as the water.
    const glowHue = ((section.fluidHue + HUE_BASE) % 360 + 360) % 360
    style.setProperty('--dsh-aqua-spot-color', this.dark
      ? `hsla(${glowHue}, 90%, 62%, 0.17)`
      : `hsla(${glowHue}, 90%, 45%, 0.16)`)
    style.setProperty('--dsh-aqua-wallpaper-blur', `${section.wallpaperBlur}px`)
    style.setProperty('--dsh-aqua-wallpaper-frost', String(section.wallpaperFrost / 100))
    // Video wallpaper: blur rides the video's own filter; brightness drives
    // the scrim veil's alpha (100 = fully lit / no veil, 0 = deepest dim,
    // capped at 0.65 so the film never goes fully black).
    style.setProperty('--dsh-aqua-video-blur', `${section.videoBlur}px`)
    style.setProperty('--dsh-aqua-video-dim', String(((100 - section.videoBrightness) / 100) * 0.65))
    // Background brightness: dark mode darkens (0 = pure black, 50 = off),
    // light mode brightens (50 = off, 100 = pure white) — the knob's range
    // and the overlay direction both follow the resolved scheme.
    const dark = this.dark
    style.setProperty('--dsh-aqua-brightness-black', String(dark ? Math.max(0, (50 - section.bgBrightness) / 50) : 0))
    style.setProperty('--dsh-aqua-brightness-white', String(dark ? 0 : Math.max(0, (section.bgBrightness - 50) / 50)))

    // Rendering mode: the float rules key off data-dsh-float; the compat
    // (generic glass) rules key off data-dsh-compat.
    const compat = section.mode === 'compat'
    document.documentElement.toggleAttribute('data-dsh-float', !compat)
    document.documentElement.toggleAttribute('data-dsh-compat', compat)

    // Cursor spotlight and hover press ride the floating glass only —
    // compat keeps the stock layout, so neither effect applies there.
    document.documentElement.toggleAttribute(SPOTLIGHT_ATTRIBUTE, !compat && section.spotlight)
    document.documentElement.toggleAttribute(PRESS_ATTRIBUTE, !compat && section.press)

    // Backdrop source: flip the ambient container between fluid and wallpaper.
    const ambient = document.querySelector<HTMLElement>('[data-dsh-aqua-ambient]')
    if (ambient !== null) ambient.dataset.background = section.background
    if (ambient !== null) ambient.dataset.critters = section.critters ? 'on' : 'off'
    // The wallpaper is one stored reference served by /backgrounds/current;
    // the media kind selects the <img> or the <video> surface.
    const wallpaper = section.wallpaper
    const isVideo = wallpaper !== undefined && isVideoRef(wallpaper)
    const wallpaperLayer = document.querySelector<HTMLElement>('[data-dsh-aqua-wallpaper-layer]')
    if (wallpaperLayer !== null) {
      wallpaperLayer.dataset.background = section.background
      wallpaperLayer.dataset.media = isVideo ? 'video' : 'image'
    }
    // Mirror the wallpaper state onto <html> so the stylesheet can scope
    // video-mode readability rules (bubble plates) without touching the app.
    const wallpaperOn = section.background === 'wallpaper' && wallpaper !== undefined
    document.documentElement.toggleAttribute('data-dsh-aqua-wallpaper', wallpaperOn)
    if (wallpaperOn) {
      document.documentElement.setAttribute('data-dsh-aqua-media', isVideo ? 'video' : 'image')
    } else {
      document.documentElement.removeAttribute('data-dsh-aqua-media')
    }
    const img = document.querySelector<HTMLImageElement>('[data-dsh-aqua-wallpaper-img]')
    if (img !== null) {
      const src = section.background === 'wallpaper' && wallpaper !== undefined && !isVideo
        ? wallpaperSrc(wallpaper)
        : null
      // Re-assigning the same src would restart decoding; only a reference
      // switch (the query changes) may touch the attribute.
      if (src === null) img.removeAttribute('src')
      else if (img.getAttribute('src') !== src) img.src = src
    }
    const video = document.querySelector<HTMLVideoElement>('[data-dsh-aqua-wallpaper-video]')
    if (video !== null) {
      if (section.background === 'wallpaper' && wallpaper !== undefined && isVideo) {
        const src = wallpaperSrc(wallpaper)
        if (video.getAttribute('src') !== src) {
          video.setAttribute('src', src)
          this.configureWallpaperVideo(video)
        }
      } else {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
    }
  }

  /** The wallpaper plays as a plain <video> element (the browser's own
   *  decoder, no player chrome at all): looping on, cover fill via CSS, and
   *  autoplay with a muted fallback where policy requires it. A direct
   *  element (not an iframe) keeps backdrop-filter working over it, so the
   *  glass panels stay frosted above the video. */
  private configureWallpaperVideo(video: HTMLVideoElement): void {
    video.loop = true
    if (!video.paused) return
    void video.play().catch(() => {
      // Autoplay policy blocked unmuted playback — mute and retry.
      video.muted = true
      void video.play().catch(() => { /* ignore */ })
    })
  }

  /** Apply the mode's token layer (floating palette, or translucent compat). */
  private applyTokens(section: AquaSection): void {
    this.tokenDisposer?.()
    this.tokenDisposer = this.ctx.theme.overrideTokens(
      OVERRIDE_SOURCE,
      section.mode === 'compat' ? COMPAT_TOKEN_OVERRIDES : AQUA_TOKEN_OVERRIDES,
    )
  }

  private mount(): void {
    document.documentElement.setAttribute('data-dsh-aqua', '')
    ensureAmbientScene()
    ensurePageFades()
    this.mountFluid()
    this.startSeamStamper()
    this.startSpotlightFeed()
  }

  /** Mount or drop the particle whale to match enabled + the whale flag. */
  private syncWhale(section: AquaSection): void {
    if (this.enabled && section.whale) {
      if (this.whaleHandle !== undefined) return
      const ambient = document.querySelector<HTMLElement>('[data-dsh-aqua-ambient]')
      if (ambient === null) return
      this.whaleHandle = mountWhale(ambient, this.dark)
    } else {
      this.whaleHandle?.dispose()
      this.whaleHandle = undefined
    }
  }

  /** Mount or drop the interactive mesh to match enabled + the mesh flag. */
  private syncMesh(section: AquaSection): void {
    if (this.enabled && section.mesh) {
      if (this.meshHandle !== undefined) return
      const ambient = document.querySelector<HTMLElement>('[data-dsh-aqua-ambient]')
      if (ambient === null) return
      this.meshHandle = mountMesh(ambient)
    } else {
      this.meshHandle?.dispose()
      this.meshHandle = undefined
    }
  }

  private unmount(): void {
    document.documentElement.removeAttribute('data-dsh-aqua')
    document.documentElement.removeAttribute('data-dsh-float')
    document.documentElement.removeAttribute('data-dsh-compat')
    document.documentElement.removeAttribute('data-dsh-aqua-wallpaper')
    document.documentElement.removeAttribute('data-dsh-aqua-media')
    document.documentElement.removeAttribute(SPOTLIGHT_ATTRIBUTE)
    document.documentElement.removeAttribute(PRESS_ATTRIBUTE)
    this.spotlightDisposer?.()
    this.spotlightDisposer = undefined
    this.whaleHandle?.dispose()
    this.whaleHandle = undefined
    this.meshHandle?.dispose()
    this.meshHandle = undefined
    this.tokenDisposer?.()
    this.tokenDisposer = undefined
    this.teardownFluid()
    removeAmbientScene()
    removePageFades()
    this.seamDisposer?.()
    this.seamDisposer = undefined
  }

  /** Attach the fluid shader and the interaction feeds. */
  private mountFluid(): void {
    const mainCanvas = document.querySelector<HTMLCanvasElement>('[data-dsh-aqua-fluid-canvas]')
    try {
      if (mainCanvas !== null) this.mainFluid = attachFluidShader(mainCanvas, this.fluidParams())
      // Palette follows the Appearance switch via the layer-lifecycle
      // `theme/change` listener (which also refreshes the brightness overlay).
      if (this.mainFluid !== undefined && mainCanvas !== null) {
        this.interactionDisposer = attachFluidInteractions({
          main: this.mainFluid,
          mainCanvas,
        })
      }
    } catch {
      // A GPU / driver failure must never take the glass theme down with it:
      // the ambient CSS wash still paints, only the WebGL water is skipped.
      this.mainFluid = undefined
    }
  }

  private teardownFluid(): void {
    this.interactionDisposer?.()
    this.interactionDisposer = undefined
    this.mainFluid?.dispose()
    this.mainFluid = undefined
  }

  private fluidParams(): FluidParams {
    const section = this.section
    // Continuous hue + depth drive the palette through HSL interpolation —
    // the depth lives in the colors, so the canvas needs no global filter.
    return section === undefined
      ? { ...SITE_FLUID_PARAMS, ...fluidToneColors(this.dark, 320, 25) }
      : { ...SITE_FLUID_PARAMS, ...fluidToneColors(this.dark, section.fluidHue, section.fluidDepth) }
  }

  private applyFluidPalettes(section: AquaSection): void {
    this.mainFluid?.setParams({
      ...SITE_FLUID_PARAMS,
      ...fluidToneColors(this.dark, section.fluidHue, section.fluidDepth),
    })
  }

  /** Stamp the data-* seams the stylesheet keys off (self-contained mode). */
  private startSeamStamper(): void {
    if (this.seamDisposer !== undefined) return
    this.seamDisposer = startSeamStamper()
  }

  /** Attach the cursor-spotlight pointer feeds (idempotent per mount). */
  private startSpotlightFeed(): void {
    if (this.spotlightDisposer !== undefined) return
    this.spotlightDisposer = startSpotlight()
  }
}
