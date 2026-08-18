/** General Settings row: the completion-notification opt-in and its permission flow. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PermissionState } from './desktop-notify.ts'
import css from './NotificationRow.module.css'

/** Registration-side row face. */
export interface NotificationRowInjected {
  hooks: {
    /** Durable opt-in replica bound as useEnabled. */
    enabled: SnapshotStore<boolean>
    /** Whether the row may write, bound as useEditable. */
    editable: SnapshotStore<boolean>
  }
  /** Flip the durable opt-in. */
  setEnabled: (next: boolean) => void
  /** Read the browser permission state ('unsupported' without the API). */
  permission: () => PermissionState
  /** Ask the browser for permission; undefined when the API is absent. */
  requestPermission: () => Promise<NotificationPermission> | undefined
}

/** Full Settings-row props. */
export type NotificationRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.desktopNotify'>
  & InjectFace<NotificationRowInjected>

/**
 * Render the completion-notification row: turning it on with the permission
 * still 'default' asks the browser first and only persists on 'granted'.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function NotificationRow({ useEnabled, useEditable, setEnabled, permission, requestPermission, t }: NotificationRowProps) {
  const enabled = useEnabled(value => value)
  const editable = useEditable(value => value)
  const perm = permission()

  const toggle = (): void => {
    /* v8 ignore next -- the disabled control cannot be activated; the guard
       is defense-in-depth against the handler firing before the store settles. */
    if (!editable) return
    if (enabled) {
      setEnabled(false)
      return
    }
    if (perm === 'granted') {
      setEnabled(true)
      return
    }
    if (perm === 'default') {
      void requestPermission()?.then((result) => {
        // A denial leaves the row off; the permission hint stays the guide.
        if (result === 'granted') setEnabled(true)
      })
    }
  }

  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('rowTitle')}</div>
        <div className={css.desc}>{t('rowDescription')}</div>
        {perm === 'denied' && <div className={css.hint}>{t('permissionDenied')}</div>}
        {perm === 'unsupported' && <div className={css.hint}>{t('unsupported')}</div>}
      </div>
      <button
        type="button"
        className={css.toggle}
        aria-pressed={enabled}
        aria-label={t('rowTitle')}
        disabled={!editable}
        onClick={toggle}
      >
        <span className={css.check}>{enabled ? '✓' : ''}</span>
        {enabled ? t('on') : t('off')}
      </button>
    </div>
  )
}
