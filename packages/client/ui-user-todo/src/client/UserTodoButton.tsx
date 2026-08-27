/**
 * Sidebar-foot daily-todo entry: trigger button plus popover panel. The panel
 * derives its today view client-side (open items carried over, plus items
 * completed today), keeps a collapsible earlier-completed history, and links
 * rows to a workspace and one of its sessions — the session opens on demand
 * through the standard sessions kit.
 * @module @deepseek-ai/dsh-client-ui-user-todo/client/UserTodoButton
 */

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  IconCheckOutline14, IconCloseOutline16, IconPlusOutline16, IconRightUpOutline16,
  IconTrashOutline16, useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { UserTodoId, UserTodoRecord } from '@deepseek-ai/dsh-user-todo/types'
import type { UserTodoState } from './controller.ts'
import type { UserTodoInjected } from './slots.ts'
import { localDayKey } from './day.ts'
import { earlierCompleted, todayItems } from './view.ts'
import { NS } from './locales.ts'
import css from './UserTodoButton.module.css'

/** Full props for the sidebar-foot entry. */
export type UserTodoButtonProps =
  & PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<typeof NS>
  & Pick<UserTodoInjected, 'ensure' | 'resync' | 'add' | 'toggle' | 'retitle' | 'setWorkspaceLink' | 'setSessionLink' | 'openSession' | 'remove'>
  & { useTodo: SnapshotSelectorHook<UserTodoState> }

/**
 * Sidebar-foot action rendering the Today's-todos trigger and its panel.
 * @param props - runtime slot currency, namespace copy, injected controller face.
 * @returns the trigger and its popover list.
 */
