/**
 * The Git commit-rail conversation view: a branch selector plus the session
 * workspace's commit history rendered with the graph rail (dots, lanes, and
 * merge curves). Data comes from the git-graph host route; the view is
 * read-only — no checkout, no mutation. Lazy paging appends older commits
 * and recomputes the rail over the whole loaded window.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { GraphLogEntry } from '@deepseek-ai/dsh-git-graph'
import { GitGraphApiError, gitGraphBranches, gitGraphLog } from './api.ts'
import { CommitGraphCell, assignGraphRows } from './CommitGraphRail.tsx'
import { NS } from './locales.ts'
import css from './GitGraphTab.module.css'

/** History batch size for lazy paging. */
const LOG_BATCH = 20

/** Full props for the view body: the conversation-view runtime share plus the locale seat. */
export type GitGraphTabProps = ConvViewProps & PropsLocale<typeof NS>

/** The ref names of one log row's decorations (`HEAD -> main` → `main`), deduped. */
function refNames(refs: string): string[] {
  return [...new Set(
    refs
      .split(',')
      .map(ref => ref.trim())
      .filter(ref => ref !== '')
      .map(ref => (ref.includes(' -> ') ? ref.slice(ref.indexOf(' -> ') + 4) : ref))
      .map(ref => (ref.startsWith('tag: ') ? ref.slice(5) : ref)),
  )]
}

/** Relative human time for one ISO date (same style as the rest of the shell). */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.floor((Date.now() - then) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

/**
 * The Git view body.
 * @param props - conversation-view runtime currency and the locale seat.
 * @returns the branch selector and rail history list.
 */
export function GitGraphTab(props: GitGraphTabProps) {
  const { t, sessionId } = props

  const [branch, setBranch] = useState<string | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [entries, setEntries] = useState<GraphLogEntry[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** (Re)load the branch list and the first history page for `target`. */
  const load = useCallback(async (target: string | null, skip: number): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      if (target === null) {
        const names = await gitGraphBranches(sessionId)
        setBranches(names)
        const current = names[0] ?? null
        setBranch(current)
        target = current
      }
      if (target === null) {
        setEntries([])
        setHasMore(false)
        return
      }
      const page = await gitGraphLog(sessionId, LOG_BATCH, skip)
      setEntries(previous => skip === 0 ? page.entries : [...previous, ...page.entries])
      setHasMore(page.hasMore)
    } catch (reason) {
      setError(reason instanceof GitGraphApiError ? reason.message : reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { void load(null, 0) }, [load])

  const switchBranch = (name: string): void => {
    setBranch(name)
    void load(name, 0)
  }

  const graphRows = useMemo(() => assignGraphRows(entries), [entries])

  return (
    <div className={css.root}>
      <div className={css.header}>
        <select
          className={css.branchSelect}
          value={branch ?? ''}
          onChange={(event) => { switchBranch(event.target.value) }}
          disabled={loading || branches.length === 0}
          aria-label={t('branch')}
        >
          {branch !== null && <option value={branch}>{branch}</option>}
          {branches.filter(name => name !== branch).map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <button
          type="button"
          className={css.refresh}
          aria-label={t('refresh')}
          title={t('refresh')}
          onClick={() => { void load(branch, 0) }}
        >
          ↻
        </button>
      </div>

      {loading && <div className={css.placeholder}>{t('loading')}</div>}
      {!loading && error !== null && <div className={css.error}>{error}</div>}
      {!loading && error === null && entries.length === 0 && (
        <div className={css.placeholder}>{t('notRepo')}</div>
      )}

      {entries.map((entry, index) => (
        <div key={entry.hashFull} className={css.row} title={`${entry.author} · ${entry.date}\n${entry.hashFull}`}>
          {graphRows[index] !== undefined && <CommitGraphCell row={graphRows[index]} className={css.rail} />}
          <div className={css.body}>
            <div className={css.line1}>
              <span className={css.hash}>{entry.hash}</span>
              <span className={css.subject}>{entry.subject}</span>
            </div>
            <div className={css.line2}>
              {refNames(entry.refs).map(ref => (
                <span key={ref} className={css.ref}>{ref}</span>
              ))}
              <span className={css.meta}>{entry.author} · {relativeTime(entry.date)}</span>
            </div>
          </div>
        </div>
      ))}

      {!loading && hasMore && (
        <button
          type="button"
          className={css.more}
          onClick={() => { void load(branch, entries.length) }}
        >
          {t('loadMore')}
        </button>
      )}
    </div>
  )
}
