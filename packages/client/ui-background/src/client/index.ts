/**
 * Browser background service over the durable `ui-background` section: it owns
 * the live preference (none / built-in preset / one stored image), publishes
 * immutable snapshots on `background/change`, and projects the three
 * `--dsw-specific-backdrop-*` body variables through a presenter-owned style
 * element. Uploads POST raw bytes to /backgrounds and return the stored
 * reference; the Background settings section (registered here) chains
 * setImage after a successful upload.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the ctx.settingsScope Context merge. Cross-plugin collaboration
// goes through the service, never a value import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { BackgroundSection } from './BackgroundSection.tsx'
import type { BackgroundSectionInjected } from './BackgroundSection.tsx'
import { createBackgroundSectionStore } from './settings-store.ts'
import { en, zh, type BackgroundKey } from './locales.ts'
import {
  BACKGROUND_PRESETS, BACKGROUND_SETTINGS_NAMESPACE, BACKGROUND_UPLOAD_PATH, BACKDROP_IMAGE_URL,
  DEFAULT_BACKGROUND, backdropVarsCss,
  type BackgroundImageRef, type BackgroundSettings, type BackdropResolution, resolveBackdrop,
} from '../background-settings.ts'

export type {
  BackgroundSectionComponentProps, BackgroundSectionInjected,
} from './BackgroundSection.tsx'
export type { BackgroundSectionState } from './settings-store.ts'
export type { BackgroundKey } from './locales.ts'
export type {
  BackgroundImageRef, BackgroundSettings, BackgroundPreset, BackdropResolution,
} from '../background-settings.ts'

/** Namespace owning this feature's settings-section copy. */
export const SETTINGS_NS = 'settings.background'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Background settings section's copy. */
    'settings.background': BackgroundKey
  }
}

/** Immutable background state published on every change. */
export interface BackgroundSnapshot {
  /** Durable section as last accepted or written. */
  section: BackgroundSettings
  /** What a presenter should paint for the section. */
  backdrop: BackdropResolution
  /** Monotonic change counter. */
  revision: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    background: BackgroundRuntime
  }
  interface Events {
    /**
     * Background state changed (a validated write or an adopted Host acceptance).
     * @param snapshot - Current immutable background snapshot.
     * @mode emit
     */
    'background/change'(snapshot: BackgroundSnapshot): void
  }
}

/**
 * Project background sections onto the document through one presenter-owned
 * style element in head. Pure DOM writes, no React involvement; `none` and
 * `invalid` sections retract the element so the inert stylesheet defaults
 * take over again.
 */
export class BackgroundPresenter {
  /** The single style node this presenter owns. */
  private style: HTMLStyleElement | undefined

  /**
   * Write the section's variable rules (no-op without a document).
   * @param section - durable section (defaults already applied).
   */
  apply(section: BackgroundSettings): void {
    const css = backdropVarsCss(section)
    if (css === '') {
      this.dispose()
      return
    }
    if (this.style === undefined && typeof document !== 'undefined') {
      this.style = document.createElement('style')
      this.style.dataset.dshBackground = ''
      document.head.append(this.style)
    }
    if (this.style !== undefined) this.style.textContent = css
  }

  /** Retract the presenter-owned style element. */
  dispose(): void {
    this.style?.remove()
    this.style = undefined
  }
}

/**
 * Background preference owner. Reads go through {@link getBackground};
 * preference writes only through the four setters, each validating before the
 * scope write and emitting `background/change`; continuous sync only through
 * scope adoption. Uploads and the availability probe are plain fetches against
 * the Host route.
 */
export class BackgroundRuntime {
  private readonly ctx: Context
  private readonly host: SettingsScope<BackgroundSettings>
  private readonly presenter = new BackgroundPresenter()
  private section: BackgroundSettings = DEFAULT_BACKGROUND
  private revision = 0
  private snapshot: BackgroundSnapshot

  /**
   * @param ctx - owning context (change events are emitted on it; the scope
   * listener is released through ctx.effect on dispose).
   * @param host - durable preference scope owned by the same plugin.
   */
  constructor(ctx: Context, host: SettingsScope<BackgroundSettings>) {
    this.ctx = ctx
    this.host = host
    this.snapshot = this.buildSnapshot()
    ctx.effect(() => host.subscribe(() => { this.adopt() }), 'ui-background: settings scope adoption')
    this.adopt()
  }

  /**
   * Read the current immutable snapshot.
   * @returns the current snapshot (stable reference until the next change).
   */
  getBackground(): BackgroundSnapshot {
    return this.snapshot
  }

