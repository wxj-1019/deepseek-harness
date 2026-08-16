/**
 * Aqua preference owner: the durable `ui-aqua` section over the settings
 * scope. Optimistic writes through the four-ish setter families, adoption of
 * Host acceptances (including cross-tab flips arriving as settings
 * invalidations), the wallpaper upload chain against `/backgrounds`, and the
 * one-time migration from the absorbed upstream's localStorage keys. The
 * {@link AquaLayer} is a pure applier this runtime drives.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  AQUA_DEFAULTS, WALLPAPER_UPLOAD_PATH, isVideoRef,
  type AquaSection, type WallpaperRef,
} from '../aqua-settings.ts'
import type { AquaLayer } from './theme-layer.ts'

/** Immutable section state published on every change. */
export interface AquaSnapshot {
  /** Durable section as last accepted or written. */
  section: AquaSection
  /** Monotonic change counter. */
  revision: number
}

/** localStorage keys of the absorbed upstream (v1.3.0 kept its knobs there); the migration is one-shot. */
const LEGACY_KEYS = [
  'dsh.ui-aqua.enabled', 'dsh.ui-aqua.mode', 'dsh.ui-aqua.blur', 'dsh.ui-aqua.frost',
  'dsh.ui-aqua.fluidHue', 'dsh.ui-aqua.fluidDepth', 'dsh.ui-aqua.bgBrightness',
  'dsh.ui-aqua.background', 'dsh.ui-aqua.wallpaper', 'dsh.ui-aqua.whale',
  'dsh.ui-aqua.critters', 'dsh.ui-aqua.mesh', 'dsh.ui-aqua.spotlight', 'dsh.ui-aqua.press',
  'dsh.ui-aqua.wallpaperBlur', 'dsh.ui-aqua.wallpaperFrost', 'dsh.ui-aqua.videoBlur',
  'dsh.ui-aqua.videoBrightness',
] as const

/** Whether the absorbed upstream left any knob in this browser's localStorage. */
function legacyPresent(): boolean {
  try {
    return LEGACY_KEYS.some(key => localStorage.getItem(key) !== null)
  } catch {
    return false
  }
}

/** Read the upstream's persisted knobs once; absent entries fall back to the shipped defaults. */
function readLegacy(): AquaSection {
  const raw = (key: (typeof LEGACY_KEYS)[number]): string | null => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }
  const bool = (key: (typeof LEGACY_KEYS)[number], fallback: boolean): boolean => {
    const value = raw(key)
    return value === null ? fallback : value === 'true'
  }
  const num = (key: (typeof LEGACY_KEYS)[number], fallback: number): number => {
    const value = Number(raw(key))
    return Number.isFinite(value) ? value : fallback
  }
  return {
    ...AQUA_DEFAULTS,
    enabled: bool('dsh.ui-aqua.enabled', true),
    // Legacy 'float'/'liquid' values migrate to 'mica' (upstream v1.1.0's rename).
    mode: raw('dsh.ui-aqua.mode') === 'compat' ? 'compat' : 'mica',
    blur: num('dsh.ui-aqua.blur', AQUA_DEFAULTS.blur),
    frost: num('dsh.ui-aqua.frost', AQUA_DEFAULTS.frost),
    fluidHue: num('dsh.ui-aqua.fluidHue', AQUA_DEFAULTS.fluidHue),
    fluidDepth: num('dsh.ui-aqua.fluidDepth', AQUA_DEFAULTS.fluidDepth),
    bgBrightness: num('dsh.ui-aqua.bgBrightness', AQUA_DEFAULTS.bgBrightness),
    background: raw('dsh.ui-aqua.background') === 'wallpaper' ? 'wallpaper' : 'fluid',
    whale: bool('dsh.ui-aqua.whale', true),
    critters: bool('dsh.ui-aqua.critters', true),
    mesh: bool('dsh.ui-aqua.mesh', true),
    spotlight: bool('dsh.ui-aqua.spotlight', true),
    press: bool('dsh.ui-aqua.press', true),
    wallpaperBlur: num('dsh.ui-aqua.wallpaperBlur', AQUA_DEFAULTS.wallpaperBlur),
    wallpaperFrost: num('dsh.ui-aqua.wallpaperFrost', AQUA_DEFAULTS.wallpaperFrost),
    videoBlur: num('dsh.ui-aqua.videoBlur', AQUA_DEFAULTS.videoBlur),
    videoBrightness: num('dsh.ui-aqua.videoBrightness', AQUA_DEFAULTS.videoBrightness),
  }
}

