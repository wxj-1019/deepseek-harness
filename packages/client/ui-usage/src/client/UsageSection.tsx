/**
 * The "Usage" conversation view: usage statistics over the usage-ledger
 * storage domain in a terminal-report layout — a status-line summary strip,
 * a per-model breakdown, and the per-session detail table. Session titles
 * resolve through the sessions kit; totals are pure sums of the visible rows.
 * @module @deepseek-ai/dsh-client-ui-usage/client/UsageSection
 */

import { useEffect, useMemo } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { UsageSectionInjected } from './slots.ts'
import type { UsageState } from './controller.ts'
import { byModel, cacheHitRate, fmtTokens, totalsOf } from './view.ts'
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

/**
 * The Usage view body.
 * @param props - runtime slot currency, namespace copy, injected face.
 * @returns the usage statistics.
 */
export function UsageSection(props: UsageSectionProps) {
  const { useSessions, useUsage, ensure, t } = props
  // Load at mount: a view exists to be seen.
  useEffect(() => { void ensure() }, [ensure])
  const state = useUsage(current => current)
  const sessionsById = useSessions(current => current.byId)

  const rows = state.rows
  const totals = useMemo(() => totalsOf(rows), [rows])
  const models = useMemo(() => byModel(rows), [rows])
  const hit = cacheHitRate(totals)
  const lastActive = rows.length === 0 ? undefined : Math.max(...rows.map(row => row.record.lastAt))

  return (
    <div className={css.section} data-usage-panel="">
      <p className={css.hint}>{t('pageHint')}</p>

      <div className={css.summary} role="group" aria-label={t('summary.aria')}>
        <span className={css.metric}>
          <span className={css.metricLabel}>{t('col.input')}</span>
          <span className={css.metricValue}>{fmtTokens(totals.inputTokens)}</span>
        </span>
        <span className={css.metric}>
          <span className={css.metricLabel}>{t('col.output')}</span>
          <span className={css.metricValue}>{fmtTokens(totals.outputTokens)}</span>
        </span>
        <span className={css.metric}>
          <span className={css.metricLabel}>{t('col.cacheRead')}</span>
          <span className={css.metricValue}>{fmtTokens(totals.cacheReadTokens)}</span>
        </span>
        <span className={css.metric}>
          <span className={css.metricLabel}>{t('col.cacheWrite')}</span>
          <span className={css.metricValue}>{fmtTokens(totals.cacheWriteTokens)}</span>
        </span>
        <span className={css.metric}>
          <span className={css.metricLabel}>{t('col.total')}</span>
          <span className={css.metricValue}>{fmtTokens(totals.total)}</span>
        </span>
        <span className={css.metric}>
          <span className={css.metricLabel}>{t('col.requests')}</span>
          <span className={css.metricValue}>{totals.requests}</span>
        </span>
        <span className={css.metric}>
          <span className={css.metricLabel}>{t('summary.cacheHit')}</span>
          <span className={css.metricValue}>{hit === undefined ? '—' : `${Math.round(hit * 100)}%`}</span>
        </span>
        {lastActive !== undefined && (
          <span className={css.metric}>
            <span className={css.metricLabel}>{t('col.lastActive')}</span>
            <span className={css.metricValue}>{timeLabel(lastActive)}</span>
          </span>
        )}
      </div>

      {state.error !== null && <p className={css.error}>{state.error}</p>}

      {models.length > 0 && (
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
              <th className={css.lastCol}>{t('col.share')}</th>
            </tr>
          </thead>
          <tbody>
            {models.map(entry => (
              <tr key={entry.model}>
                <td className={css.sessionCol} title={entry.model}>{entry.model}</td>
                <td className={css.num}>{entry.totals.requests}</td>
                <td className={css.num}>{fmtTokens(entry.totals.inputTokens)}</td>
                <td className={css.num}>{fmtTokens(entry.totals.outputTokens)}</td>
                <td className={css.num}>{fmtTokens(entry.totals.cacheReadTokens)}</td>
                <td className={css.num}>{fmtTokens(entry.totals.cacheWriteTokens)}</td>
                <td className={css.num}>{fmtTokens(entry.totals.total)}</td>
                <td className={`${css.num} ${css.lastCol}`}>
                  <span className={css.shareCell}>
                    <span className={css.shareBar} aria-hidden="true">
                      <span className={css.shareFill} style={{ width: `${Math.round(entry.share * 100)}%` }} />
                    </span>
                    {Math.round(entry.share * 100)}%
                  </span>
                </td>
              </tr>
            ))}
            <tr className={css.totalsRow}>
              <td className={css.sessionCol}>{t('totals.label')}</td>
              <td className={css.num}>{totals.requests}</td>
              <td className={css.num}>{fmtTokens(totals.inputTokens)}</td>
              <td className={css.num}>{fmtTokens(totals.outputTokens)}</td>
              <td className={css.num}>{fmtTokens(totals.cacheReadTokens)}</td>
              <td className={css.num}>{fmtTokens(totals.cacheWriteTokens)}</td>
              <td className={css.num}>{fmtTokens(totals.total)}</td>
              <td className={css.lastCol} />
            </tr>
          </tbody>
        </table>
      )}

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
            <th className={css.lastCol}>{t('col.lastActive')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={8} className={css.empty}>{t('empty')}</td></tr>
          )}
          {rows.map((row) => {
            const record = row.record
            const total = record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheWriteTokens
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
              <td className={css.lastCol} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
