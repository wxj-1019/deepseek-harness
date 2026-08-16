/**
 * Aqua preferences and durable vocabulary shared by the Host and browser
 * halves: the settings namespace, the knob schema with shipped defaults, the
 * wallpaper reference union served by `/backgrounds`, and the boot-time
 * token/attribute style builder. The rendering token tables also live here so
 * the Host boot transform and the browser layer paint the identical palette.
 */

import z from '@deepseek-ai/schemastery'
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'

/** Settings namespace owned by the aqua plugin. */
export const AQUA_SETTINGS_NAMESPACE = 'ui-aqua'

/** Server path answering the current stored wallpaper. */
export const WALLPAPER_URL = '/backgrounds/current'

/** Server path accepting one raw upload body (image or video). */
export const WALLPAPER_UPLOAD_PATH = '/backgrounds'

/** Rendering modes: mica (frosted floating cards) or the stock layout with a generic glass material. */
export const AQUA_MODES = ['mica', 'compat'] as const

/** Backdrop sources: the living fluid board or a custom wallpaper. */
export const AQUA_BACKGROUNDS = ['fluid', 'wallpaper'] as const

/** Image media types a stored wallpaper image may carry. */
export const WALLPAPER_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

/** Video container media types a stored wallpaper video may carry. */
export const WALLPAPER_VIDEO_MEDIA_TYPES = ['video/mp4', 'video/webm', 'video/ogg'] as const

/** Durable reference of one stored wallpaper image. */
export interface WallpaperImageRef {
  /** Content-addressed opaque identifier (`sha256:<hex>`). */
  attachmentId: string
  /** Media type verified from the stored bytes. */
  mediaType: typeof WALLPAPER_IMAGE_MEDIA_TYPES[number]
  /** Exact encoded byte length. */
  bytes: number
  /** Intrinsic encoded width in pixels. */
  width: number
  /** Intrinsic encoded height in pixels. */
  height: number
}

/** Durable reference of one stored wallpaper video (no intrinsic dimensions: the store sniffs containers, it owns no demuxer). */
export interface WallpaperVideoRef {
  /** Content-addressed opaque identifier (`sha256:<hex>`). */
  attachmentId: string
  /** Media type verified from the stored bytes. */
  mediaType: typeof WALLPAPER_VIDEO_MEDIA_TYPES[number]
  /** Exact encoded byte length. */
  bytes: number
}

/** Durable wallpaper reference: the upload route's answer, discriminated by media type. */
export type WallpaperRef = WallpaperImageRef | WallpaperVideoRef

/** Whether one wallpaper reference addresses the video surface. */
export function isVideoRef(ref: WallpaperRef): ref is WallpaperVideoRef {
  return ref.mediaType.startsWith('video/')
}

/** Tunable layer knobs plus the enable flag — the durable section. */
export interface AquaSection {
  /** Master switch: off retracts every owned effect and restores the stock UI. */
  enabled: boolean
  /** Rendering mode. */
  mode: typeof AQUA_MODES[number]
  /** Glass backdrop blur radius, px. */
  blur: number
  /** Glass fill opacity, 0-100 (50 = the shipped look; drives the frost multiplier). */
  frost: number
  /** Fluid hue, degrees (0-360, continuous). */
  fluidHue: number
  /** Fluid depth, 0-100 (0 = deep saturated, 100 = pale light, continuous). */
  fluidDepth: number
  /** Background brightness, 0-100 (0 = pure black, 50 = transparent, 100 = pure white). */
  bgBrightness: number
  /** Backdrop source. */
  background: typeof AQUA_BACKGROUNDS[number]
  /** Stored wallpaper reference; absent while the fluid board owns the backdrop. */
  wallpaper?: WallpaperRef
  /** Particle whale in the chat area center (the harness hero fish). */
  whale: boolean
  /** Ambient marine life (fish / bubbles / plankton). */
  critters: boolean
  /** Interactive mesh (the dot-grid with pointer repel). */
  mesh: boolean
  /** Cursor spotlight glow that follows the pointer over the glass panes. */
  spotlight: boolean
  /** Hover press-down: the pane under the cursor sinks a touch (tactile depth). */
  press: boolean
  /** Wallpaper blur radius, px. */
  wallpaperBlur: number
  /** Wallpaper frost veil, 0-100. */
  wallpaperFrost: number
  /** Video wallpaper blur radius, px. */
  videoBlur: number
  /** Video wallpaper brightness, 0-100 (100 = fully lit, 0 = deepest dim). */
  videoBrightness: number
}

