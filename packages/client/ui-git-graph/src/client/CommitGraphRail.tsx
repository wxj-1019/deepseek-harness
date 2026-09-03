/**
 * The commit graph rail: a VSCode-style leftmost column of dots and rails
 * behind a history list. Pure geometry over the loaded log window — every
 * commit gets a dot, its parent edges curve into the next rows' lanes, and
 * active branches run as vertical rails.
 *
 * Geometry contract (see {@link assignGraphRows} + the renderer): each row
 * owns a stretched SVG whose real pixel height is unknown at build time, so
 * vertical coordinates live in a 0–100 viewBox space (stretched with
 * `preserveAspectRatio="none"`) while lane coordinates are lane pixels —
 * consecutive rows therefore connect exactly at their shared border, and
 * `non-scaling-stroke` keeps every stroke at its screen width under the
 * non-uniform stretch.
 *
 * Window limitation: assignment sees only the loaded page(s). Parents beyond
 * the loaded window (and children above it) show as rails entering/leaving
 * the window edge instead of curving from/to visible dots.
 */
import type { ReactNode } from 'react'
import type { GraphLogEntry } from '@deepseek-ai/dsh-git-graph'

/** Horizontal pixels one lane occupies (rows share the widest count, so rails never drift). */
const LANE_PX = 13
/** Maximum rendered lanes; deeper merges clamp to the rightmost lane. */
const MAX_LANES = 8

/**
 * Rail/dot palette: the app's chart series hues (same family as the usage
 * charts, so the graph reads as one product). Distinct hues per lane —
 * semantic state colors (error/warn) are deliberately avoided here because a
 * red rail reads as a failure, not a branch.
 */
const PALETTE = [
  '#4f8cff', '#22c55e', '#a855f7', '#f97316',
  '#06b6d4', '#ec4899', '#eab308', '#14b8a6',
] as const

/** One history row's rail geometry, laid out against the whole loaded window. */
export interface GraphRow {
  /** Full-height vertical rails (lane index into the row's SVG). */
  rails: number[]
  /** This row's commit dot — lane index and palette entry. */
  node: { lane: number; color: string }
  /**
   * Lane-change curves leaving THIS row's dot into the bottom half
   * `(fromX·mid) → (toX·row end)`; they meet the target lane's straight rail
   * exactly at the shared row border. Divergence and convergence are
   * geometrically identical here — every non-straight parent edge gets one.
   */
  edges: { from: number; to: number }[]
  /** Shared lane pitch basis — the WINDOW's widest lane usage, identical on every row. */
  laneCount: number
}

/** First lane index with no pending reservation, at-or-after `start`; appends/clamps at {@link MAX_LANES}. */
function firstFree(lanes: readonly (string | null)[], start: number): number {
  for (let lane = Math.max(start, 0); lane < MAX_LANES; lane += 1) {
    if ((lanes[lane] ?? null) === null) return lane
  }
  return MAX_LANES - 1
}

/** All lanes currently reserving `hashFull` (a hash converges through several lanes while a merge joins). */
function lanesOf(lanes: readonly (string | null)[], hashFull: string): number[] {
  const found: number[] = []
  lanes.forEach((value, lane) => {
    if (value === hashFull) found.push(lane)
  })
  return found
}

/**
 * Assign lanes and transition segments for the loaded window (newest first).
 * Each reservation names the next expected node of an edge flowing down one
 * lane; consuming a node frees every lane waiting on it, then the node
 * rebooks its own parents — a first parent flows straight, further parents
 * fan out into the nearest free lane, and several children of one commit
 * book the same lane so their curves converge onto that rail.
 * @param entries - the loaded log window, newest first.
 * @returns one {@link GraphRow} per entry.
 */