  /** Retract to no background. */
  setNone(): void {
    this.write({ preference: 'none' })
  }

  /**
   * Select a registered preset.
   * @param id - preset id from the fixed registry; unknown ids throw.
   */
  setPreset(id: string): void {
    if (!BACKGROUND_PRESETS.some(p => p.id === id)) {
      throw new Error(`background preset "${id}" is not registered`)
    }
    this.write({ preference: 'preset', preset: id })
  }

  /**
   * Select a stored image.
   * @param ref - reference returned by {@link uploadImage}.
   */
  setImage(ref: BackgroundImageRef): void {
    this.write({ preference: 'image', image: ref })
  }

  /**
   * Adjust the scrim strength.
   * @param value - percent, 0-90 (schema-validated at the settings boundary).
   */
  setDimming(value: number): void {
    this.write({ dimming: value })
  }

  /**
   * Upload one image and return its durable reference; the preference is left
   * untouched so the caller chains {@link setImage} on success.
   * @param file - browser file object; its type rides the Content-Type header.
   * @returns the stored reference on a 201 response.
   * @throws the response status on any non-201 answer.
   */
  async uploadImage(file: File): Promise<BackgroundImageRef> {
    const response = await fetch(BACKGROUND_UPLOAD_PATH, {
      method: 'POST',
      body: file,
      headers: { 'content-type': file.type },
    })
    if (!response.ok) throw new Error(`background upload failed: ${response.status}`)
    return await response.json() as BackgroundImageRef
  }

  /**
   * Probe whether the current stored image still resolves (dangling-reference
   * detection for the section's error banner).
   * @returns whether the current image route answers 2xx.
   */
  async probeImage(): Promise<boolean> {
    const response = await fetch(BACKDROP_IMAGE_URL, { method: 'HEAD' })
    return response.ok
  }

  /** Release the presenter-owned style element (scope listener rides ctx.effect). */
  dispose(): void {
    this.presenter.dispose()
  }

  /** Adopt the scope's accepted section without writing it back. */
  private adopt(): void {
    const value = this.host.getSnapshot().value
    if (value === undefined) return
    this.section = value
    this.publish()
  }

  /** Write one patch's fields through the scope, then publish optimistically. */
  private write(patch: Partial<BackgroundSettings>): void {
    for (const [field, value] of Object.entries(patch)) void this.host.set(field, value)
    this.section = { ...this.section, ...patch }
    this.publish()
  }

  private buildSnapshot(): BackgroundSnapshot {
    return Object.freeze({
      section: this.section,
      backdrop: resolveBackdrop(this.section),
      revision: this.revision,
    })
  }

  private publish(): void {
    this.revision += 1
    this.snapshot = this.buildSnapshot()
    this.presenter.apply(this.section)
    this.ctx.emit('background/change', this.snapshot)
  }
}

/**
 * Required services: settings transport plus slots/locale for the Background
 * section. `remote` carries the forwarded settings invalidation that the
 * scope binder subscribes to on this context.
 */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * Client plugin body: provide the background service and register the
 * feature-owned Background settings section (a feature owns its settings
 * surface).
 * @param ctx - client cordis context.
 */
export function apply(ctx: ClientContext): void {
  const host = ctx.settingsScope.bind<BackgroundSettings>({ namespace: BACKGROUND_SETTINGS_NAMESPACE })
  const background = new BackgroundRuntime(ctx, host)
  ctx.provide('background', background)

  ctx.effect(() => () => { background.dispose() }, 'ui-background: service disposal')

  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'ui-background: settings section dictionaries')

  const store = createBackgroundSectionStore()
  let bound: BoundActions<typeof store> | undefined
  const sync = (snapshot: BackgroundSnapshot): void => {
    bound?.sync(snapshot.section, snapshot.backdrop, snapshot.revision)
  }
  ctx.on('background/change', sync)
  const injected = (actions: BoundActions<typeof store>): BackgroundSectionInjected => {
    bound = actions
    // Re-sync from the getter so no event is lost between registration and
    // first render (the store's revision guard drops stale duplicates).
    sync(background.getBackground())
    return {
      setNone: () => { background.setNone() },
      setPreset: (id) => { background.setPreset(id) },
      uploadImage: async (file) => {
        const ref = await background.uploadImage(file)
        background.setImage(ref)
      },
      setDimming: (value) => { background.setDimming(value) },
      probeImage: () => background.probeImage(),
    }
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'background',
    order: 5,
    label: () => ctx.locale.bind(SETTINGS_NS)('nav'),
    locale: SETTINGS_NS,
    store,
    inject: injected,
  }, BackgroundSection))
}
