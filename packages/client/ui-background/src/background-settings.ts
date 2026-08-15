/** Background preferences and resolution shared by the Host and browser halves. */

import z from '@deepseek-ai/schemastery'

/** Background kinds accepted at the settings boundary. */
export const BACKGROUND_PREFERENCES = ['none', 'preset', 'image'] as const

/** Settings namespace owned by the background plugin. */
export const BACKGROUND_SETTINGS_NAMESPACE = 'ui-background'

/** Media types a stored background image may carry (the attachment admission set). */
export const BACKGROUND_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

/** Default scrim strength in percent. */
export const DEFAULT_DIMMING = 45

/** Server path answering the current stored background image. */
export const BACKDROP_IMAGE_URL = '/backgrounds/current'

/** Server path accepting one raw upload body. */
export const BACKGROUND_UPLOAD_PATH = '/backgrounds'

/** Wire value of one durable stored-image reference (the attachment ref, schema-shaped). */
export interface BackgroundImageRef {
  /** Content-addressed opaque identifier (`sha256:<hex>`). */
  attachmentId: string
  /** Media type verified from the stored bytes. */
  mediaType: typeof BACKGROUND_IMAGE_MEDIA_TYPES[number]
  /** Exact encoded byte length. */
  bytes: number
  /** Intrinsic encoded width in pixels. */
  width: number
  /** Intrinsic encoded height in pixels. */
  height: number
}

/** Durable background section shared by the Host schema and the browser scope. */
export interface BackgroundSettings {
  /** Active background kind. */
  preference: typeof BACKGROUND_PREFERENCES[number]
  /** Preset id; read only while the preference is `preset`. */
  preset?: string
  /** Stored-image reference; read only while the preference is `image`. An explicit `null` counts as missing. */
  image?: BackgroundImageRef
  /** Scrim strength over the background, 0-90 percent. */
  dimming: number
}

/** Durable background schema; also the wire envelope the browser scope validates against. */
export const BackgroundSettingsSchema: z<BackgroundSettings> = z.object({
  preference: z.union([...BACKGROUND_PREFERENCES]).default('none'),
  preset: z.string().required(false),
  // A schemastery object schema carries an implicit `{}` default, so a bare
  // `z.object(...)` member would resolve an absent `image` to an empty ref.
  // The union wrapper carries no default: absence survives resolution, keeping
  // `resolveBackdrop`'s `missing-image-ref` verdict reachable on resolved sections.
  image: z.union([z.object({
    attachmentId: z.string().pattern(/^sha256:[0-9a-f]{64}$/),
    mediaType: z.union([...BACKGROUND_IMAGE_MEDIA_TYPES]),
    bytes: z.natural(),
    width: z.natural(),
    height: z.natural(),
  })]).required(false),
  dimming: z.number().step(1).min(0).max(90).default(DEFAULT_DIMMING),
})

/** Section value before any settings provider answers. */
export const DEFAULT_BACKGROUND: BackgroundSettings = Object.freeze({ preference: 'none', dimming: DEFAULT_DIMMING })

/** One built-in gradient background; both palette modes are mandatory. */
export interface BackgroundPreset {
  /** Preset id (`settings.background` locale keys `preset.<id>`). */
  id: 'aurora' | 'dusk' | 'mist'
  /** CSS `background-image` value per palette mode. */
  css: { light: string; dark: string }
}

/** Fixed non-empty preset registry; the Background settings section is the only selector surface. */
export const BACKGROUND_PRESETS: readonly [BackgroundPreset, ...BackgroundPreset[]] = Object.freeze([
  Object.freeze({
    id: 'aurora',
    css: Object.freeze({
      light: 'linear-gradient(160deg, #dce7fb 0%, #eef1f8 48%, #f7f3ec 100%)',
      dark: 'linear-gradient(160deg, #111827 0%, #151b2c 48%, #1d2130 100%)',
    }),
  }),
  Object.freeze({
    id: 'dusk',
    css: Object.freeze({
      light: 'linear-gradient(160deg, #ffe7d1 0%, #f6e2ee 52%, #e2e6f9 100%)',
      dark: 'linear-gradient(160deg, #251a2b 0%, #191c2e 52%, #0f1524 100%)',
    }),
  }),
  Object.freeze({
    id: 'mist',
    css: Object.freeze({
      light: 'linear-gradient(180deg, #f1f4f6 0%, #e6ecef 100%)',
      dark: 'linear-gradient(180deg, #161a1e 0%, #101418 100%)',
    }),
  }),
])

/** What a presenter should paint for one durable section. */
export type BackdropResolution =
  | { kind: 'none' }
  | { kind: 'preset'; css: { light: string; dark: string } }
  | { kind: 'image' }
  | { kind: 'invalid'; reason: 'unknown-preset' | 'missing-image-ref' }

/** Fail loudly if a locally closed union gains an unhandled member. */
/* v8 ignore start -- closed-union backstop is unreachable without violating the TypeScript contract */
function assertNever(value: never): never {
  throw new Error(`unexpected background preference: ${String(value)}`)
}
/* v8 ignore stop */

/**
 * Resolve one schema-resolved section to a paintable backdrop.
 * @param section - durable section (defaults already applied).
 * @returns the resolution; mismatched pairings fail loud through `invalid`.
 */
export function resolveBackdrop(section: BackgroundSettings): BackdropResolution {
  switch (section.preference) {
    case 'none': return { kind: 'none' }
    case 'preset': {
      const preset = BACKGROUND_PRESETS.find(p => p.id === section.preset)
      return preset === undefined ? { kind: 'invalid', reason: 'unknown-preset' } : { kind: 'preset', css: preset.css }
    }
    case 'image':
      return section.image == null ? { kind: 'invalid', reason: 'missing-image-ref' } : { kind: 'image' }
    /* v8 ignore next 2 -- BACKGROUND_PREFERENCES is closed and every member is handled above */
    default: return assertNever(section.preference)
  }
}

/**
 * Build the body-variable rules for one section — the single source shared by
 * the Host boot transform and the runtime presenter.
 * @param section - durable section (defaults already applied).
 * @returns CSS text; empty when nothing should paint (none/invalid), so both
 * callers treat an empty string as "retract everything".
 */
export function backdropVarsCss(section: BackgroundSettings): string {
  const resolution = resolveBackdrop(section)
  if (resolution.kind === 'none' || resolution.kind === 'invalid') return ''
  const scrim = `color-mix(in srgb, var(--dsw-alias-bg-base) ${section.dimming}%, transparent)`
  const surface = '--dsw-specific-backdrop-surface:transparent'
  if (resolution.kind === 'image') {
    return `body{--dsw-specific-backdrop-image:url("${BACKDROP_IMAGE_URL}");--dsw-specific-backdrop-scrim:${scrim};${surface}}`
  }
  return `body{--dsw-specific-backdrop-image:${resolution.css.light};--dsw-specific-backdrop-scrim:${scrim};${surface}}`
    + `body[data-ds-dark-theme]{--dsw-specific-backdrop-image:${resolution.css.dark}}`
}
