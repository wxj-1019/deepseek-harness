/**
 * Session-header pin toggle: one star reflecting and flipping the current
 * session's membership in the pinned set. The star renders for every session
 * (pinning is a first-class affordance), filled while pinned.
 * @module @deepseek-ai/dsh-client-ui-session-pins/client/PinStar
 */

import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionPinsInjected } from './slots.ts'
import type { SessionPinsState } from './controller.ts'
import { NS } from './locales.ts'
import css from './PinStar.module.css'

/** Full props for the header pin toggle. */
export type PinStarProps =
  & PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<typeof NS>
  & Pick<SessionPinsInjected, 'ensure' | 'toggle'>
  & { usePins: SnapshotSelectorHook<SessionPinsState> }

/** Hand-drawn star matching the primitives' outline glyph vocabulary. */
export function StarGlyph({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.8 10.1 6.1l4.6.4-3.5 3.1 1 4.5L8 11.8l-4.2 2.3 1-4.5-3.5-3.1 4.6-.4L8 1.8Z"
        stroke="currentColor"
        fill={filled ? 'currentColor' : 'none'}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Header action flipping the current session's pin. The star reads the
 * shared pins snapshot; the toggle writes through the controller and the
 * pushed change converges every open window.
 * @param props - runtime slot currency, namespace copy, injected face.
 * @returns the toggle button.
 */
export function PinStar({ sessionId, usePins, ensure, toggle, t }: PinStarProps) {
  const [actionError, setActionError] = useState<string | null>(null)
  // Load at mount: the filled state must be visible without a click.
  useEffect(() => { void ensure() }, [ensure])
  const pins = usePins(current => current.sessionIds)
  const pinned = sessionId !== undefined && pins.includes(sessionId)

  /** Flip the pin and hold a failure as tooltip text instead of swallowing it. */
  const onToggle = (): void => {
    if (sessionId === undefined) return
    setActionError(null)
    void ensure()
      .then(() => toggle(sessionId))
      .then(message => setActionError(message ?? null))
  }

  return (
    <button
      type="button"
      className={pinned ? `${css.star} ${css.starOn}` : css.star}
      aria-label={pinned ? t('pin.toggle.unpin') : t('pin.toggle.pin')}
      aria-pressed={pinned}
      title={actionError ?? (pinned ? t('pin.toggle.unpin') : t('pin.toggle.pin'))}
      onClick={onToggle}
    >
      <StarGlyph filled={pinned} />
    </button>
  )
}