export function UserTodoButton(props: UserTodoButtonProps) {
  const {
    wide, useSessions, useWorkspaces, useTodo, t,
    ensure, add, toggle, retitle, setWorkspaceLink, setSessionLink, openSession, remove,
  } = props
  const actions = { ensure, add, toggle, retitle, setWorkspaceLink, setSessionLink, openSession, remove }
  /** Run one verb and surface its rejection text until the next action. */
  const run = (pending: Promise<string | undefined>): void => {
    setActionError(null)
    void pending.then(message => setActionError(message ?? null))
  }
  const state = useTodo(current => current)
  const workspaces = useWorkspaces(current => current.items)
  const sessionsById = useSessions(current => current.byId)
  const archivedSessionIds = useWorkspaces(current => current.archivedSessionIds)
  const [open, setOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: UserTodoId; text: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const pendingCount = state.items.reduce((count, item) => count + (item.done ? 0 : 1), 0)
  // Recomputed per render of the open panel: the wall clock decides "today",
  // and midnight crossings must not wait for a data change.
  const rows = open ? todayItems(state.items, Date.now()) : []
  const earlier = open ? earlierCompleted(state.items, Date.now()) : []

  useDismissOnOutsidePointer(rootRef, open, setOpen)

  /** Escape closes the open panel, matching the other footer popovers. */
  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && open) setOpen(false)
  }

  /** Open the panel and pull the list once. */
  const openPanel = (): void => {
    setOpen(true)
    void actions.ensure()
  }

  /** Commit the composer input as a new item. */
  const submitDraft = (): void => {
    const title = draft.trim()
    if (title.length === 0) return
    setDraft('')
    run(actions.add(title))
  }

  /** Commit the inline editor of one row. */
  const commitEdit = (): void => {
    if (editing === null) return
    const { id, text } = editing
    setEditing(null)
    if (text.trim().length > 0 && text !== state.items.find(item => item.id === id)?.title) {
      run(actions.retitle(id, text))
    }
  }

  /**
   * Human label for a session option: the list row's display title, falling
   * back to the short id before the host projects a title.
   */
  const sessionLabel = (sessionId: string): string => {
    const summary = sessionsById[sessionId as keyof typeof sessionsById]
    return summary === undefined ? sessionId.slice(0, 8) : summary.displayTitle
  }

  /** The linked workspace's accounted, non-archived session ids. */
  const sessionOptionsOf = (item: UserTodoRecord): readonly string[] => {
    if (item.workspaceId === undefined) return []
    const workspace = workspaces.find(candidate => candidate.workspaceId === item.workspaceId)
    const archived = new Set(archivedSessionIds as readonly string[])
    return (workspace?.sessionIds ?? []).filter(id => !archived.has(id as string))
  }

  /** One todo row: check, title (or editor), session affordances, delete. */
  const renderRow = (item: UserTodoRecord, opts: { readonly showDate?: boolean } = {}): ReactNode => {
    const options = sessionOptionsOf(item)
    const linkedSession = item.sessionId
    return (
      <li key={item.id} className={item.done ? `${css.row} ${css.rowDone}` : css.row}>
        <button
          type="button"
          className={css.check}
          aria-label={item.done ? t('row.check.undo') : t('row.check.done')}
          onClick={() => run(actions.toggle(item.id, !item.done))}
        >
          {item.done && <IconCheckOutline14 />}
        </button>
        {opts.showDate === true && item.completedAt !== undefined && (
          <span className={css.date}>{localDayKey(item.completedAt)}</span>
        )}
        {editing?.id === item.id
          ? (
            <input
              className={css.editInput}
              value={editing.text}
              autoFocus
              aria-label={t('row.edit')}
              onChange={(event) => { setEditing({ id: editing.id, text: event.target.value }) }}
              onBlur={commitEdit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitEdit()
                if (event.key === 'Escape') setEditing(null)
              }}
            />
          )
          : (
            <button
              type="button"
              className={css.title}
              onClick={() => setEditing({ id: item.id, text: item.title })}
            >
              {item.title}
            </button>
          )}
        {linkedSession !== undefined && (
          <button
            type="button"
            className={css.iconAction}
            aria-label={t('row.open')}
            title={t('row.open')}
            onClick={() => openSession(linkedSession)}
          >
            <IconRightUpOutline16 />
          </button>
        )}
        <select
          className={css.linkSelect}
          aria-label={t('link.label')}
          value={item.workspaceId ?? ''}
          onChange={(event) => {
            const value = event.target.value
            run(actions.setWorkspaceLink(item.id, value === '' ? undefined : value))
          }}
        >
          <option value="">{t('link.none')}</option>
          {workspaces.map(workspace => (
            <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.title}</option>
          ))}
        </select>
        {item.workspaceId !== undefined && (
          <select
            className={css.linkSelect}
            aria-label={t('session.label')}
            value={item.sessionId ?? ''}
            onChange={(event) => {
              const value = event.target.value
              run(actions.setSessionLink(item.id, value === '' ? undefined : value))
            }}
          >
            <option value="">{t('session.none')}</option>
            {options.map(sessionId => (
              <option key={sessionId} value={sessionId}>{sessionLabel(sessionId)}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          className={css.iconAction}
          aria-label={t('row.delete')}
          onClick={() => run(actions.remove(item.id))}
        >
          <IconTrashOutline16 />
        </button>
      </li>
    )
  }

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onRootKeyDown}>
      <button
        type="button"
        className={wide ? css.triggerWide : css.triggerRail}
        aria-label={t('button.aria')}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        <IconCheckOutline14 />
        {wide && (
          <>
            <span>{t('button.label')}</span>
            {pendingCount > 0 && <span className={css.count}>{t('count.pending', { count: pendingCount })}</span>}
          </>
        )}
        {!wide && pendingCount > 0 && <span className={css.badge} aria-hidden="true">{pendingCount}</span>}
      </button>

      {open && (
        <section className={css.panel} aria-label={t('panel.aria')}>
          <header className={css.panelHead}>
            <strong>{t('button.label')}</strong>
            {pendingCount > 0 && <span className={css.count}>{t('count.pending', { count: pendingCount })}</span>}
            <button type="button" className={css.iconAction} aria-label={t('panel.close')} onClick={() => setOpen(false)}>
              <IconCloseOutline16 />
            </button>
          </header>

          <form
            className={css.composer}
            onSubmit={(event) => {
              event.preventDefault()
              submitDraft()
            }}
          >
            <input
              className={css.input}
              value={draft}
              placeholder={t('add.placeholder')}
              onChange={(event) => { setDraft(event.target.value) }}
              aria-label={t('add.placeholder')}
            />
            <button type="submit" className={css.iconAction} aria-label={t('add.submit')}>
              <IconPlusOutline16 />
            </button>
          </form>

          {state.error !== null && <p className={css.error}>{t('error.load', { message: state.error })}</p>}
          {actionError !== null && <p className={css.error}>{t('error.action', { message: actionError })}</p>}

          <ul className={css.list}>
            {rows.length === 0 && <li className={css.empty}>{t('panel.empty')}</li>}
            {rows.map(item => renderRow(item))}
          </ul>

          {earlier.length > 0 && (
            <>
              <button
                type="button"
                className={css.historyToggle}
                onClick={() => setShowHistory(value => !value)}
              >
                {t('history.toggle', { count: earlier.length })}
              </button>
              {showHistory && <ul className={css.list}>{earlier.map(item => renderRow(item, { showDate: true }))}</ul>}
            </>
          )}
        </section>
      )}
    </div>
  )
}