/** Drop every upstream key after a successful migration. */
function clearLegacy(): void {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key)
  } catch {
    /* best effort: a read-only storage area re-migrates nothing new */
  }
}

/**
 * Aqua preference runtime: reads go through {@link AquaRuntime.getAqua};
 * writes only through the setters below, each applying optimistically after
 * the scope write is issued; continuous sync only through scope adoption.
 * Uploads are plain fetches against the Host route.
 */
export class AquaRuntime {
  private readonly ctx: Context
  private readonly host: SettingsScope<AquaSection>
  private readonly layer: AquaLayer
  private section: AquaSection = AQUA_DEFAULTS
  private revision = 0
  private snapshot: AquaSnapshot
  private migrated = false

  /**
   * @param ctx - owning context (change events are emitted on it; the scope
   * listener is released through ctx.effect on dispose).
   * @param host - durable preference scope owned by the same plugin.
   * @param layer - the pure visual applier this runtime drives.
   */
  constructor(ctx: Context, host: SettingsScope<AquaSection>, layer: AquaLayer) {
    this.ctx = ctx
    this.host = host
    this.layer = layer
    this.snapshot = this.buildSnapshot()
    ctx.effect(() => host.subscribe(() => { this.adopt() }), 'ui-aqua: settings scope adoption')
    this.adopt()
  }

  /**
   * Read the current immutable snapshot.
   * @returns the current snapshot (stable reference until the next change).
   */
  getAqua(): AquaSnapshot {
    return this.snapshot
  }

  /** Flip the master switch: off retracts every layer-owned effect. */
  setEnabled(value: boolean): void {
    this.write({ enabled: value })
  }

  /** Set the rendering mode ('mica' or 'compat'). */
  setMode(value: 'mica' | 'compat'): void {
    this.write({ mode: value })
  }

  /**
   * Adjust one numeric knob (clamped into its schema range before the write).
   * @param field - the knob field of the durable section.
   * @param value - raw slider value.
   */
  setKnob(field: 'blur' | 'frost' | 'fluidHue' | 'fluidDepth' | 'bgBrightness'
  | 'wallpaperBlur' | 'wallpaperFrost' | 'videoBlur' | 'videoBrightness', value: number): void {
    const max = field === 'blur' || field === 'wallpaperBlur' || field === 'videoBlur' ? 40
      : field === 'fluidHue' ? 360
        : 100
    this.write({ [field]: Math.min(max, Math.max(0, Number.isFinite(value) ? value : AQUA_DEFAULTS[field])) } as Partial<AquaSection>)
  }

  /** Set the backdrop source (fluid board or custom wallpaper). */
  setBackground(value: 'fluid' | 'wallpaper'): void {
    this.write({ background: value })
  }

  /** Set one decorative flag (whale, critters, mesh, spotlight, press). */
  setFlag(field: 'whale' | 'critters' | 'mesh' | 'spotlight' | 'press', value: boolean): void {
    this.write({ [field]: value } as Partial<AquaSection>)
  }

  /**
   * Upload one wallpaper file and adopt it: a successful 201 stores the
   * returned reference and selects the wallpaper backdrop; failures reject
   * with the response status for the section UI to surface.
   * @param file - browser file object; its type rides the Content-Type header.
   * @returns the stored reference on a 201 response.
   * @throws the response status on any non-201 answer.
   */
  async uploadWallpaper(file: File): Promise<WallpaperRef> {
    const response = await fetch(WALLPAPER_UPLOAD_PATH, {
      method: 'POST',
      body: file,
      headers: { 'content-type': file.type },
    })
    if (!response.ok) throw new Error(`wallpaper upload failed: ${response.status}`)
    const ref = await response.json() as WallpaperRef
    this.write({ wallpaper: ref, background: 'wallpaper' })
    return ref
  }

