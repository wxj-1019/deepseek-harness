/**
 * Vision-model settings section: one provider/model pair that routes
 * image-bearing requests, edited through the `vision-model` namespace. The
 * model list shows only models whose declared modalities include image input;
 * a model entered by hand without a declaration stays invisible here, exactly
 * as the routing gate treats it (text-only until it says otherwise). Every
 * mutation writes through the wire; the page re-renders from pushed
 * invalidations or the post-apply reload.
 */

import { useEffect, useMemo, useState } from 'react'
import type { HostObservable, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { VisionModelSettingsStore, VisionModelState } from './store.ts'
import type { en } from './locales.ts'
import styles from './VisionModelSection.module.css'

/** Injected dependencies of {@link VisionModelSection} (slot `inject`). */
export interface VisionModelSectionInjected {
  /** The page store (loaded on mount, refreshed on pushed invalidations). */
  controller: VisionModelSettingsStore
  /** Bare snapshot source; the renderer binds it into `useVisionModel`. */
  hooks: { visionModel: HostObservable<VisionModelState> }
  /** Section copy. */
  t: (key: keyof typeof en) => string
}

/**
 * Props delivered by the slot outlet: the inject face spread flat with its
 * hooks compartment bound (the renderer erases the share boundary at the
 * render call).
 */
export type VisionModelSectionProps = Partial<
  Omit<VisionModelSectionInjected, 'hooks'> & { useVisionModel: SnapshotSelectorHook<VisionModelState> }
>

/** One route option inside the section's provider select. */
interface ProviderOption {
  /** Provider route id. */
  id: string
  /** Provider display name. */
  name: string
}

/**
 * Render the vision-model routing page. Drafts start from the stored route;
 * saving writes through the wire and the store reloads, so the page always
 * reflects the host's single fact source.
 */
export function VisionModelSection(props: VisionModelSectionProps) {
  const { controller, useVisionModel, t } = props
  if (controller === undefined || useVisionModel === undefined || t === undefined) return null
  return <Loaded controller={controller} useVisionModel={useVisionModel} t={t} />
}

/** The loaded page body; hooks run only once the inject face is complete. */
function Loaded({ controller, useVisionModel, t }:
  Omit<VisionModelSectionInjected, 'hooks'> & { useVisionModel: SnapshotSelectorHook<VisionModelState> }) {
  const snapshot = useVisionModel(state => state)
  const [providerDraft, setProviderDraft] = useState<string>('')
  const [modelDraft, setModelDraft] = useState<string>('')
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { void controller.load() }, [controller])

  const current = snapshot.current
  const provider = providerDraft || current?.provider || ''
  const model = modelDraft || current?.model || ''
  const groups = snapshot.groups
  const providers: ProviderOption[] = useMemo(
    () => groups.map(group => ({ id: group.id, name: group.name })),
    [groups],
  )
  const models = useMemo(
    () => groups.find(group => group.id === provider)?.models ?? [],
    [groups, provider],
  )
  const configured = current !== null
  const dirty = (providerDraft !== '' || modelDraft !== '')
    && (providerDraft !== (current?.provider ?? '') || modelDraft !== (current?.model ?? ''))

  const save = async (): Promise<void> => {
    if (provider === '' || model === '') return
    setBusy(true)
    setNotice(null)
    const failure = await controller.save(provider, model)
    setBusy(false)
    if (failure !== undefined) {
      setNotice(t('conflict'))
      return
    }
    setProviderDraft('')
    setModelDraft('')
    setNotice(t('saved'))
  }

  const clear = async (): Promise<void> => {
    setBusy(true)
    setNotice(null)
    const failure = await controller.clear()
    setBusy(false)
    if (failure !== undefined) {
      setNotice(t('conflict'))
      return
    }
    setProviderDraft('')
    setModelDraft('')
  }

  const disabled = snapshot.status !== 'ready' || !snapshot.writable || busy
  const providerChange = (next: string): void => {
    setProviderDraft(next)
    setModelDraft('')
  }

  return (
    <div className={styles.section}>
      <p className={styles.hint}>{configured ? t('configuredHint') : t('unconfiguredHint')}</p>
      {snapshot.status === 'error' ? (
        <p className={styles.error}>{snapshot.error ?? t('loadFailed')}</p>
      ) : snapshot.status === 'ready' && groups.length === 0 ? (
        <p className={styles.error}>{t('noImageModels')}</p>
      ) : (
        <>
          <label className={styles.field}>
            <span className={styles.label}>{t('provider')}</span>
            <select
              className={styles.select}
              value={provider}
              disabled={disabled}
              onChange={(event) => { providerChange(event.target.value) }}
            >
              <option value="" disabled>{t('emptyProvider')}</option>
              {providers.map(entry => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('model')}</span>
            <select
              className={styles.select}
              value={model}
              disabled={disabled || provider === ''}
              onChange={(event) => { setModelDraft(event.target.value) }}
            >
              <option value="" disabled>{t('emptyModel')}</option>
              {models.map(entry => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
            </select>
          </label>
          <div className={styles.actions}>
            <Button
              variant="primary"
              disabled={disabled || !dirty}
              onClick={() => { void save() }}
            >
              {t('save')}
            </Button>
            {configured && (
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => { void clear() }}
              >
                {t('clear')}
              </Button>
            )}
          </div>
        </>
      )}
      {!snapshot.writable && snapshot.status === 'ready' && (
        <p className={styles.error}>{t('readOnly')}</p>
      )}
      {notice !== null && <p className={styles.notice}>{notice}</p>}
    </div>
  )
}
