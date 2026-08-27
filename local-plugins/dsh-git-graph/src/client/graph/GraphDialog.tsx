/**
 * The Git graph panel: a read-only commit list with lane topology, ref
 * labels, and paging (git log --branches --tags --remotes --topo-order).
 * @module dsh-git-graph/client/graph/GraphDialog
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { GraphView } from '../../core/types.ts'
import type { GitGraphKey } from '../locales.ts'
import { computeGraphLayout, type GraphRowLayout } from './lanes.ts'
import { Backdrop, cx } from '../chips/Chip.tsx'
import css from '../chips/context.module.css'

/** Initial page size of the graph fetch. */
const INITIAL_LIMIT = 200
/** Page size of one "load more" step. */
const PAGE_STEP = 100

/** Graph column geometry: lane pitch and the rendered row height the layout's
 *  unit coordinates scale into (matches the CSS row height). */
const GRAPH_LANE_PX = 14
const GRAPH_ROW_PX = 30

/** One row's lane drawing: straight verticals for pass-throughs, bezier
 *  curves for forks and convergences, and the commit node. The HEAD commit's
 *  node is a hollow ring (VS Code marks the checked-out commit that way);
 *  colors ride CSS classes `graphC0..7`. */
function GraphLane({ layout, head }: { layout: GraphRowLayout; head: boolean }): ReactNode {
  const width = Math.max(layout.width, 1) * GRAPH_LANE_PX
  const cx = (lane: number): number => lane * GRAPH_LANE_PX + GRAPH_LANE_PX / 2
  const cy = (fraction: number): number => fraction * GRAPH_ROW_PX
  return (
    <svg
      className={css.graphLaneSvg}
      width={width}
      height={GRAPH_ROW_PX}
      viewBox={`0 0 ${width} ${GRAPH_ROW_PX}`}
      aria-hidden="true"
      data-gitgraph-lanes
    >
      {layout.segments.map((segment, index) => {
        const x1 = cx(segment.x1)
        const x2 = cx(segment.x2)
        const y1 = cy(segment.y1)
        const y2 = cy(segment.y2)
        const d = x1 === x2
          ? `M ${x1} ${y1} L ${x2} ${y2}`
          : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`
        return (
          <path
            key={index}
            d={d}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            className={css[`graphC${segment.color % 8}`]}
          />
        )
      })}
      {head ? (
        <circle
          cx={cx(layout.nodeLane)}
          cy={GRAPH_ROW_PX / 2}
          r={4}
          strokeWidth={2}
          fill="var(--dsw-alias-bg-base)"
          className={css[`graphC${layout.nodeColor % 8}`]}
        />
      ) : (
        <circle
          cx={cx(layout.nodeLane)}
          cy={GRAPH_ROW_PX / 2}
          r={3.5}
          stroke="var(--dsw-alias-bg-base)"
          strokeWidth={1}
          className={css[`graphC${layout.nodeColor % 8}`]}
        />
      )}
    </svg>
  )
}
/** Seconds per time bucket (relative timestamps). */
const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * A compact relative timestamp (GitHub-style): "just now", "5 分钟前",
 * falling back to a plain date past 30 days.
 * @param epochSeconds - commit author time in seconds.
 * @param t - the dictionary.
 * @returns the display string.
 */
function formatTime(epochSeconds: number, t: Translate<GitGraphKey>): string {
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds)
  if (elapsed < MINUTE) return t('graph.time.justNow')
  if (elapsed < HOUR) return t('graph.time.minutesAgo', { count: Math.floor(elapsed / MINUTE) })
  if (elapsed < DAY) return t('graph.time.hoursAgo', { count: Math.floor(elapsed / HOUR) })
  if (elapsed < 30 * DAY) return t('graph.time.daysAgo', { count: Math.floor(elapsed / DAY) })
  const date = new Date(epochSeconds * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Props of the Git graph dialog. */
export interface GraphDialogProps {
  /** The graph verb (host-side read-only log). */
  graph: (limit?: number) => Promise<GraphView | null>
  onClose: () => void
  t: Translate<GitGraphKey>
}

/**
 * The Git graph panel.
 * @param props - see {@link GraphDialogProps}.
 */
export function GraphDialog({ graph, onClose, t }: GraphDialogProps) {
  const [view, setView] = useState<GraphView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Out-of-order guard: two rapid loads (load-more while a fetch is in
  // flight) must never let the older, smaller page overwrite the newer one.
  const requestSeq = useRef(0)
  const load = useCallback((limit: number): void => {
    const seq = requestSeq.current + 1
    requestSeq.current = seq
    setLoading(true)
    void graph(limit).then((next) => {
      if (seq !== requestSeq.current) return
      setView(next)
      setError(next === null ? t('error.internal') : null)
    }).catch(() => {
      if (seq !== requestSeq.current) return
      setError(t('error.internal'))
    }).finally(() => {
      if (seq === requestSeq.current) setLoading(false)
    })
  }, [graph, t])

  // Initial load exactly once on mount. The parent passes a fresh inline
  // `graph` arrow on every BranchChip render, which changes `load`'s identity
  // and would re-run the initial fetch (resetting any loaded pages) if it
  // were a dependency — so read the latest `load` through a ref instead.
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => { loadRef.current(INITIAL_LIMIT) }, [])

  const layouts = useMemo(() => {
    if (view === null) return []
    return computeGraphLayout(view.commits)
  }, [view])

  const laneCount = useMemo(() => {
    let count = 0
    for (const row of layouts) count = Math.max(count, row.width)
    return count
  }, [layouts])

  return (
    <>
      <Backdrop onClose={onClose} />
      <div className={css.dialog} role="dialog" aria-label={t('graph.title')} data-gitgraph-dialog data-dsh-plugin="git-graph" data-dsh-part="dialog">
        <div className={css.dialogHeader}>
          <div className={css.dialogHeading}>
            <h3 className={css.dialogTitle}>{t('graph.title')}</h3>
            <div className={css.graphSubtitle}>
              {t('graph.subtitle', {
                count: view === null ? 0 : view.commits.length,
                lanes: laneCount,
              })}
            </div>
          </div>
          <button
            type="button"
            className={css.dialogClose}
            onClick={onClose}
            aria-label={t('graph.close')}
          >
            <IconCloseOutline16 size={16} />
          </button>
        </div>
        <div className={css.graphBody}>
          {loading && view === null
            ? <div className={css.graphEmpty}>{t('graph.loading')}</div>
            : error !== null
              ? <div className={css.graphEmpty}>{error}</div>
              : view === null || view.commits.length === 0
                ? <div className={css.graphEmpty}>{t('graph.empty')}</div>
                : view.commits.map((commit, index) => {
                  const layout = layouts[index]
                  if (layout === undefined) return null
                  const head = commit.refs.includes('HEAD')
                  return (
                    <div className={css.graphRow} key={commit.oid} title={`${commit.subject}
${commit.author} · ${commit.oid}`}>
                      <GraphLane layout={layout} head={head} />
                      <span className={css.graphSubject} title={commit.subject}>{commit.subject}</span>
                      {commit.refs.map(ref => (
                        <span
                          key={ref}
                          title={ref}
                          data-gitgraph-ref
                          data-gitgraph-ref-current={ref === view.branch || undefined}
                          className={cx(
                            css.graphRef,
                            ref === view.branch && css.graphRefCurrent,
                            ref === 'HEAD' && css.graphRefHead,
                            ref.includes('/') && css.graphRefRemote,
                          )}
                        >
                          {ref}
                        </span>
                      ))}
                      <span className={css.graphMeta}>
                        {commit.author}
                        <span className={css.graphMetaSep}>·</span>
                        <span>{formatTime(commit.authorTime, t)}</span>
                      </span>
                    </div>
                  )
                })}
        </div>
        {view !== null && view.hasMore && (
          <button
            type="button"
            className={css.graphMore}
            onClick={() => { load(view.commits.length + PAGE_STEP) }}
          >
            {t('graph.loadMore')}
          </button>
        )}
      </div>
    </>
  )
}
