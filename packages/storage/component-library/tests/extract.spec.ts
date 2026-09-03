import { describe, expect, it } from 'vitest'
import { extractComponents, extractCssTokenRefs } from '../src/extract.ts'

describe('extractComponents', () => {
  it('extracts an exported function component with a local props interface', () => {
    const source = `
interface GaugeProps {
  readonly label: string
  readonly value: number
  hint?: string
}

/** Renders one gauge. */
export function Gauge(props: GaugeProps) {
  return <div>{props.label}</div>
}
`
    const [component] = extractComponents('Gauge.tsx', source)
    expect(component?.name).toBe('Gauge')
    expect(component?.jsdoc).toBe('Renders one gauge.')
    expect(component?.propsInferred).toBe(true)
    expect(component?.props).toEqual([
      { name: 'label', type: 'string', required: true },
      { name: 'value', type: 'number', required: true },
      { name: 'hint', type: 'string', required: false },
    ])
  })

  it('extracts an exported const arrow component with an inline props literal', () => {
    const source = `
export const Chip = (props: { label: string; onClose?: () => void }) => <button />
`
    const [component] = extractComponents('Chip.tsx', source)
    expect(component?.name).toBe('Chip')
    expect(component?.propsInferred).toBe(true)
    expect(component?.props).toEqual([
      { name: 'label', type: 'string', required: true },
      { name: 'onClose', type: '() => void', required: false },
    ])
  })

  it('resolves a type alias that points at a literal', () => {
    const source = `
type BadgeProps = { tone: 'info' | 'warn' }
export function Badge(props: BadgeProps) { return null }
`
    const [component] = extractComponents('Badge.tsx', source)
    expect(component?.propsInferred).toBe(true)
    expect(component?.props).toEqual([{ name: 'tone', type: "'info' | 'warn'", required: true }])
  })

  it('keeps the raw type text for an intersection with unresolvable operands', () => {
    const source = `
export type PanelProps = BaseProps & { title: string }
export function Panel(props: PanelProps) { return null }
`
    const [component] = extractComponents('Panel.tsx', source)
    expect(component?.propsInferred).toBe(false)
    expect(component?.props).toEqual([])
    expect(component?.rawProps).toBe('BaseProps & { title: string }')
  })

  it('falls back to the exported Props type when the parameter is unannotated', () => {
    const source = `
export interface Props { readonly count: number }
export const Counter = (props) => <span>{props.count}</span>
`
    const [component] = extractComponents('Counter.tsx', source)
    expect(component?.propsInferred).toBe(true)
    expect(component?.props).toEqual([{ name: 'count', type: 'number', required: true }])
  })

  it('records an empty props list for a component without a props parameter', () => {
    const source = 'export function Separator() { return <hr /> }'
    const [component] = extractComponents('Separator.tsx', source)
    expect(component?.propsInferred).toBe(true)
    expect(component?.props).toEqual([])
    expect(component?.rawProps).toBe('')
  })

  it('marks an interface with a heritage clause as too dynamic', () => {
    const source = `
interface RowProps extends React.HTMLAttributes<HTMLDivElement> { readonly cells: string[] }
export function Row(props: RowProps) { return null }
`
    const [component] = extractComponents('Row.tsx', source)
    expect(component?.propsInferred).toBe(false)
    expect(component?.rawProps).toContain('cells')
  })

  it('reads the @example block', () => {
    const source = `
/**
 * One card.
 * @example
 * <Card title="Hi" />
 */
export function Card(props: { title: string }) { return null }
`
    const [component] = extractComponents('Card.tsx', source)
    expect(component?.jsdoc).toBe('One card.')
    expect(component?.example).toBe('<Card title="Hi" />')
  })

  it('skips non-component exports and non-exported declarations', () => {
    const source = `
export const helper = () => 1
function Local() { return null }
export const MAX = 3
`
    expect(extractComponents('util.tsx', source)).toEqual([])
  })

  it('recognizes a memo-wrapped component and resolves its named props type', () => {
    const source = `
interface TileProps { readonly label: string }
export const Tile = memo(function Tile(props: TileProps) { return null })
`
    const [component] = extractComponents('Tile.tsx', source)
    expect(component?.name).toBe('Tile')
    expect(component?.propsInferred).toBe(true)
    expect(component?.props).toEqual([{ name: 'label', type: 'string', required: true }])
  })

  it('extracts multiple components from one file in source order', () => {
    const source = `
export function Alpha() { return null }
export const Beta = () => null
`
    const components = extractComponents('pair.tsx', source)
    expect(components.map(component => component.name)).toEqual(['Alpha', 'Beta'])
  })
})

describe('extractCssTokenRefs', () => {
  it('collects sorted unique --dsw-* references', () => {
    const css = `
.card { color: var(--dsw-alias-label-primary); background: var(--dsw-static-blue-500); }
.card:hover { color: var(--dsw-alias-label-primary); }
`
    expect(extractCssTokenRefs(css)).toEqual(['--dsw-alias-label-primary', '--dsw-static-blue-500'])
  })

  it('returns an empty list for a stylesheet without dsw tokens', () => {
    expect(extractCssTokenRefs('.a { color: red; }')).toEqual([])
  })
})
