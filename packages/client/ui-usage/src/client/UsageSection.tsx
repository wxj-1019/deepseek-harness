/**
 * The "Usage" conversation view: a terminal-report statistics dashboard over
 * the usage-ledger storage domain, composed of standalone cards — big-number
 * stats, a token-activity heatmap, a per-model daily trend, a model-share
 * donut, and the per-model / per-session detail tables. Totals are pure sums
 * of the visible rows; session titles resolve through the sessions kit.
 * @module @deepseek-ai/dsh-client-ui-usage/client/UsageSection
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { UsageSectionInjected } from './slots.ts'
import type { UsageState } from './controller.ts'
import { byDay, byModel, cacheHitRate, costOf, fmtCost, fmtTokens, priceFor, todayKey, dayKeyOf, totalsOf, trendSeries, usageStreaks } from './view.ts'
import { seriesColor, UsageDonut, UsageHeatmap, UsageTrend } from './UsageCharts.tsx'
import { NS } from './locales.ts'
import css from './UsageSection.module.css'

/** Full props for the view body. */
export type UsageSectionProps =
  & ConvViewProps
  & PropsLocale<typeof NS>
  & Pick<UsageSectionInjected, 'ensure'>
  & { useUsage: SnapshotSelectorHook<UsageState> }

/** Local date-time label for one epoch instant. */
function timeLabel(epochMs: number): string {
  const date = new Date(epochMs)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** One big-number statistic card of the dashboard's top row. */
function StatCard(props: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <div className={css.statCard}>
      <div className={css.statValue}>{props.value}</div>
      <div className={css.statLabel}>{props.label}</div>
    </div>
  )
}

/**
 * The Usage view body.
 * @param props - runtime slot currency, namespace copy, injected face.
 * @returns the usage statistics dashboard.
 */
