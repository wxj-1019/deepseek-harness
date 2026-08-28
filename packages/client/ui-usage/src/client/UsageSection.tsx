/**
 * The "Usage" conversation view: a per-session token-usage table over the
 * usage-ledger storage domain. Session titles resolve through the sessions
 * kit; totals are a pure sum of the visible rows.
 * @module @deepseek-ai/dsh-client-ui-usage/client/UsageSection
 */

import { useEffect, useMemo } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { UsageSectionInjected } from './slots.ts'
import type { UsageState } from './controller.ts'
import { NS } from './locales.ts'
import css from './UsageSection.module.css'

/** Full props for the view body. */
export type UsageSectionProps =
  & ConvViewProps
  & PropsLocale<typeof NS>
  & Pick<UsageSectionInjected, 'ensure'>
  & { useUsage: SnapshotSelectorHook<UsageState> }

/** The four usage buckets of one row, in display order. */
const BUCKETS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const

/** Sum one bucket across the visible rows. */
function sumBucket(rows: UsageState['rows'], bucket: (typeof BUCKETS)[number]): number {
  return rows.reduce((total, row) => total + row.record[bucket], 0)
}

/** Local date-time label for one epoch instant. */
function timeLabel(epochMs: number): string {
  const date = new Date(epochMs)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * The Usage view body.
 * @param props - runtime slot currency, namespace copy, injected face.
 * @returns the usage table.
 */
export function UsageSection(props: UsageSectionProps) {
  const { useSessions, useUsage, ensure, t } = props
  // Load at mount: a view exists to be seen.
  useEffect(() => { void ensure() }, [ensure])
  const state = useUsage(current => current)
  const sessionsById = useSessions(current => current.byId)

  const rows = state.rows
  const totals: Record<(typeof BUCKETS)[number], number> = useMemo(
    () => Object.fromEntries(BUCKETS.map(bucket => [bucket, sumBucket(rows, bucket)])) as Record<(typeof BUCKETS)[number], number>,
    [rows],
  )
  const grand = BUCKETS.reduce((total, bucket) => total + totals[bucket], 0)

  return (
    <div className={css.section}>
      <p className={css.hint}>{t('pageHint')}</p>

      {state.error !== null && <p className={css.error}>{state.error}</p>}

      <table className={css.table}>
        <thead>
          <tr>
            <th className={css.sessionCol}>{t('col.session')}</th>
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
            <tr><td colSpan={7} className={css.empty}>{t('empty')}</td></tr>
          )}
          {rows.map((row) => {
            const record = row.record
            const total = BUCKETS.reduce((sum, bucket) => sum + record[bucket], 0)
            return (
              <tr key={row.sessionId}>
                <td className={css.sessionCol} title={row.sessionId}>
                  {sessionsById[row.sessionId]?.displayTitle ?? String(row.sessionId).slice(0, 8)}
                </td>
                <td className={css.num}>{record.inputTokens.toLocaleString()}</td>
                <td className={css.num}>{record.outputTokens.toLocaleString()}</td>
                <td className={css.num}>{record.cacheReadTokens.toLocaleString()}</td>
                <td className={css.num}>{record.cacheWriteTokens.toLocaleString()}</td>
                <td className={css.num}>{total.toLocaleString()}</td>
                <td className={`${css.num} ${css.lastCol}`}>{timeLabel(record.lastAt)}</td>
              </tr>
            )
          })}
          {rows.length > 0 && (
            <tr className={css.totalsRow}>
              <td className={css.sessionCol}>{t('totals.label')}</td>
              {BUCKETS.map(bucket => (
                <td key={bucket} className={css.num}>{totals[bucket].toLocaleString()}</td>
              ))}
              <td className={css.num}>{grand.toLocaleString()}</td>
              <td className={css.lastCol} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