/** Shipped defaults — what a first-time install sees (the tuned look). */
export const AQUA_DEFAULTS: AquaSection = {
  enabled: true,
  mode: 'mica',
  blur: 20,
  frost: 7,
  bgBrightness: 50,
  background: 'fluid',
  whale: true,
  critters: true,
  mesh: true,
  spotlight: true,
  press: true,
  fluidHue: 320,
  fluidDepth: 25,
  wallpaperBlur: 0,
  wallpaperFrost: 0,
  videoBlur: 6,
  videoBrightness: 45,
}

/**
 * Durable section schema; also the wire envelope the browser scope validates
 * against. The union wrapper around each ref shape carries no default, so an
 * absent `wallpaper` survives resolution as undefined.
 */
export const AquaSectionSchema: z<AquaSection> = z.object({
  enabled: z.boolean().default(true),
  mode: z.union([...AQUA_MODES]).default('mica'),
  blur: z.number().step(1).min(0).max(40).default(AQUA_DEFAULTS.blur),
  frost: z.number().step(1).min(0).max(100).default(AQUA_DEFAULTS.frost),
  fluidHue: z.number().min(0).max(360).default(AQUA_DEFAULTS.fluidHue),
  fluidDepth: z.number().step(1).min(0).max(100).default(AQUA_DEFAULTS.fluidDepth),
  bgBrightness: z.number().step(1).min(0).max(100).default(AQUA_DEFAULTS.bgBrightness),
  background: z.union([...AQUA_BACKGROUNDS]).default('fluid'),
  wallpaper: z.union([
    z.object({
      attachmentId: z.string().pattern(/^sha256:[0-9a-f]{64}$/),
      mediaType: z.union([...WALLPAPER_IMAGE_MEDIA_TYPES]),
      bytes: z.natural(),
      width: z.natural(),
      height: z.natural(),
    }),
    z.object({
      attachmentId: z.string().pattern(/^sha256:[0-9a-f]{64}$/),
      mediaType: z.union([...WALLPAPER_VIDEO_MEDIA_TYPES]),
      bytes: z.natural(),
    }),
  ]).required(false),
  whale: z.boolean().default(true),
  critters: z.boolean().default(true),
  mesh: z.boolean().default(true),
  spotlight: z.boolean().default(true),
  press: z.boolean().default(true),
  wallpaperBlur: z.number().step(1).min(0).max(40).default(AQUA_DEFAULTS.wallpaperBlur),
  wallpaperFrost: z.number().step(1).min(0).max(100).default(AQUA_DEFAULTS.wallpaperFrost),
  videoBlur: z.number().step(1).min(0).max(40).default(AQUA_DEFAULTS.videoBlur),
  videoBrightness: z.number().step(1).min(0).max(100).default(AQUA_DEFAULTS.videoBrightness),
})

/** Scheme-invariant override value (applied to both palettes). */
const both = (value: string): { light: string; dark: string } => ({ light: value, dark: value })

const FONT_STACK = "'Space Grotesk Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', "
  + "'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif"

/**
 * Alias-token override layer: the deep-sea palette. Every value is a
 * `{ light, dark }` pair so the layer stays legible when the user switches
 * the Appearance preference — dark is deep-sea navy, light is cool white-blue.
 */
