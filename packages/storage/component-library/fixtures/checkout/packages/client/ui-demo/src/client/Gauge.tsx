interface GaugeProps {
  readonly label: string
  readonly value: number
  hint?: string
}

/** One dashboard gauge. */
export function Gauge(props: GaugeProps) {
  return <div>{props.label}</div>
}

/** Companion badge with an inline props literal. */
export const GaugeBadge = (props: { tone: 'info' | 'warn' }) => <span>{props.tone}</span>
