/**
 * The overlay panel for the notification center: shell.overlay's first
 * occupant, a fixed corner card listing durable entries newest-first. Rows
 * open their session on click and carry a per-row read marker; the header
 * offers mark-all-read and clear-read.
 * @module @deepseek-ai/dsh-client-ui-notification-center/client/NotificationPanel
 */

import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  IconCheckOutline14, IconCloseOutline16, IconRefreshOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { NotificationKind, NotificationRecord } from '@deepseek-ai/dsh-notification-center/types'
import type { NotificationCenterInjected } from './slots.ts'
import type { NotificationsState } from './controller.ts'
import { NS } from './locales.ts'
import css from './NotificationPanel.module.css'

/** Full props for the overlay panel. */
export type NotificationPanelProps =
  & PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & Pick<NotificationCenterInjected, 'close' | 'markRead' | 'markAllRead' | 'clearRead' | 'openSession'>
  & { useNotifications: SnapshotSelectorHook<NotificationsState> }

/** Kind label text for one entry. */
function kindLabel(kind: NotificationKind, t: NotificationPanelProps['t']): string {
  switch (kind) {
    case 'session-completed': return t('kind.session-completed')
    case 'approval-decided': return t('kind.approval-decided')
    case 'job-finished': return t('kind.job-finished')
    case 'reminder-dispatched': return t('kind.reminder-dispatched')
    /* v8 ignore next -- closed wire kind union */
    default: return kind satisfies never
  }
}

/** Local clock label for one entry. */
function timeLabel(createdAt: number): string {
  const date = new Date(createdAt)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * The overlay panel rendering the center's entries.
 * @param props - runtime slot currency, namespace copy, injected face.
 * @returns the card, or null while closed.
 */
export function NotificationPanel(props: NotificationPanelProps) {
  const { useSessions, useNotifications, close, markRead, markAllRead, clearRead, openSession, t } = props
  const items = useNotifications(current => current.items)
  const open = useNotifications(current => current.open)
  const error = useNotifications(current => current.error)
  // Standard kit hooks run at the top of the component; never inside a helper.
  const sessionsById = useSessions(current => current.byId)
  const [actionError, setActionError] = useState<string | null>(null)

  /** Run one verb and surface its rejection text until the next action. */
  const run = (pending: Promise<string | undefined>): void => {
    setActionError(null)
    void pending.then(message => setActionError(message ?? null))
  }

  /** Escape closes the panel. */
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') close()
  }

  if (!open) return null

  const sessionTitleOf = (item: NotificationRecord): string | null => {
    if (item.sessionId === undefined) return null
    return sessionsById[item.sessionId]?.displayTitle ?? null
  }

  const unread = items.filter(item => item.readAt === undefined).length
  const read = items.length - unread

  return (
    // The overlay layer is click-through; the card opts back into pointer events.
    <section className={css.card} aria-label={t('panel.aria')} onKeyDown={onKeyDown}>
      <header className={css.head}>
        <strong>{t('panel.aria')}</strong>
        <button type="button" className={css.action} onClick={() => { run(markAllRead()) }}>
          {t('panel.markAllRead')}
        </button>
        <button type="button" className={css.action} onClick={() => { run(clearRead()) }}>
          {t('panel.clearRead')}
        </button>
        <button type="button" className={css.iconAction} aria-label={t('panel.close')} onClick={close}>
          <IconCloseOutline16 />
        </button>
      </header>

      {error !== null && <p className={css.error}>{error}</p>}
      {actionError !== null && <p className={css.error}>{actionError}</p>}

      <ul className={css.list}>
        {items.length === 0 && <li className={css.empty}>{t('panel.empty')}</li>}
        {items.map((item) => {
          const title = sessionTitleOf(item) ?? item.title
          return (
            <li key={item.id} className={item.readAt === undefined ? `${css.row} ${css.unread}` : css.row}>
              <button
                type="button"
                className={css.rowMain}
                onClick={() => {
                  if (item.readAt === undefined) run(markRead(item.id))
                  if (item.sessionId !== undefined) openSession(item.sessionId)
                }}
              >
                <span className={css.kind}>{kindLabel(item.kind, t)}</span>
                <span className={css.title}>{title}</span>
                {item.detail !== undefined && <span className={css.detail}>{item.detail}</span>}
                <span className={css.time}>{timeLabel(item.createdAt)}</span>
              </button>
              {item.readAt === undefined && (
                <button
                  type="button"
                  className={css.iconAction}
                  aria-label={t('row.markRead')}
                  title={t('row.markRead')}
                  onClick={() => { run(markRead(item.id)) }}
                >
                  <IconCheckOutline14 />
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <footer className={css.foot}>
        <span className={css.counts}>{unread > 0 ? t('bell.unread', { count: unread }) : ''}</span>
        {read > 0 && (
          <button type="button" className={css.action} onClick={() => { run(clearRead()) }}>
            <IconRefreshOutline14 />
          </button>
        )}
      </footer>
    </section>
  )
}