export const AQUA_TOKEN_OVERRIDES: ThemeTokenOverrides = {
  // Typography: Space Grotesk for Latin/digits, CJK keeps the system stack.
  '--dsw-font-family': both(FONT_STACK),

  // Backgrounds.
  '--dsw-alias-bg-base': { light: '#F4F8FD', dark: '#0C121B' },
  '--dsw-alias-bg-layer-1': { light: '#FFFFFF', dark: '#111A27' },
  '--dsw-alias-bg-layer-2': { light: '#ECF2FA', dark: '#162130' },
  '--dsw-alias-bg-layer-3': { light: '#E2EBF7', dark: '#1C2A3D' },
  '--dsw-alias-bg-overlay': { light: '#DCE7F4', dark: '#22334A' },
  '--dsw-alias-bg-module-platform': { light: '#FFFFFF', dark: '#111A27' },
  '--dsw-alias-bg-multi-select': { light: '#FFFFFF', dark: '#162130' },
  '--dsw-alias-bg-skeleton': { light: 'rgba(19, 45, 83, 0.08)', dark: 'rgba(148, 180, 220, 0.12)' },
  '--dsw-alias-bg-mask-1': { light: 'rgba(19, 37, 62, 0.3)', dark: 'rgba(4, 8, 14, 0.55)' },
  '--dsw-alias-bg-mask-2': { light: 'rgba(19, 37, 62, 0.12)', dark: 'rgba(4, 8, 14, 0.25)' },
  '--dsw-alias-bg-mask-3': { light: 'rgba(19, 37, 62, 0.3)', dark: 'rgba(4, 8, 14, 0.5)' },
  '--dsw-alias-bg-mask-drop': { light: 'rgba(244, 248, 253, 0.72)', dark: 'rgba(12, 18, 27, 0.7)' },

  // Hairlines and strokes.
  '--dsw-alias-border-l1': { light: 'rgba(19, 45, 83, 0.08)', dark: 'rgba(148, 180, 220, 0.08)' },
  '--dsw-alias-border-l2': { light: 'rgba(19, 45, 83, 0.14)', dark: 'rgba(148, 180, 220, 0.15)' },
  '--dsw-alias-border-l2-darkmode-thin': { light: 'rgba(19, 45, 83, 0.1)', dark: 'rgba(148, 180, 220, 0.1)' },
  '--dsw-alias-border-l3': { light: 'rgba(19, 45, 83, 0.22)', dark: 'rgba(148, 180, 220, 0.24)' },
  '--dsw-alias-border-l4': { light: 'rgba(19, 45, 83, 0.32)', dark: 'rgba(148, 180, 220, 0.34)' },
  '--dsw-alias-border-inverted': { light: 'rgba(19, 45, 83, 0.06)', dark: 'rgba(148, 180, 220, 0.12)' },
  '--dsw-alias-border-inverted2': { light: 'rgba(19, 45, 83, 0.08)', dark: 'rgba(148, 180, 220, 0.08)' },

  // Text ink.
  '--dsw-alias-label-primary': { light: '#13243E', dark: '#EAF2FC' },
  '--dsw-alias-label-secondary': { light: '#40597A', dark: '#AFC3DC' },
  '--dsw-alias-label-tertiary': { light: '#5D7696', dark: '#8399B5' },
  '--dsw-alias-label-caption': { light: '#7E93AC', dark: '#6B829F' },
  '--dsw-alias-label-dimmed': { light: '#C9D4E2', dark: '#4E5F76' },
  '--dsw-alias-label-primary-bluish': { light: '#2E5EB8', dark: '#BFD6F6' },
  '--dsw-alias-label-primary-dimmed': { light: '#1E3556', dark: '#D7E3F4' },
  '--dsw-alias-label-primary-inverted': { light: '#FFFFFF', dark: '#162130' },
  '--dsw-alias-label-primary-foreground': { light: '#FFFFFF', dark: '#FFFFFF' },

  // Brand (wordmark ink stays scheme ink; accents go business blue).
  '--dsw-alias-brand-primary': { light: '#13243E', dark: '#EAF2FC' },
  '--dsw-alias-brand-text': { light: '#13243E', dark: '#EAF2FC' },
  '--dsw-alias-brand-primary-invert': { light: '#FFFFFF', dark: '#0C121B' },
  '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: '#3F76D8', dark: '#6E9BE8' },

  // States.
  '--dsw-alias-state-business-primary': { light: '#3F76D8', dark: '#6E9BE8' },
  '--dsw-alias-state-business-tertiary': { light: '#DCE9FB', dark: '#1D2C44' },
  '--dsw-alias-state-success-tertiary': { light: '#DDF3E4', dark: '#12271C' },
  '--dsw-alias-state-warn-tertiary': { light: '#FCEED6', dark: '#2A2416' },

  // Buttons: the primary action becomes business blue with white ink.
  '--dsw-alias-button-primary-fill': { light: '#3F76D8', dark: '#4A7FD9' },
  '--dsw-alias-button-primary-hover': { light: '#5C8DE0', dark: '#5E8FE6' },
  '--dsw-alias-button-primary-dimmed': { light: '#DCE9FB', dark: '#162130' },
  '--dsw-alias-button-info-fill': { light: '#3F76D8', dark: '#6E9BE8' },
  '--dsw-alias-button-info-hover': { light: '#5C8DE0', dark: '#7FA8EF' },
  '--dsw-alias-button-elevated-fill': { light: '#FFFFFF', dark: '#162130' },
  '--dsw-alias-button-floating-fill': { light: '#FFFFFF', dark: '#162130' },
  '--dsw-alias-button-floating-hover': { light: '#F0F5FB', dark: '#1C2A3D' },
  '--dsw-alias-button-contrast-fill': { light: '#26364D', dark: '#EAF2FC' },
  '--dsw-alias-button-ghost-active-fill': { light: '#DCE7F4', dark: '#1C2A3D' },
  '--dsw-alias-button-ghost-active-hover': { light: '#E9F0F8', dark: '#162130' },
  '--dsw-alias-button-ghost-active-border': { light: '#8FA3BC', dark: '#6B829F' },

  // Interaction fills.
  '--dsw-alias-interactive-bg-hover': { light: 'rgba(63, 118, 216, 0.08)', dark: 'rgba(126, 164, 223, 0.1)' },
  '--dsw-alias-interactive-bg-hover-accent': { light: 'rgba(63, 118, 216, 0.14)', dark: 'rgba(126, 164, 223, 0.2)' },
  '--dsw-alias-interactive-bg-active': { light: 'rgba(63, 118, 216, 0.2)', dark: 'rgba(126, 164, 223, 0.26)' },
  '--dsw-alias-interactive-bg-hover-danger': { light: 'rgba(236, 19, 19, 0.05)', dark: 'rgba(242, 90, 90, 0.14)' },
  '--dsw-alias-interactive-bg-hover-solid': { light: '#F0F5FB', dark: '#1C2A3D' },

  // Markdown / code surfaces.
  '--dsw-alias-markdown-code-block': { light: '#F0F5FB', dark: '#0D141F' },
  '--dsw-alias-markdown-code-block-banner': { light: '#F5F8FD', dark: '#121B29' },
  '--dsw-alias-markdown-inline-code': { light: '#E4EDF8', dark: '#172334' },
  '--dsw-alias-markdown-citation': { light: '#EAF1F9', dark: '#1A2534' },
  '--dsw-alias-markdown-tag': { light: '#E4EDF8', dark: '#162130' },
  '--dsw-alias-markdown-placeholder': { light: '#EAF1F9', dark: '#131D2B' },
  '--dsw-alias-markdown-code-segment-selected': { light: '#FFFFFF', dark: '#1C2A3D' },
  '--dsw-alias-markdown-code-segment-unselected': { light: '#F0F5FB', dark: '#0F1723' },

  // Scrollbars.
  '--dsw-alias-scrollbar-bg-l1': { light: 'rgba(63, 118, 216, 0.28)', dark: 'rgba(126, 164, 223, 0.28)' },
  '--dsw-alias-scrollbar-bg-l2': { light: 'rgba(63, 118, 216, 0.4)', dark: 'rgba(126, 164, 223, 0.36)' },
  '--dsw-alias-scrollbar-hover-l1': { light: 'rgba(63, 118, 216, 0.5)', dark: 'rgba(126, 164, 223, 0.44)' },
  '--dsw-alias-scrollbar-hover-l2': { light: 'rgba(63, 118, 216, 0.6)', dark: 'rgba(126, 164, 223, 0.52)' },

  // Specific surfaces. The sidebar root fill goes transparent — the glass
  // panel styling lives on the column itself, so no double tint.
  '--dsw-specific-sidebar-fill': { light: 'transparent', dark: 'transparent' },
  '--dsw-specific-sidebar-nav-item-active': { light: '#DEE9F8', dark: '#1B283A' },
  '--dsw-specific-sidebar-nav-item-hover': { light: '#E9F0F8', dark: '#15202F' },
  '--dsw-specific-sidebar-nav-item-active-accent': { light: '#3F76D8', dark: '#6E9BE8' },
  '--dsw-specific-input-major': { light: '#FFFFFF', dark: '#101927' },
  '--dsw-specific-login-input': { light: '#F0F5FB', dark: '#0D141F' },
  '--dsw-specific-menu': { light: '#EAF1F9', dark: '#162130' },
  '--dsw-specific-selector': { light: '#EAF1F9', dark: '#1C2A3D' },
  '--dsw-specific-bubble': { light: '#F0F5FC', dark: '#121C2A' },
  '--dsw-specific-bubble-highlight': { light: '#DCE9FB', dark: '#1A283A' },
  '--dsw-specific-tip': { light: '#EAF1F9', dark: '#131D2B' },
  '--dsw-alias-toast-bg': { light: '#1B3256', dark: '#1C2A3D' },
  '--dsw-alias-tooltip-bg': { light: '#13243E', dark: '#162130' },

  // Elevation shadows (blue-tinted depth).
  '--dsw-shadow-lv1': { light: '0 2px 4px rgba(19, 45, 83, 0.06)', dark: '0 2px 4px rgba(2, 6, 14, 0.5)' },
  '--dsw-shadow-lv1-blur': { light: '0 4px 12px rgba(19, 45, 83, 0.05)', dark: '0 4px 12px rgba(2, 6, 14, 0.4)' },
  '--dsw-shadow-lv2': {
    light: '0 4px 12px rgba(19, 45, 83, 0.05), 0 2px 8px rgba(19, 45, 83, 0.06)',
    dark: '0 4px 12px rgba(2, 6, 14, 0.4), 0 2px 8px rgba(2, 6, 14, 0.35)',
  },
  '--dsw-shadow-lv3': {
    light: '0 0 1px rgba(19, 45, 83, 0.08), 0 12px 32px rgba(19, 45, 83, 0.12)',
    dark: '0 0 1px rgba(2, 6, 14, 0.6), 0 12px 32px rgba(2, 6, 14, 0.55)',
  },
}

