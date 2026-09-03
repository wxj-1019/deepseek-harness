export type PanelProps = BaseProps & { title: string }

/** A panel whose props cross file boundaries. */
export function Panel(props: PanelProps) {
  return <section>{props.title}</section>
}
