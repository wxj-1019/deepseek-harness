/**
 * Right-edge daily-todo drawer: a slim always-visible tab on the right edge
 * of the frame; clicking it slides the today panel out over the details
 * column. The list is a compact row per item; clicking a row expands a
 * detail card carrying the full content — title, due editor, and
 * project/session links.
 * @module @deepseek-ai/dsh-client-ui-user-todo/client/UserTodoButton
 */

import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the workspace standard-kit merge (useWorkspaces).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  IconCheckOutline14, IconChevronDownOutline14, IconCloseOutline16, IconPlusOutline16,
  IconTrashOutline16, useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { UserTodoId, UserTodoRecord } from '@deepseek-ai/dsh-user-todo/types'
import type { UserTodoState } from './controller.ts'
import type { UserTodoInjected } from './slots.ts'
import { formatDueLabel, localDayKey, toLocalInputValue } from './day.ts'
import { earlierCompleted, todayItems } from './view.ts'
import { CardSelect } from './CardSelect.tsx'
import { NS } from './locales.ts'
import css from './UserTodoButton.module.css'

/** Full props for the right-edge drawer entry. */
export type TodoDrawerProps =
  & PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & Pick<UserTodoInjected, 'ensure' | 'resync' | 'add' | 'toggle' | 'retitle' | 'setWorkspaceLink' | 'setSessionLink' | 'openSession' | 'setDue' | 'remove'>
  & { useTodo: SnapshotSelectorHook<UserTodoState> }

/**
 * Right-edge entry rendering the Today's-todos tab and its drawer panel.
 * @param props - runtime slot currency, namespace copy, injected controller face.
 * @returns the tab and the drawer.
 */