/**
 * Compatibility-mode token set: the same palette as the floating mode, but
 * every surface token turns translucent, so the fluid/wallpaper backdrop
 * shows through the STOCK layout. This is what makes the material generic —
 * any plugin that consumes the shared design tokens gets the glass for free.
 */
const COMPAT_SURFACE_OVERRIDES: ThemeTokenOverrides = {
  '--dsw-alias-bg-layer-1': { light: 'rgba(255, 255, 255, 0.55)', dark: 'rgba(17, 26, 39, 0.55)' },
  '--dsw-alias-bg-layer-2': { light: 'rgba(236, 242, 250, 0.5)', dark: 'rgba(22, 33, 48, 0.55)' },
  '--dsw-alias-bg-layer-3': { light: 'rgba(226, 235, 247, 0.45)', dark: 'rgba(28, 42, 61, 0.5)' },
  '--dsw-alias-bg-overlay': { light: 'rgba(220, 231, 244, 0.6)', dark: 'rgba(34, 51, 74, 0.6)' },
  '--dsw-alias-bg-module-platform': { light: 'rgba(255, 255, 255, 0.55)', dark: 'rgba(17, 26, 39, 0.55)' },
  '--dsw-alias-bg-multi-select': { light: 'rgba(255, 255, 255, 0.55)', dark: 'rgba(22, 33, 48, 0.55)' },
  '--dsw-specific-menu': { light: 'rgba(234, 241, 249, 0.6)', dark: 'rgba(22, 33, 48, 0.6)' },
  '--dsw-specific-selector': { light: 'rgba(234, 241, 249, 0.55)', dark: 'rgba(28, 42, 61, 0.55)' },
  '--dsw-specific-bubble': { light: 'rgba(240, 245, 252, 0.55)', dark: 'rgba(18, 28, 42, 0.55)' },
  '--dsw-specific-bubble-highlight': { light: 'rgba(220, 233, 251, 0.55)', dark: 'rgba(26, 40, 58, 0.55)' },
  '--dsw-specific-tip': { light: 'rgba(234, 241, 249, 0.6)', dark: 'rgba(19, 29, 43, 0.6)' },
  '--dsw-specific-input-major': { light: 'rgba(255, 255, 255, 0.5)', dark: 'rgba(16, 25, 39, 0.5)' },
  '--dsw-specific-login-input': { light: 'rgba(240, 245, 251, 0.5)', dark: 'rgba(13, 20, 31, 0.5)' },
  '--dsw-alias-markdown-code-block': { light: 'rgba(240, 245, 251, 0.5)', dark: 'rgba(13, 20, 31, 0.5)' },
  '--dsw-alias-markdown-code-block-banner': { light: 'rgba(245, 248, 253, 0.55)', dark: 'rgba(18, 27, 41, 0.55)' },
  '--dsw-alias-markdown-inline-code': { light: 'rgba(228, 237, 248, 0.5)', dark: 'rgba(23, 35, 52, 0.5)' },
  '--dsw-alias-markdown-citation': { light: 'rgba(234, 241, 249, 0.55)', dark: 'rgba(26, 37, 52, 0.55)' },
  '--dsw-alias-markdown-tag': { light: 'rgba(228, 237, 248, 0.5)', dark: 'rgba(22, 33, 48, 0.5)' },
  '--dsw-alias-markdown-placeholder': { light: 'rgba(234, 241, 249, 0.55)', dark: 'rgba(19, 29, 43, 0.55)' },
  '--dsw-alias-toast-bg': { light: 'rgba(27, 50, 86, 0.85)', dark: 'rgba(28, 42, 61, 0.85)' },
  '--dsw-alias-tooltip-bg': { light: 'rgba(19, 36, 62, 0.88)', dark: 'rgba(22, 33, 48, 0.88)' },
}

