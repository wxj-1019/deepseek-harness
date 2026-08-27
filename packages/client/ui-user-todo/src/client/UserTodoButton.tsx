/**
 * Sidebar-foot daily-todo entry: trigger button plus popover panel. The panel
 * derives its today view client-side (open items carried over, plus items
 * completed today), so the Host stays a flat durable set.
 * @module @deepseek-ai/dsh-client-ui-user-todo/client/UserTodoButton
 */

import { useRef, useState, type KeyboardEvent } from 'react'
import {
  IconCheckOutline14, IconCloseOutline16, IconPlusOutline16, IconTrashOutline16,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { UserTodoId, UserTodoRecord } from '@deepseek-ai/dsh-user-todo/types'
import type { UserTodoState } from './controller.ts'
import type { UserTodoInjected } from './slots.ts'
import { sameLocalDay } from './day.ts'
import { NS } from './locales.ts'
import css from './UserTodoButton.module.css'

/** Full props for the sidebar-foot entry. */
export type UserTodoButtonProps =
  & PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<typeof NS>
  & Pick<UserTodoInjected, 'ensure' | 'resync' | 'add' | 'toggle' | 'retitle' | 'setWorkspaceLink' | 'remove'>
  & { useTodo: SnapshotSelectorHook<UserTodoState> }

/**
 * The items the today view shows: every open item (carried over from
 * whichever day it was created) first in creation order, then the items
 * completed today newest-first.
 * @param items - the whole durable list.
 * @param nowMs - current epoch instant bounding "today".
 * @returns open items and today's completions, concatenated display-ready.
 */
export function todayItems(items: readonly UserTodoRecord[], nowMs: number): readonly UserTodoRecord[] {
  const pending: UserTodoRecord[] = []
  let completedToday: UserTodoRecord[] = []
  for (const item of items) {
    if (!item.done) pending.push(item)
    else if (item.completedAt !== undefined && sameLocalDay(item.completedAt, nowMs)) completedToday.push(item)
  }
  completedToday = completedToday.sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0))
  return [...pending, ...completedToday]
}

/**
 * Sidebar-foot action rendering the Today's-todos trigger and its panel.
 * @param props - runtime slot currency, namespace copy, injected controller face.
 * @returns the trigger and its popover list.
 */
export function UserTodoButton(props: UserTodoButtonProps) {
  const {
    wide, useWorkspaces, useTodo, t,
    ensure, add, toggle, retitle, setWorkspaceLink, remove,
  } = props
  const actions = { ensure, add, toggle, retitle, setWorkspaceLink, remove }
  /** Run one verb and surface its rejection text until the next action. */
  const run = (pending: Promise<string | undefined>): void => {
    setActionError(null)
    void pending.then(message => setActionError(message ?? null))
  }
  const state = useTodo(current => current)
  const workspaces = useWorkspaces(current => current.items)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: UserTodoId; text: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const pendingCount = state.items.reduce((count, item) => count + (item.done ? 0 : 1), 0)
  // Recomputed per render of the open panel: the wall clock decides "today",
  // and midnight crossings must not wait for a data change.
  const rows = open ? todayItems(state.items, Date.now()) : []

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
            {rows.map(item => (
              <li key={item.id} className={item.done ? `${css.row} ${css.rowDone}` : css.row}>
                <button
                  type="button"
                  className={css.check}
                  aria-label={item.done ? t('row.check.undo') : t('row.check.done')}
                  onClick={() => run(actions.toggle(item.id, !item.done))}
                >
                  {item.done && <IconCheckOutline14 />}
                </button>
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
                <button
                  type="button"
                  className={css.iconAction}
                  aria-label={t('row.delete')}
                  onClick={() => run(actions.remove(item.id))}
                >
                  <IconTrashOutline16 />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