export function TodoDrawer(props: TodoDrawerProps) {
  const {
    useSessions, useWorkspaces, useTodo, t,
    ensure, add, toggle, retitle, setWorkspaceLink, setSessionLink, openSession, setDue, remove,
  } = props
  const actions = { ensure, add, toggle, retitle, setWorkspaceLink, setSessionLink, setDue, remove }
  /** Business-rejection codes the Host can return, mapped to locale keys. */
  const ERROR_CODES = {
    'title-blank': 'error.code.title-blank',
    'item-not-found': 'error.code.item-not-found',
    'workspace-not-found': 'error.code.workspace-not-found',
    'session-link-without-workspace': 'error.code.session-link-without-workspace',
    'session-not-in-workspace': 'error.code.session-not-in-workspace',
  } as const
  /** Run one verb and surface its rejection text until the next action. */
  const run = (pending: Promise<string | undefined>): void => {
    setActionError(null)
    void pending.then((message) => {
      if (message === undefined) {
        setActionError(null)
        return
      }
      if (message.startsWith('code:')) {
        const code = message.slice(5) as keyof typeof ERROR_CODES
        const key = ERROR_CODES[code]
        setActionError(key === undefined ? code : t(key))
        return
      }
      setActionError(message)
    })
  }
  const state = useTodo(current => current)
  const workspaces = useWorkspaces(current => current.items)
  const sessionsById = useSessions(current => current.byId)
  const archivedSessionIds = useWorkspaces(current => current.archivedSessionIds)
  const [open, setOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [draft, setDraft] = useState('')
  const [expandedId, setExpandedId] = useState<UserTodoId | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [openPickers, setOpenPickers] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const pendingCount = state.items.reduce((count, item) => count + (item.done ? 0 : 1), 0)
  // Recomputed per render of the open drawer: the wall clock decides "today",
  // and midnight crossings must not wait for a data change.
  const rows = open ? todayItems(state.items, Date.now()) : []
  const earlier = open ? earlierCompleted(state.items, Date.now()) : []

  // An open dropdown's menu is portaled outside this root; suspending the
  // outside-pointer dismissal while it is up keeps the pick from reading as
  // an outside click that would close the whole drawer.
  useDismissOnOutsidePointer(rootRef, open && openPickers === 0, setOpen)

  /** Escape closes the open drawer (the tab keeps its place). */
  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && open) setOpen(false)
  }

  /** Open the drawer and pull the list once. */
  const openDrawer = (): void => {
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

  /** The linked workspace's accounted, non-archived session ids. */
  const sessionOptionsOf = (item: UserTodoRecord): readonly string[] => {
    if (item.workspaceId === undefined) return []
    const workspace = workspaces.find(candidate => candidate.workspaceId === item.workspaceId)
    const archived = new Set<string>(archivedSessionIds as readonly string[])
    return (workspace?.sessionIds ?? []).filter(id => !archived.has(id as string))
  }

  /** One compact row; clicking the title toggles its expanded detail card. */
  const renderRow = (item: UserTodoRecord): ReactNode => {
    const expanded = expandedId === item.id
    const overdue = item.dueAt !== undefined && item.dueAt < Date.now()
    const linkedSession = item.sessionId
    return (
      <li key={item.id} className={item.done ? `${css.row} ${css.rowDone}` : css.row}>
        <div className={css.rowLine}>
          <button
            type="button"
            className={css.check}
            aria-label={item.done ? t('row.check.undo') : t('row.check.done')}
            onClick={() => run(actions.toggle(item.id, !item.done))}
          >
            {item.done && <IconCheckOutline14 />}
          </button>
          <button
            type="button"
            className={expanded ? `${css.title} ${css.titleOpen}` : css.title}
            aria-expanded={expanded}
            onClick={() => setExpandedId(current => (current === item.id ? null : item.id))}
          >
            {item.title}
            {item.dueAt !== undefined && (
              <span className={overdue ? `${css.dueChip} ${css.dueOverdue}` : css.dueChip}>
                {formatDueLabel(item.dueAt)}
              </span>
            )}
          </button>
          <button
            type="button"
            className={css.chevron}
            aria-label={t('row.detail')}
            aria-expanded={expanded}
            onClick={() => setExpandedId(current => (current === item.id ? null : item.id))}
          >
            <IconChevronDownOutline14 />
          </button>
          <button
            type="button"
            className={css.iconAction}
            aria-label={t('row.delete')}
            onClick={() => run(actions.remove(item.id))}
          >
            <IconTrashOutline16 />
          </button>
        </div>
        {expanded && (
          <div className={css.detailCard}>
            {/* A textarea, not an input: inputs never wrap, so a long todo
               could only scroll sideways instead of showing its content. */}
            <textarea
              className={css.cardTitle}
              defaultValue={item.title}
              rows={1}
              aria-label={t('row.edit')}
              placeholder={t('row.edit')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  const value = event.currentTarget.value.trim()
                  if (value.length > 0 && value !== item.title) run(actions.retitle(item.id, value))
                  event.currentTarget.blur()
                }
                if (event.key === 'Escape') event.currentTarget.blur()
              }}
              onBlur={(event) => {
                const value = event.currentTarget.value.trim()
                if (value.length > 0 && value !== item.title) run(actions.retitle(item.id, value))
              }}
            />
            <div className={css.cardRow}>
              <span className={css.cardLabel}>{t('due.open')}</span>
              <input
                type="datetime-local"
                className={css.cardInput}
                value={item.dueAt === undefined ? '' : toLocalInputValue(item.dueAt)}
                aria-label={t('due.open')}
                onChange={(event) => {
                  const value = event.target.value
                  run(actions.setDue(item.id, value === '' ? null : Date.parse(value)))
                }}
              />
              {item.dueAt !== undefined && (
                <button
                  type="button"
                  className={css.cardClear}
                  aria-label={t('due.clear')}
                  onClick={() => run(actions.setDue(item.id, null))}
                >
                  {t('due.clear')}
                </button>
              )}
            </div>
            <div className={css.cardRow}>
              <span className={css.cardLabel}>{t('link.label')}</span>
              <CardSelect
                ariaLabel={t('link.label')}
                value={item.workspaceId ?? ''}
                options={[
                  { value: '', label: t('link.none') },
                  ...workspaces.map(workspace => ({ value: workspace.workspaceId, label: workspace.title })),
                ]}
                onSelect={(picked) => {
                  run(actions.setWorkspaceLink(item.id, picked === '' ? undefined : picked))
                }}
                onOpenChange={(pickerOpen) => { setOpenPickers(count => Math.max(0, count + (pickerOpen ? 1 : -1))) }}
              />
            </div>
            {item.workspaceId !== undefined && (
              <div className={css.cardRow}>
                <span className={css.cardLabel}>{t('session.label')}</span>
                <CardSelect
                  ariaLabel={t('session.label')}
                  value={item.sessionId ?? ''}
                  options={[
                    { value: '', label: t('session.none') },
                    ...sessionOptionsOf(item).map(sessionId => ({
                      value: sessionId,
                      label: sessionsById[sessionId as never]?.displayTitle ?? String(sessionId).slice(0, 8),
                    })),
                  ]}
                  onSelect={(picked) => {
                    run(actions.setSessionLink(item.id, picked === '' ? undefined : picked))
                  }}
                  onOpenChange={(pickerOpen) => { setOpenPickers(count => Math.max(0, count + (pickerOpen ? 1 : -1))) }}
                />
              </div>
            )}
            {linkedSession !== undefined && (
              <button
                type="button"
                className={css.cardOpen}
                onClick={() => openSession(linkedSession)}
              >
                {t('row.open')}
              </button>
            )}
            <div className={css.cardMeta}>
              <span>{t('meta.created')} {localDayKey(item.createdAt)}</span>
              <button
                type="button"
                className={css.cardDelete}
                onClick={() => run(actions.remove(item.id))}
              >
                {t('row.delete')}
              </button>
            </div>
          </div>
        )}
      </li>
    )
  }

  return (
    <div ref={rootRef} className={css.edgeRoot} onKeyDown={onRootKeyDown}>
      <button
        type="button"
        className={css.edgeTab}
        aria-label={t('button.aria')}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openDrawer())}
      >
        <IconCheckOutline14 />
        {pendingCount > 0 && <span className={css.badge} aria-hidden="true">{pendingCount}</span>}
      </button>

      {open && (
        <section data-dsh-glass-panel="" className={css.drawer} aria-label={t('panel.aria')}>
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

          {state.error !== null && <p className={css.error}>{state.error}</p>}
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
              {showHistory && <ul className={css.list}>{earlier.map(item => renderRow(item))}</ul>}
            </>
          )}
        </section>
      )}
    </div>
  )
}
