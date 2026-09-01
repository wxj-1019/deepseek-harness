/**
 * Presentational charts for the usage statistics dashboard: a GitHub-style
 * activity heatmap, a hand-rolled SVG multi-series trend line, and a donut
 * share ring. No chart dependency — every visual is plain SVG or CSS grid,
 * sized by its container.
 * @module @deepseek-ai/dsh-client-ui-usage/client/UsageCharts
 */

import type { ReactNode } from 'react'
import { fmtTokens } from './view.ts'
import css from './UsageCharts.module.css'

/** One day's activity cell of the heatmap grid. */
export interface HeatmapCell {
  /** The day key, `YYYY-MM-DD`. */
  readonly day: string
  /** The day's total tokens (0 renders as an empty cell). */
  readonly total: number
}

/** Fixed model color palette, assigned by series index (stable across renders). */
export const SERIES_COLORS = [
  '#4f8cff', '#22c55e', '#a855f7', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#84cc16',
] as const

/** Color for a series index, cycling past the palette's end. */
export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length] ?? SERIES_COLORS[0] ?? '#4f8cff'
}

/**
 * The token-activity heatmap: one column per week, one row per weekday,
 * intensity scaled against the window's busiest day.
 * @param props - day cells ascending, and the window's maximum total.
 * @returns the heatmap grid with month labels.
 */
// CSS-module classes are hashed per name, so the level class must be picked
// from the map — concatenating `css.heatmapLevel` with the digit produces the
// literal `undefined<digit>` and every cell renders transparent.
const LEVEL_CLASSES = [
  css.heatmapLevel0, css.heatmapLevel1, css.heatmapLevel2, css.heatmapLevel3, css.heatmapLevel4,
] as const

export function UsageHeatmap(props: { readonly cells: readonly HeatmapCell[]; readonly max: number }): ReactNode {
  const { cells, max } = props
  // Level 0..4: zero is empty; the rest split the range up to the max.
  const level = (total: number): number => {
    if (total <= 0 || max <= 0) return 0
    return Math.min(4, 1 + Math.floor((total / max) * 4))
  }
  // Group into week columns of 7 (leading blanks align the first week's weekday).
  const weeks: (HeatmapCell | undefined)[][] = []
  let currentWeek: (HeatmapCell | undefined)[] = []
  cells.forEach((cell, index) => {
    const weekday = weekdayOf(cell.day)
    if (index === 0) for (let i = 0; i < weekday; i += 1) currentWeek.push(undefined)
    currentWeek.push(cell)
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  })
  if (currentWeek.length > 0) weeks.push(currentWeek)
  const monthLabels = monthLabelsOf(cells)
  return (
    <div className={css.heatmapWrap}>
      <div className={css.heatmapScroll}>
        <div className={css.heatmapGrid} style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className={css.heatmapColumn}>
              {week.map((cell, dayIndex) => cell === undefined
                ? <span key={dayIndex} className={css.heatmapCellEmpty} />
                : (
                  <span
                    key={dayIndex}
                    className={`${css.heatmapCell} ${LEVEL_CLASSES[level(cell.total)] ?? ''}`}
                    title={`${cell.day} · ${fmtTokens(cell.total)}`}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>
      <div className={css.heatmapMonths}>
        {monthLabels.map(label => (
          <span key={label.label} className={css.heatmapMonth} style={{ left: `${label.percent}%` }}>{label.label}</span>
        ))}
      </div>
    </div>
  )
}

/** Weekday index (0 = Monday .. 6 = Sunday) of a day key. */
function weekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return (new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).getDay() + 6) % 7
}

/** Month labels positioned at the first week column whose month changed. */
function monthLabelsOf(cells: readonly HeatmapCell[]): readonly { label: string; percent: number }[] {
  const labels: { label: string; percent: number }[] = []
  let lastMonth = ''
  cells.forEach((cell, index) => {
    const month = cell.day.slice(0, 7)
    if (month !== lastMonth) {
      lastMonth = month
      labels.push({ label: `${Number(cell.day.slice(5, 7))}月`, percent: (index / Math.max(1, cells.length)) * 100 })
    }
  })
  return labels.filter(label => label.percent < 100)
}

/**
 * The multi-series daily trend: hand-rolled SVG polylines over a zero-filled
 * day window, with first/last day labels.
 * @param props - one series per model over the same window, and the window's day keys.
 * @returns the trend SVG.
 */
export function UsageTrend(props: {
  readonly series: readonly { readonly model: string; readonly color: string; readonly values: readonly number[] }[]
  readonly dayWindow: readonly string[]
}): ReactNode {
  const { series, dayWindow } = props
  const width = 600
  const height = 120
  const max = Math.max(1, ...series.flatMap(entry => entry.values))
  const point = (seriesIndex: readonly number[], index: number): string => {
    const x = dayWindow.length <= 1 ? 0 : (index / (dayWindow.length - 1)) * width
    const y = height - ((seriesIndex[index] ?? 0) / max) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }
  return (
    <div className={css.trend}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={css.trendSvg} role="img">
        {series.map(entry => (
          <polyline
            key={entry.model}
            points={entry.values.map((_, index) => point(entry.values, index)).join(' ')}
            fill="none"
            stroke={entry.color}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className={css.trendAxis}>
        <span>{dayWindow[0]}</span>
        <span>{dayWindow[dayWindow.length - 1]}</span>
      </div>
    </div>
  )
}

/**
 * The model-usage donut: one SVG ring per share, rendered as a stacked
 * stroke-dasharray so segments sum to the full circle.
 * @param props - slices descending by share, and the ring's center label.
 * @returns the donut SVG.
 */
export function UsageDonut(props: {
  readonly slices: readonly { readonly model: string; readonly share: number; readonly color: string }[]
  readonly centerLabel: string
}): ReactNode {
  const { slices, centerLabel } = props
  // r = 15.9155 makes the circumference exactly 100, so shares are dash lengths.
  const segments: { color: string; dash: string; offset: number }[] = []
  let consumed = 0
  for (const slice of slices) {
    const length = Math.max(0, slice.share * 100)
    segments.push({ color: slice.color, dash: `${length} ${100 - length}`, offset: 25 - consumed })
    consumed += length
  }
  return (
    <svg viewBox="0 0 42 42" className={css.donut} role="img" aria-label={centerLabel}>
      <circle cx="21" cy="21" r="15.9155" fill="none" className={css.donutTrack} />
      {segments.map((segment, index) => (
        <circle
          key={index}
          cx="21"
          cy="21"
          r="15.9155"
          fill="none"
          stroke={segment.color}
          strokeWidth="5"
          strokeDasharray={segment.dash}
          strokeDashoffset={segment.offset}
        />
      ))}
      <text x="21" y="23.5" textAnchor="middle" className={css.donutLabel}>{centerLabel}</text>
    </svg>
  )
}
