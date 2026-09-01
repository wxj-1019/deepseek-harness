import { describe, expect, it } from 'vitest'
import { assignGraphRows } from '../src/client/CommitGraphRail.tsx'

describe('commit graph lane assignment', () => {
  it('keeps a linear chain on one lane without transition curves', () => {
    const rows = assignGraphRows([
      { hashFull: 'h1', parents: ['h2'] },
      { hashFull: 'h2', parents: ['h3'] },
      { hashFull: 'h3', parents: [] },
    ])
    expect(rows.map(row => row.node.lane)).toEqual([0, 0, 0])
    expect(rows.map(row => row.rails)).toEqual([[0], [0], [0]])
    expect(rows.flatMap(row => row.edges)).toEqual([])
  })

  it('fans a merge commit out into the nearest free lane', () => {
    const rows = assignGraphRows([
      { hashFull: 'm', parents: ['a', 'b'] },
      { hashFull: 'a', parents: [] },
      { hashFull: 'b', parents: [] },
    ])
    expect(rows[0]).toMatchObject({
      node: { lane: 0 },
      rails: [0, 1],
      edges: [{ from: 0, to: 1 }],
    })
    // The side parent keeps its own rail until its dot consumes it.
    expect(rows[1]?.rails).toEqual([0, 1])
    expect(rows[2]).toMatchObject({ node: { lane: 1 }, edges: [] })
  })

  it('curves a sibling child onto the shared-parent rail it joined late', () => {
    const rows = assignGraphRows([
      { hashFull: 'c1', parents: ['p'] },
      { hashFull: 'c2', parents: ['p'] },
    ])
    // c1 owns lane 0 and flows straight to p; c2 cannot reuse it and joins via a curve.
    expect(rows[0]).toMatchObject({ node: { lane: 0 }, rails: [0], edges: [] })
    expect(rows[1]).toMatchObject({
      node: { lane: 1 },
      rails: [0, 1],
      edges: [{ from: 1, to: 0 }],
    })
  })

  it('renders entries without parents as plain dots on lane 0', () => {
    const rows = assignGraphRows([{ hashFull: 'z', parents: [] }])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ node: { lane: 0 }, rails: [0], edges: [], laneCount: 4 })
  })
})
