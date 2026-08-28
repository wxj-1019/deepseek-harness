/**
 * Footer bell for the notification center: unread badge over a quiet icon,
 * toggling the shared overlay panel. Reads the shared snapshot only.
 * @module @deepseek-ai/dsh-client-ui-notification-center/client/NotificationBell
 */

import { useEffect } from 'react'
import type { PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { NotificationCenterInjected } from './slots.ts'
import type { NotificationsState } from './controller.ts'
import { NS } from './locales.ts'
import css from './NotificationBell.module.css'

/** Full props for the footer bell. */
export type NotificationBellProps =
  & PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<typeof NS>
  & Pick<NotificationCenterInjected, 'ensure' | 'toggleOpen'>
  & { useNotifications: SnapshotSelectorHook<NotificationsState> }

/** Hand-drawn bell matching the primitives' outline glyph vocabulary. */
export function BellGlyph({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.6a4.4 4.4 0 0 0-4.4 4.4v2.4L2 10.6v1.2h12v-1.2l-1.6-2.2V6A4.4 4.4 0 0 0 8 1.6Zm0 12.6a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2Z"
        stroke="currentColor"
        fill={active ? 'currentColor' : 'none'}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Footer action rendering the bell; unread count rides the badge.
 * @param props - runtime slot currency, namespace copy, injected face.
 * @returns the trigger button.
 */
export function NotificationBell({ wide, useNotifications, ensure, toggleOpen, t }: NotificationBellProps) {
  // Load at mount: the badge must light without a click.
  useEffect(() => { void ensure() }, [ensure])
  const items = useNotifications(current => current.items)
  const open = useNotifications(current => current.open)
  const unread = items.reduce((count, item) => count + (item.readAt === undefined ? 1 : 0), 0)

  return (
    <button
      type="button"
      className={wide ? css.bellWide : css.bellRail}
      aria-label={`${t('bell.aria')}${unread > 0 ? ` · ${t('bell.unread', { count: unread })}` : ''}`}
      aria-expanded={open}
      onClick={() => {
        void ensure()
        toggleOpen()
      }}
    >
      <BellGlyph active={unread > 0} />
      {wide && <span>{t('bell.aria')}</span>}
      {unread > 0 && <span className={css.badge} aria-hidden="true">{unread}</span>}
    </button>
  )
}
