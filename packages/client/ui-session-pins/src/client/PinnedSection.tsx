/**
 * Sidebar pinned section: the user's pinned sessions in pin order, each a
 * click-through row with an unpin affordance. Renders nothing while the set
 * is empty (or unloaded) so the sidebar never advertises an empty block.
 * @module @deepseek-ai/dsh-client-ui-session-pins/client/PinnedSection
 */

import { useEffect, useState } from 'react'
import { IconCloseFill14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionPinsInjected } from './slots.ts'
import type { SessionPinsState } from './controller.ts'
import { NS } from './locales.ts'
import css from './PinnedSection.module.css'

/** Full props for the sidebar pinned section. */
export type PinnedSectionProps =
  & PropsRuntime<'sidebar.pinned'>
  & PropsLocale<typeof NS>
  & Pick<SessionPinsInjected, 'ensure' | 'unpin' | 'openSession'>
  & { usePins: SnapshotSelectorHook<SessionPinsState> }

/**
 * The pinned-session section between the sidebar controls and the browser.
 * @param props - runtime slot currency, namespace copy, injected face.
 * @returns the section, or null when there is nothing to show.
 */
export function PinnedSection(props: PinnedSectionProps) {
  const { wide, expandSidebar, useSessions, useWorkspaces, usePins, ensure, unpin, openSession, t } = props
  const [actionError, setActionError] = useState<string | null>(null)
  // Load at mount: the section exists to be seen, not to be opened.
  useEffect(() => { void ensure() }, [ensure])
  const pins = usePins(current => current.sessionIds)
  const sessionsById = useSessions(current => current.byId)
  const archived = useWorkspaces(current => current.archivedSessionIds)

  const archivedSet = new Set<string>(archived)
  const visible = pins.filter(id => !archivedSet.has(id as string))
  if (visible.length === 0) return null

  /** Rail mode: expand first so rows get their full width. */
  const openFromSection = (sessionId: typeof pins[number]): void => {
    if (!wide) expandSidebar()
    openSession(sessionId)
  }

  return (
    <section className={css.section} aria-label={t('section.label')}>
      <header className={css.head}>{t('section.label')}</header>
      {actionError !== null && <p className={css.error}>{actionError}</p>}
      <ul className={css.list}>
        {visible.map((sessionId) => {
          const summary = sessionsById[sessionId]
          return (
            <li key={sessionId} className={css.row}>
              <button
                type="button"
                className={css.title}
                title={summary?.displayTitle}
                onClick={() => openFromSection(sessionId)}
              >
                {summary?.displayTitle ?? String(sessionId).slice(0, 8)}
              </button>
              <button
                type="button"
                className={css.unpin}
                aria-label={t('row.unpin')}
                title={t('row.unpin')}
                onClick={() => {
                  setActionError(null)
                  void ensure()
                    .then(() => unpin(sessionId))
                    .then(message => setActionError(message ?? null))
                }}
              >
                <IconCloseFill14 />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
