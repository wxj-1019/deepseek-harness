/**
 * Graph-lane layout for the graph dialog: the same unit-coordinate algorithm
 * the sidebar source-control panel uses (first parent continues the lane,
 * extra parents fork or converge, lanes are never re-indexed so pass-through
 * segments stay straight). Topo-ordered rows stream through a lane table; each
 * row emits segments (x in lane indices, y in [0,1] fractions of the row
 * height) the renderer draws as straight verticals or bezier curves.
 */
import type { GraphCommit } from '../../core/types.ts'

/** One drawn segment in unit coordinates (y: 0 top → 1 bottom of the row). */
export interface GraphSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Color index (cycles through the palette in render order). */
  color: number
}

/** Per-row layout produced for the renderer. */
export interface GraphRowLayout {
  /** Lane the commit node sits on. */
  nodeLane: number
  nodeColor: number
  segments: GraphSegment[]
  /** Lane count this row's drawing spans (drives the column width). */
  width: number
}

/** Lane slots between rows: the parent hash each lane waits for, or null. */
type LaneSlot = { hash: string; color: number } | null

/** How many distinct colors the palette cycles through (must match the
 *  renderer's CSS class count). */
export const GRAPH_COLOR_COUNT = 8

/** Compute per-row layouts for topo-ordered commits (children before parents). */
export function computeGraphLayout(rows: readonly GraphCommit[]): GraphRowLayout[] {
  const lanes: LaneSlot[] = []
  let colorCounter = 0
  const nextColor = (): number => {
    const color = colorCounter % GRAPH_COLOR_COUNT
    colorCounter += 1
    return color
  }
  const firstFreeSlot = (): number => {
    const free = lanes.findIndex(slot => slot === null)
    return free === -1 ? lanes.length : free
  }

  const layouts: GraphRowLayout[] = []
  for (const row of rows) {
    // Locate the commit: the lane waiting for it, or a fresh tip slot (no
    // incoming connector — nothing above points at a cut-off/new tip).
    let lane = lanes.findIndex(slot => slot?.hash === row.oid)
    const isNewTip = lane === -1
    if (isNewTip) {
      lane = firstFreeSlot()
      lanes[lane] = { hash: row.oid, color: nextColor() }
    }
    const nodeColor = lanes[lane]!.color
    const segments: GraphSegment[] = []

    // Converge redundant waits into the node: another lane already waiting
    // for THIS commit is a second child (fork tip / merge flow carried on a
    // parallel lane); it curves in here and is consumed. A lane waiting for a
    // parent is NOT converged — it stays parallel until the parent's own row.
    for (let index = 0; index < lanes.length; index += 1) {
      const slot = lanes[index]
      if (index === lane || slot == null) continue
      if (slot.hash === row.oid) {
        segments.push({ x1: index, y1: 0, x2: lane, y2: 0.5, color: slot.color })
        lanes[index] = null
      }
    }

    // Verticals entering this row: the commit's own lane reaches down to the
    // node only when a child row above connects to it (never on a fresh tip);
    // every other waiting lane passes through the full height.
    for (let index = 0; index < lanes.length; index += 1) {
      const slot = lanes[index]
      if (slot == null || (index === lane && isNewTip)) continue
      segments.push(
        index === lane
          ? { x1: index, y1: 0, x2: index, y2: 0.5, color: slot.color }
          : { x1: index, y1: 0, x2: index, y2: 1, color: slot.color },
      )
    }

    const [firstParent, ...extraParents] = row.parents
    if (firstParent === undefined) {
      // Root commit: its lane ends here.
      lanes[lane] = null
    } else {
      // First parent continues this lane with the commit's color.
      lanes[lane] = { hash: firstParent, color: nodeColor }
      segments.push({ x1: lane, y1: 0.5, x2: lane, y2: 1, color: nodeColor })
    }

    for (const parent of extraParents) {
      if (lanes.some(slot => slot?.hash === parent)) continue // already converging
      // Fork: a brand-new lane carries the second parent onward.
      const fork = firstFreeSlot()
      const color = nextColor()
      lanes[fork] = { hash: parent, color }
      segments.push({ x1: lane, y1: 0.5, x2: fork, y2: 1, color })
    }

    let width = 0
    for (let index = 0; index < lanes.length; index += 1) {
      if (lanes[index] !== null) width = index + 1
    }
    layouts.push({ nodeLane: lane, nodeColor, segments, width: Math.max(width, lane + 1) })
  }
  return layouts
}