export function UsageSection(props: UsageSectionProps) {
  const { useSessions, useUsage, ensure, t } = props
  const rootRef = useRef<HTMLDivElement>(null)
  // Load at mount: a view exists to be seen.
  useEffect(() => { void ensure() }, [ensure])
  // The scrollport's scrollTop is chat's bottom-anchored position; the
  // statistics start at the summary strip, so activation resets it.
  useEffect(() => {
    const scroller = rootRef.current?.closest('[data-conversation-scroll]')
    if (scroller) scroller.scrollTop = 0
  }, [])
  const state = useUsage(current => current)
  const sessionsById = useSessions(current => current.byId)
  const [rangeDays, setRangeDays] = useState<7 | 30>(30)

  const rows = state.rows
  const totals = useMemo(() => totalsOf(rows), [rows])
  const models = useMemo(() => byModel(rows), [rows])
  const days = useMemo(() => byDay(rows), [rows])
  const hit = cacheHitRate(totals)
  const lastActive = rows.length === 0 ? undefined : Math.max(...rows.map(row => row.record.lastAt))
  const pricing = state.pricing
  const today = useMemo(() => days.find(entry => entry.day === todayKey()), [days])
  const peak = useMemo(() => Math.max(0, ...days.map(entry => entry.totals.total)), [days])
  const streaks = useMemo(() => usageStreaks(days.map(entry => entry.day)), [days])
  const totalCost = pricing === null
    ? undefined
    : rows.reduce((sum, row) => {
      for (const [model, buckets] of Object.entries(row.record.models ?? {})) {
        const price = priceFor(model, pricing)
        if (price !== undefined) sum += costOf(buckets, price)
      }
      return sum
    }, 0)

  // The trend's zero-filled day window (ascending), newest last.
  const dayWindow = useMemo(() => Array.from({ length: rangeDays }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (rangeDays - 1 - index))
    return dayKeyOf(date)
  }), [rangeDays])
  const trend = useMemo(() => trendSeries(rows, dayWindow), [rows, dayWindow])
  const heatCells = useMemo(() => {
    const totalsByDay = new Map(days.map(entry => [entry.day, entry.totals.total]))
    return Array.from({ length: 20 * 7 }, (_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - (20 * 7 - 1 - index))
      const key = dayKeyOf(date)
      return { day: key, total: totalsByDay.get(key) ?? 0 }
    })
  }, [days])

  return (
    <div ref={rootRef} className={css.section} data-usage-panel="">
      <div className={css.cardRow}>
        <StatCard label={t('col.total')} value={fmtTokens(totals.total)} />
        <StatCard label={t('summary.today')} value={fmtTokens(today?.totals.total ?? 0)} />
        <StatCard label={t('stat.peak')} value={fmtTokens(peak)} />
        <StatCard label={t('stat.streakCurrent')} value={String(streaks.current)} />
        <StatCard label={t('stat.streakLongest')} value={String(streaks.longest)} />
      </div>

      <div className={css.card}>
        <div className={css.summary} role="group" aria-label={t('summary.aria')}>
          <span className={css.metric}>
            <span className={css.metricLabel}>{t('col.requests')}</span>
            <span className={css.metricValue}>{totals.requests}</span>
          </span>
          <span className={css.metric}>
            <span className={css.metricLabel}>{t('summary.cacheHit')}</span>
            <span className={css.metricValue}>{hit === undefined ? '—' : `${Math.round(hit * 100)}%`}</span>
          </span>
          {totalCost !== undefined && (
            <span className={css.metric}>
              <span className={css.metricLabel}>{t('col.cost')}</span>
              <span className={css.metricValue}>{fmtCost(totalCost)}</span>
            </span>
          )}
          {lastActive !== undefined && (
            <span className={css.metric}>
              <span className={css.metricLabel}>{t('col.lastActive')}</span>
              <span className={css.metricValue}>{timeLabel(lastActive)}</span>
            </span>
          )}
        </div>
        {state.error !== null && <p className={css.error}>{state.error}</p>}
      </div>

      <div className={css.card}>
        <div className={css.cardTitle}>{t('card.heatmap')}</div>
        <UsageHeatmap cells={heatCells} max={peak} />
      </div>

      <div className={css.card}>
        <div className={css.cardHead}>
          <div className={css.cardTitle}>{t('card.trend')}</div>
          <div className={css.rangeToggle} role="group" aria-label={t('card.trend')}>
            <button
              type="button"
              className={rangeDays === 7 ? `${css.rangeChip} ${css.rangeChipActive}` : css.rangeChip}
              onClick={() => { setRangeDays(7) }}
            >
              {t('range.7d')}
            </button>
            <button
              type="button"
              className={rangeDays === 30 ? `${css.rangeChip} ${css.rangeChipActive}` : css.rangeChip}
              onClick={() => { setRangeDays(30) }}
            >
              {t('range.30d')}
            </button>
          </div>
        </div>
        <div className={css.legend}>
          {trend.map((entry, index) => (
            <span key={entry.model} className={css.legendRow}>
              <span className={css.legendDot} style={{ background: seriesColor(index) }} />
              {entry.model}
            </span>
          ))}
        </div>
        <UsageTrend
          dayWindow={dayWindow}
          series={trend.map((entry, index) => ({ model: entry.model, color: seriesColor(index), values: entry.values }))}
        />
      </div>

      <div className={css.card}>
        <div className={css.cardTitle}>{t('card.models')}</div>
        <div className={css.donutRow}>
          <UsageDonut
            centerLabel={fmtTokens(totals.total)}
            slices={models.map((entry, index) => ({ model: entry.model, share: entry.share, color: seriesColor(index) }))}
          />
          <div className={css.legend}>
            {models.map((entry, index) => (
              <span key={entry.model} className={css.legendRow}>
                <span className={css.legendDot} style={{ background: seriesColor(index) }} />
                <span className={css.legendName}>{entry.model}</span>
                <span className={css.legendTokens}>{fmtTokens(entry.totals.total)}</span>
                <span className={css.legendShare}>{Math.round(entry.share * 100)}%</span>
              </span>
            ))}
          </div>
        </div>
        <table className={css.table}>
          <thead>
            <tr>
              <th className={css.sessionCol}>{t('col.model')}</th>
              <th>{t('col.requests')}</th>
              <th>{t('col.input')}</th>
              <th>{t('col.output')}</th>
              <th>{t('col.cacheRead')}</th>
              <th>{t('col.cacheWrite')}</th>
              <th>{t('col.total')}</th>
              {pricing !== null && <th>{t('col.cost')}</th>}
              <th className={css.lastCol}>{t('col.share')}</th>
            </tr>
          </thead>
          <tbody>
            {models.map((entry) => {
              const price = pricing === null ? undefined : priceFor(entry.model, pricing)
              return (
                <tr key={entry.model}>
                  <td className={css.sessionCol} title={entry.model}>{entry.model}</td>
                  <td className={css.num}>{entry.totals.requests}</td>
                  <td className={css.num}>{fmtTokens(entry.totals.inputTokens)}</td>
                  <td className={css.num}>{fmtTokens(entry.totals.outputTokens)}</td>
                  <td className={css.num}>{fmtTokens(entry.totals.cacheReadTokens)}</td>
                  <td className={css.num}>{fmtTokens(entry.totals.cacheWriteTokens)}</td>
                  <td className={css.num}>{fmtTokens(entry.totals.total)}</td>
                  {pricing !== null && <td className={css.num}>{price === undefined ? '—' : fmtCost(costOf(entry.totals, price))}</td>}
                  <td className={`${css.num} ${css.lastCol}`}>
                    <span className={css.shareCell}>
                      <span className={css.shareBar} aria-hidden="true">
                        <span className={css.shareFill} style={{ width: `${Math.round(entry.share * 100)}%` }} />
                      </span>
                      {Math.round(entry.share * 100)}%
                    </span>
                  </td>
                </tr>
              )
            })}
            <tr className={css.totalsRow}>
              <td className={css.sessionCol}>{t('totals.label')}</td>
              <td className={css.num}>{totals.requests}</td>
              <td className={css.num}>{fmtTokens(totals.inputTokens)}</td>
              <td className={css.num}>{fmtTokens(totals.outputTokens)}</td>
              <td className={css.num}>{fmtTokens(totals.cacheReadTokens)}</td>
              <td className={css.num}>{fmtTokens(totals.cacheWriteTokens)}</td>
              <td className={css.num}>{fmtTokens(totals.total)}</td>
              {pricing !== null && <td className={css.num}>{totalCost === undefined ? '—' : fmtCost(totalCost)}</td>}
              <td className={css.lastCol} />
            </tr>
          </tbody>
        </table>
      </div>

      <div className={css.card}>
        <table className={css.table}>
          <thead>
            <tr>
              <th className={css.sessionCol}>{t('col.session')}</th>
              <th>{t('col.requests')}</th>
              <th>{t('col.input')}</th>
              <th>{t('col.output')}</th>
              <th>{t('col.cacheRead')}</th>
              <th>{t('col.cacheWrite')}</th>
              <th>{t('col.total')}</th>
              {pricing !== null && <th>{t('col.cost')}</th>}
              <th className={css.lastCol}>{t('col.lastActive')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={pricing === null ? 8 : 9} className={css.empty}>{t('empty')}</td></tr>
            )}
            {rows.map((row) => {
              const record = row.record
              const total = record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheWriteTokens
              const rowCost = pricing === null || record.models === undefined
                ? undefined
                : Object.entries(record.models).reduce((sum, [model, buckets]) => {
                  const price = priceFor(model, pricing)
                  return price === undefined ? sum : sum + costOf(buckets, price)
                }, 0)
              return (
                <tr key={row.sessionId}>
                  <td className={css.sessionCol} title={row.sessionId}>
                    {sessionsById[row.sessionId]?.displayTitle ?? String(row.sessionId).slice(0, 8)}
                  </td>
                  <td className={css.num}>{record.requests}</td>
                  <td className={css.num}>{fmtTokens(record.inputTokens)}</td>
                  <td className={css.num}>{fmtTokens(record.outputTokens)}</td>
                  <td className={css.num}>{fmtTokens(record.cacheReadTokens)}</td>
                  <td className={css.num}>{fmtTokens(record.cacheWriteTokens)}</td>
                  <td className={css.num}>{fmtTokens(total)}</td>
                  {pricing !== null && <td className={css.num}>{rowCost === undefined ? '—' : fmtCost(rowCost)}</td>}
                  <td className={`${css.num} ${css.lastCol}`}>{timeLabel(record.lastAt)}</td>
                </tr>
              )
            })}
            {rows.length > 0 && (
              <tr className={css.totalsRow}>
                <td className={css.sessionCol}>{t('totals.label')}</td>
                <td className={css.num}>{totals.requests}</td>
                {(['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const).map(bucket => (
                  <td key={bucket} className={css.num}>{fmtTokens(totals[bucket])}</td>
                ))}
                <td className={css.num}>{fmtTokens(totals.total)}</td>
                {pricing !== null && <td className={css.num}>{totalCost === undefined ? '—' : fmtCost(totalCost)}</td>}
                <td className={css.lastCol} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
