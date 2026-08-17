/**
 * Dev-checks settings section: the six per-machine quality-gate switches over
 * the `dev-checks` namespace. The page is a pure projection of the bound
 * SettingsScope snapshot; every flip queues one field write through the wire.
 */

import { useMemo, useSyncExternalStore } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { DEV_CHECKS_SETTINGS_DEFAULTS, type DevChecksSettings } from '../dev-checks-settings.ts'
import type { en } from './locales.ts'
import styles from './DevChecksSection.module.css'

/** Injected dependencies of {@link DevChecksSection} (slot `inject`). */
export interface DevChecksSectionInjected {
  /** Bound settings scope of the dev-checks namespace. */
  scope: SettingsScope<DevChecksSettings>
  /** Section copy. */
  t: (key: keyof typeof en) => string
}

/**
 * Props delivered by the slot outlet: the inject face spread flat (the
 * renderer erases the share boundary at the render call).
 */
export type DevChecksSectionProps = Partial<DevChecksSectionInjected>

/** Toggle row order is the declaration order of the shipped defaults. */
const FIELDS = Object.keys(DEV_CHECKS_SETTINGS_DEFAULTS) as (keyof DevChecksSettings)[]

/**
 * Render the dev-checks page. Hooks wait for the complete inject face, which
 * the slot outlet spreads lazily.
 */
export function DevChecksSection(props: DevChecksSectionProps) {
  const { scope, t } = props
  if (scope === undefined || t === undefined) return null
  return <Loaded scope={scope} t={t} />
}

/** The page body; hooks run only once the inject face is complete. */
function Loaded({ scope, t }: DevChecksSectionInjected) {
  // The contract's methods read through `this`; bind once so uSES keeps a
  // stable subscribe/getSnapshot pair across renders.
  const subscribe = useMemo(() => (listener: () => void) => scope.subscribe(listener), [scope])
  const getSnapshot = useMemo(() => () => scope.getSnapshot(), [scope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  const value = snapshot.value ?? DEV_CHECKS_SETTINGS_DEFAULTS
  const writable = snapshot.status === 'ready' && snapshot.writable

  return (
    <div className={styles.section}>
      <p className={styles.hint}>{t('pageHint')}</p>
      {snapshot.status === 'unavailable' ? <p className={styles.error}>{t('unavailable')}</p> : null}
      {snapshot.status === 'ready' && !snapshot.writable ? <p className={styles.hint}>{t('readOnly')}</p> : null}
      {FIELDS.map(field => (
        <div className={styles.row} key={field}>
          <div className={styles.rowText}>
            <span className={styles.rowLabel}>{t(`${field}.label`)}</span>
            <span className={styles.rowDescription}>{t(`${field}.description`)}</span>
          </div>
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={value[field]}
            aria-label={t(`${field}.label`)}
            disabled={!writable}
            onClick={() => { void scope.set(field, !value[field]) }}
          >
            <span className={styles.check}>{value[field] ? '✓' : ''}</span>
            {value[field] ? t('on') : t('off')}
          </button>
        </div>
      ))}
    </div>
  )
}
