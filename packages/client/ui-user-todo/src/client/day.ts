/**
 * Local-day derivation for the daily-todo view. Pure functions of an epoch
 * instant plus an optional IANA time zone, so the day bucketing the panel
 * shows follows the browser's clock, parameterizable in tests.
 * @module @deepseek-ai/dsh-client-ui-user-todo/client/day
 */

/** `en-CA` formats ISO dates (`YYYY-MM-DD`) by default, which is the key shape. */
const DAY_KEY_LOCALE = 'en-CA'

/**
 * The local calendar-day key of one epoch instant.
 * @param epochMs - the instant to bucket.
 * @param timeZone - an IANA time-zone name; omitted resolves the system zone,
 * so a live panel always buckets by the browser's clock.
 * @returns the `YYYY-MM-DD` key of that instant's local day.
 */
export function localDayKey(epochMs: number, timeZone?: string): string {
  return new Intl.DateTimeFormat(DAY_KEY_LOCALE, {
    ...(timeZone === undefined ? {} : { timeZone }),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(epochMs))
}

/**
 * Whether two instants fall on the same local calendar day.
 * @param left - the first instant, in epoch milliseconds.
 * @param right - the second instant, in epoch milliseconds.
 * @param timeZone - an IANA time-zone name; omitted resolves the system zone.
 * @returns `true` when both instants share one local day key.
 */
export function sameLocalDay(left: number, right: number, timeZone?: string): boolean {
  return localDayKey(left, timeZone) === localDayKey(right, timeZone)
}

/**
 * A local `YYYY-MM-DD HH:mm` label for one instant, suitable for the due
 * chip (tabular, zone-explicit, deterministic under a pinned zone).
 * @param epochMs - the instant to label.
 * @param timeZone - an IANA time-zone name; omitted resolves the system zone.
 * @returns the formatted local label.
 */
export function formatDueLabel(epochMs: number, timeZone?: string): string {
  const zone = timeZone === undefined ? {} : { timeZone }
  const date = new Intl.DateTimeFormat(DAY_KEY_LOCALE, {
    ...zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(epochMs))
  const time = new Intl.DateTimeFormat('en-GB', {
    ...zone,
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(epochMs))
  return `${date} ${time}`
}

/**
 * Serialize one instant into the value shape a
 * `<input type="datetime-local">` accepts, in the given zone.
 * @param epochMs - the instant to serialize.
 * @param timeZone - an IANA time-zone name; omitted resolves the system zone.
 * @returns the `YYYY-MM-DDTHH:mm` input value.
 */
export function toLocalInputValue(epochMs: number, timeZone?: string): string {
  return formatDueLabel(epochMs, timeZone).replace(' ', 'T')
}