  /**
   * Adopt one already-stored reference without uploading (the migration and
   * any future picker reuse path).
   * @param ref - reference returned by {@link uploadWallpaper}.
   */
  setWallpaper(ref: WallpaperRef): void {
    this.write({ wallpaper: ref, background: 'wallpaper' })
  }

  /** Drop the stored wallpaper and return to the fluid backdrop. */
  clearWallpaper(): void {
    void this.host.unset('wallpaper')
    void this.host.set('background', 'fluid')
    const next: AquaSection = { ...this.section, background: 'fluid' }
    delete next.wallpaper
    this.section = next
    this.publish()
  }

  /** Adopt the scope's accepted section without writing it back. */
  private adopt(): void {
    const value = this.host.getSnapshot().value
    if (value !== undefined) {
      this.section = value
      this.migrated = true
      this.publish()
      return
    }
    // One-shot migration: the durable section is absent but the absorbed
    // upstream left knobs in this browser — adopt them durably, then drop
    // the local keys. The legacy wallpaper (a data URL) is uploaded so the
    // stored image survives as a durable object.
    if (!this.migrated && legacyPresent()) {
      this.migrated = true
      const legacy = readLegacy()
      this.section = { ...legacy, background: 'fluid' }
      this.publish()
      for (const [field, value] of Object.entries(legacy)) {
        if (field === 'wallpaper' || field === 'background') continue
        void this.host.set(field, value)
      }
      const dataUrl = (() => { try { return localStorage.getItem('dsh.ui-aqua.wallpaper') ?? '' } catch { return '' } })()
      if (dataUrl.startsWith('data:image/')) {
        void this.migrateLegacyWallpaper(dataUrl)
      } else {
        void this.host.set('background', 'fluid')
        clearLegacy()
      }
      return
    }
    this.section = AQUA_DEFAULTS
    this.publish()
  }

  /** Upload the legacy data-URL wallpaper, then persist the returned reference. */
  private async migrateLegacyWallpaper(dataUrl: string): Promise<void> {
    try {
      // Decode through arrayBuffer with the type read off the URL prefix: a
      // Blob-typed round trip is not portable across DOM implementations.
      const bytes = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer())
      const mediaType = dataUrl.slice(5, dataUrl.indexOf(';'))
      const file = new File([bytes], 'wallpaper', { type: mediaType })
      const response = await fetch(WALLPAPER_UPLOAD_PATH, {
        method: 'POST',
        body: file,
        headers: { 'content-type': mediaType },
      })
      if (response.ok) {
        const ref = await response.json() as WallpaperRef
        if (!isVideoRef(ref)) {
          this.section = { ...this.section, wallpaper: ref, background: 'wallpaper' }
          this.publish()
          void this.host.set('wallpaper', ref)
          void this.host.set('background', 'wallpaper')
        }
      }
    } catch {
      /* the fluid backdrop stands in for an unmigratable wallpaper */
    } finally {
      clearLegacy()
    }
  }

  /** Write one patch's fields through the scope, then publish optimistically. */
  private write(patch: Partial<AquaSection>): void {
    for (const [field, value] of Object.entries(patch)) {
      if (value === undefined) void this.host.unset(field)
      else void this.host.set(field, value)
    }
    this.section = { ...this.section, ...patch }
    this.publish()
  }

  private buildSnapshot(): AquaSnapshot {
    return Object.freeze({ section: this.section, revision: this.revision })
  }

  private publish(): void {
    this.revision += 1
    this.snapshot = this.buildSnapshot()
    this.layer.apply(this.section)
    this.ctx.emit('aqua/change', this.snapshot)
  }
}