export function assignGraphRows(entries: readonly Pick<GraphLogEntry, 'hashFull' | 'parents'>[]): GraphRow[] {
  /** Lane → hash whose node must appear next in this lane; null = free. */
  const lanes: (string | null)[] = []
  const rows: Omit<GraphRow, 'laneCount'>[] = []

  const allocateFor = (hashFull: string, nearLane: number): number => {
    const existing = lanesOf(lanes, hashFull)
    if (existing.length > 0) return existing[0] ?? 0
    const lane = firstFree(lanes, nearLane)
    lanes[lane] = hashFull
    return lane
  }

  entries.forEach((entry) => {
    // Consume every reservation waiting on this node; the innermost lane becomes the dot lane.
    const waiting = lanesOf(lanes, entry.hashFull)
    let nodeLane = waiting.length > 0 ? Math.min(...waiting) : -1
    waiting.forEach((lane) => { lanes[lane] = null })
    if (waiting.length === 0) {
      // Top-of-window commit (or an entry whose child was never loaded): own a fresh lane.
      nodeLane = firstFree(lanes, 0)
    }

    const parents = entry.parents
    const edges: GraphRow['edges'] = []
    parents.forEach((parent, index) => {
      const nearLane = index === 0 ? nodeLane : nodeLane + index
      const targetLane = allocateFor(parent, nearLane)
      if (targetLane !== nodeLane) edges.push({ from: nodeLane, to: targetLane })
    })

    // Rails cover the dot's lane plus every reserved lane (post-booking, so a
    // fan-out's new lane already rises beside this row's dot); free lanes stay invisible.
    const highest = lanes.reduce((acc, value, idx) => (value !== null ? idx : acc), -1)
    const bound = Math.min(MAX_LANES, Math.max(nodeLane + 1, highest + 1))
    const rails: number[] = []
    for (let lane = 0; lane < bound; lane += 1) {
      if (lane === nodeLane || lanes[lane] !== null) rails.push(lane)
    }

    rows.push({
      rails,
      node: { lane: nodeLane, color: PALETTE[nodeLane % PALETTE.length] ?? PALETTE[0] ?? '#4f8cff' },
      edges,
    })
  })

  // laneCount is uniform across the window: the widest used lane, floored at 4.
  const widest = rows.reduce((max, row) => Math.max(
    max,
    row.rails.length > 0 ? (row.rails[row.rails.length - 1] ?? 0) + 1 : 1,
    4,
  ), 1)
  return rows.map(row => ({ ...row, laneCount: Math.min(Math.max(widest, 4), MAX_LANES) }))
}

/** Vertical viewBox height: y units 0–100 stretch with the row (percent-equivalent). */
const VB_H = 100
/** Bezier control points that shape the lane-change S-curve. */
const CURVE_IN = 72
const CURVE_OUT = 78

/**
 * One history row's rail cell. The outer span is sized by the grid (the text
 * lines); the inner svg is absolutely stretched over it with a
 * `preserveAspectRatio="none"` viewBox so y units behave like percentages and
 * `non-scaling-stroke` keeps every stroke at its screen width. Lane-change
 * edges render as cubic S-curves (VSCode-style) instead of straight
 * diagonals, and the commit dot carries a background ring so it reads as
 * punched through the rails.
 * @param props - the row geometry and the caller's grid-cell class.
 */
export function CommitGraphCell(props: { row: GraphRow; className?: string | undefined }): ReactNode {
  const { row, className } = props
  const width = row.laneCount * LANE_PX
  const x = (lane: number): number => lane * LANE_PX + LANE_PX / 2
  const color = (lane: number): string => PALETTE[lane % PALETTE.length] ?? '#4f8cff'
  return (
    <span className={className} style={{ width, position: 'relative', display: 'block' }} aria-hidden="true">
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
        viewBox={`0 0 ${width} ${VB_H}`}
        preserveAspectRatio="none"
        focusable="false"
      >
        {row.rails.map(lane => (
          <line key={`rail${lane}`} x1={x(lane)} x2={x(lane)} y1={0} y2={VB_H} stroke={color(lane)} strokeWidth="2" opacity="0.75" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
        {row.edges.map(({ from, to }, index) => (
          <path
            key={`edge${index}`}
            d={`M ${x(from)} ${VB_H / 2} C ${x(from)} ${VB_H / 2 + CURVE_IN}, ${x(to)} ${VB_H - CURVE_OUT}, ${x(to)} ${VB_H}`}
            fill="none"
            stroke={color(from)}
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <circle cx={x(row.node.lane)} cy={VB_H / 2} r="5.5" fill={row.node.color} stroke="var(--dsw-alias-bg-base)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  )
}
