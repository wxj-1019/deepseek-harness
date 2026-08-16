/**
 * Background settings section: preference cards (none / presets / image),
 * split-swatch preset thumbnails, image upload with auto-select, and the
 * dimming slider. Thumbnails paint both palette modes as one split swatch —
 * a preset's values are per-mode, and the picker must not depend on the live
 * scheme. Registered by this package — the background feature owns its own
 * settings surface.
 */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  BACKGROUND_IMAGE_MEDIA_TYPES, BACKGROUND_PRESETS, BACKDROP_IMAGE_URL,
} from '../background-settings.ts'
import type { BackgroundKey } from './locales.ts'
import type { createBackgroundSectionStore } from './settings-store.ts'
import css from './BackgroundSection.module.css'

/** Injected business face: preference writes, the upload chain, and the probe. */
export interface BackgroundSectionInjected {
  /** Retract to no background. */
  setNone: () => void
  /** Select a registered preset id. */
  setPreset: (id: string) => void
  /** Upload one image and select it on success; rejects on failure. */
  uploadImage: (file: File) => Promise<void>
  /** Adjust the scrim strength (0-90). */
  setDimming: (value: number) => void
  /** Whether the current stored image still resolves. */
  probeImage: () => Promise<boolean>
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type BackgroundSectionComponentProps =
  PropsRuntime<'settings.section'> & PropsStore<ReturnType<typeof createBackgroundSectionStore>>
  & PropsLocale<'settings.background'> & BackgroundSectionInjected

/** Invalid-reason → locale key (the closed union carries no display text). */
const INVALID_KEYS = {
  'unknown-preset': 'invalid.unknownPreset',
  'missing-image-ref': 'invalid.missingImageRef',
} as const satisfies Record<'unknown-preset' | 'missing-image-ref', BackgroundKey>

/**
 * Render the Background section.
 * @param props - composed slot props.
 * @returns the section element tree.
 */
export function BackgroundSection({
  t, useStore, setNone, setPreset, uploadImage, setDimming, probeImage,
}: BackgroundSectionComponentProps) {
  const section = useStore(s => s.section)
  const backdrop = useStore(s => s.backdrop)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [imageUnavailable, setImageUnavailable] = useState(false)
  const imageId = section.image?.attachmentId

  useEffect(() => {
    if (section.preference !== 'image') {
      setImageUnavailable(false)
      return
    }
    let cancelled = false
    probeImage().then(
      (available) => { if (!cancelled) setImageUnavailable(!available) },
      () => { if (!cancelled) setImageUnavailable(true) },
    )
    return () => { cancelled = true }
  }, [section.preference, imageId, probeImage])

  return (
    <div className={css.group}>
      <div className={css.title}>{t('title')}</div>
      {backdrop.kind === 'invalid' && (
        <div className={css.error} role="alert">{t(INVALID_KEYS[backdrop.reason])}</div>
      )}
      <div className={css.cards}>
        <button
          type="button"
          className={clsx(css.card, section.preference === 'none' && css.selected)}
          aria-pressed={section.preference === 'none'}
          onClick={() => { setNone() }}
        >
          {t('kind.none')}
        </button>
        <button
          type="button"
          className={clsx(css.card, section.preference === 'preset' && css.selected)}
          aria-pressed={section.preference === 'preset'}
          onClick={() => {
            const current = section.preset !== undefined && backdrop.kind === 'preset' ? section.preset : BACKGROUND_PRESETS[0].id
            setPreset(current)
          }}
        >
          {t('kind.preset')}
        </button>
        <button
          type="button"
          className={clsx(css.card, section.preference === 'image' && css.selected)}
          aria-pressed={section.preference === 'image'}
          onClick={() => { fileRef.current?.click() }}
        >
          {t('kind.image')}
        </button>
      </div>
      {section.preference === 'preset' && (
        <div className={css.presets} role="radiogroup" aria-label={t('kind.preset')}>
          {BACKGROUND_PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={section.preset === preset.id}
              className={clsx(css.swatch, section.preset === preset.id && css.selected)}
              style={{
                // Two half-height layers, light above and dark below. A
                // gradient cannot be a color stop: nesting the preset values
                // inside one outer gradient is invalid CSS that Chromium drops
                // (the swatch then paints nothing).
                backgroundImage: `${preset.css.dark}, ${preset.css.light}`,
                backgroundSize: '100% 50%',
                backgroundPosition: 'bottom, top',
                backgroundRepeat: 'no-repeat',
              }}
              onClick={() => { setPreset(preset.id) }}
            >
              {t(`preset.${preset.id}`)}
            </button>
          ))}
        </div>
      )}
      {(section.preference === 'image' || section.image !== undefined) && (
        <div className={css.imageRow}>
          {section.image !== undefined && (
            <div
              className={css.preview}
              style={{ backgroundImage: `url("${BACKDROP_IMAGE_URL}")` }}
              aria-label={t('kind.image')}
            />
          )}
          <input
            ref={fileRef}
            type="file"
            accept={BACKGROUND_IMAGE_MEDIA_TYPES.join(',')}
            className={css.fileInput}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file === undefined) return
              setBusy(true)
              setUploadError(null)
              void uploadImage(file)
                .catch((error: unknown) => { setUploadError(error instanceof Error ? error.message : String(error)) })
                .finally(() => { setBusy(false) })
            }}
          />
          <button type="button" className={css.action} disabled={busy} onClick={() => { fileRef.current?.click() }}>
            {busy ? t('uploading') : t('upload')}
          </button>
          {section.image !== undefined && (
            <button type="button" className={css.action} onClick={() => { setNone() }}>{t('remove')}</button>
          )}
          {uploadError !== null && <span className={css.error} role="alert">{uploadError}</span>}
          {imageUnavailable && <span className={css.error} role="alert">{t('imageUnavailable')}</span>}
        </div>
      )}
      <label className={css.dimming}>
        <span>{t('dimming')}</span>
        <input
          type="range"
          min={0}
          max={90}
          step={5}
          value={section.dimming}
          onChange={(event) => { setDimming(Number(event.currentTarget.value)) }}
        />
      </label>
    </div>
  )
}