/** Compatibility token layer: the palette plus the translucent surfaces. */
export const COMPAT_TOKEN_OVERRIDES: ThemeTokenOverrides = { ...AQUA_TOKEN_OVERRIDES, ...COMPAT_SURFACE_OVERRIDES }

/** The layer's identity in the theme override stack (inspection-visible). */
export const OVERRIDE_SOURCE = '@deepseek-ai/dsh-client-ui-aqua'

/** html attribute selecting the Aqua layer: CSS hooks and ambient effects. */
export const AQUA_ATTRIBUTE = 'data-dsh-aqua'

/**
 * Build the boot `<style>` text for one enabled section: the mode's token
 * overrides as one dual-palette rule pair, exactly what the runtime layer
 * re-owns through the theme override stack after activation. The light values
 * ride `body`, the dark values ride `body[data-ds-dark-theme]` — the same
 * selection the base stylesheets use, so no scheme resolution is needed here.
 * @param section - durable section (defaults already applied).
 * @returns CSS text for the boot style element.
 */
export function aquaBootCss(section: AquaSection): string {
  const overrides = section.mode === 'compat' ? COMPAT_TOKEN_OVERRIDES : AQUA_TOKEN_OVERRIDES
  const light: string[] = []
  const dark: string[] = []
  for (const [token, modes] of Object.entries(overrides)) {
    light.push(`${token}:${modes.light}`)
    dark.push(`${token}:${modes.dark}`)
  }
  return `body{${light.join(';')}}body[data-ds-dark-theme]{${dark.join(';')}}`
}

/**
 * Build the boot `<script>` text that marks `<html>` with the layer attribute
 * and the mode attribute before first paint; the runtime layer re-owns the
 * same attributes after activation.
 * @param section - durable section (defaults already applied).
 * @returns script body text for the boot script element.
 */
export function aquaBootScript(section: AquaSection): string {
  const modeAttribute = section.mode === 'compat' ? 'data-dsh-compat' : 'data-dsh-float'
  return `document.documentElement.setAttribute('${AQUA_ATTRIBUTE}','');`
    + `document.documentElement.setAttribute('${modeAttribute}','');`
}
