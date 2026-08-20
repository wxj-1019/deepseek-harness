/**
 * The MCP servers card in the Plugins settings section's configurable tab:
 * the server list with enable/disable parking, add/edit forms, and removal.
 * Every field a composed entry can own is edited here except the dictionary
 * key's own semantics — the key names the model-facing tool namespace.
 */
import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: loads the `settings.mcpServers` LocaleNamespaceMap merge the locale seat resolves against.
import type {} from './locales.ts'
// Type-only: pulls the `settings.plugin.item` SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { McpCardController, McpCardState, McpServerEntryView } from './mcp-card-controller.ts'
import css from './McpCard.module.css'

/** Valid server name, mirrored from the composition contract (client packages spell host constants). */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** The registration-side face the MCP card's slot entry injects. */
export interface McpCardFace {
  hooks: {
    /** Card snapshot bound by the renderer as useMcpCard. */
    mcpCard: SnapshotStore<McpCardState>
  }
  /** Park one server in or out of composition. */
  setEnabled: (name: string, enabled: boolean) => void
  /** Remove one server entry. */
  remove: (name: string) => void
  /** Add or replace one server entry. */
  save: (name: string, entry: McpServerEntryView) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type McpCardComponentProps =
  PropsRuntime<'settings.plugin.item'> & PropsStore<SnapshotStore<McpCardState>>
  & PropsLocale<'settings.mcpServers'> & InjectFace<McpCardFace>

/** Parse a KEY=VALUE-per-line block into a record; blank lines and comments skip. */
function parseKeyValueBlock(block: string): Record<string, string> {
  const record: Record<string, string> = {}
  for (const line of block.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    record[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1)
  }
  return record
}

/** Render a record back into a KEY=VALUE-per-line block. */
function formatKeyValueBlock(record: Record<string, string> | undefined): string {
  if (record === undefined) return ''
  return Object.entries(record).map(([key, value]) => `${key}=${value}`).join('\n')
}

/** Local draft of one entry under construction. */
interface ServerDraft {
  transport: 'stdio' | 'streamable-http'
  command: string
  args: string
  env: string
  cwd: string
  url: string
  headers: string
  toolCallTimeoutMs: string
  startupTimeoutMs: string
  failOnStartupError: boolean
}

/** Seed a draft from a stored entry, or blank for a new one. */
function draftFrom(entry: McpServerEntryView | undefined): ServerDraft {
  return {
    transport: entry?.transport ?? 'stdio',
    command: entry?.command ?? '',
    args: (entry?.args ?? []).join('\n'),
    env: formatKeyValueBlock(entry?.env),
    cwd: entry?.cwd ?? '',
    url: entry?.url ?? '',
    headers: formatKeyValueBlock(entry?.headers),
    toolCallTimeoutMs: entry?.toolCallTimeoutMs === undefined ? '' : String(entry.toolCallTimeoutMs),
    startupTimeoutMs: entry?.startupTimeoutMs === undefined ? '' : String(entry.startupTimeoutMs),
    failOnStartupError: entry?.failOnStartupError ?? false,
  }
}

/** Validate a draft; the first failure names its locale key, or the draft builds an entry. */
function draftToEntry(draft: ServerDraft): { key: 'required' } | { entry: McpServerEntryView } {
  const optionalNumber = (raw: string): number | undefined => {
    const trimmed = raw.trim()
    return /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : undefined
  }
  const args = draft.args.split('\n').map(line => line.trim()).filter(line => line.length > 0)
  const env = parseKeyValueBlock(draft.env)
  const headers = parseKeyValueBlock(draft.headers)
  const toolCallTimeoutMs = optionalNumber(draft.toolCallTimeoutMs)
  const startupTimeoutMs = optionalNumber(draft.startupTimeoutMs)
  if (draft.transport === 'stdio') {
    if (draft.command.trim().length === 0) return { key: 'required' }
    // Conditional spreads keep absent fields absent (exactOptionalPropertyTypes).
    const entry: McpServerEntryView = {
      transport: 'stdio',
      command: draft.command.trim(),
      ...(args.length > 0 ? { args } : {}),
      ...(Object.keys(env).length > 0 ? { env } : {}),
      ...(draft.cwd.trim().length > 0 ? { cwd: draft.cwd.trim() } : {}),
      ...(toolCallTimeoutMs !== undefined ? { toolCallTimeoutMs } : {}),
      ...(startupTimeoutMs !== undefined ? { startupTimeoutMs } : {}),
      ...(draft.failOnStartupError ? { failOnStartupError: true } : {}),
    }
    return { entry }
  }
  if (draft.url.trim().length === 0) return { key: 'required' }
  const entry: McpServerEntryView = {
    transport: 'streamable-http',
    url: draft.url.trim(),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(toolCallTimeoutMs !== undefined ? { toolCallTimeoutMs } : {}),
    ...(startupTimeoutMs !== undefined ? { startupTimeoutMs } : {}),
    ...(draft.failOnStartupError ? { failOnStartupError: true } : {}),
  }
  return { entry }
}

/** One add/edit form. Uncontrolled beyond its own draft; Save is the only write. */
function ServerForm(props: {
  initialName: string
  initialEntry: McpServerEntryView | undefined
  namesTaken: (candidate: string) => boolean
  busy: boolean
  t: PropsLocale<'settings.mcpServers'>['t']
  onCancel: () => void
  onSave: (name: string, entry: McpServerEntryView) => void
}) {
  const [name, setName] = useState(props.initialName)
  const [draft, setDraft] = useState<ServerDraft>(() => draftFrom(props.initialEntry))
  const nameInvalid = name.length > 0 && !SERVER_NAME_PATTERN.test(name)
  const nameTaken = name.length > 0 && name !== props.initialName && props.namesTaken(name)
  const built = draftToEntry(draft)
  const disabled = props.busy || name.length === 0 || nameInvalid || nameTaken || 'key' in built
  const set = (patch: Partial<ServerDraft>): void => { setDraft(current => ({ ...current, ...patch })) }
  return (
    <form
      className={css.form}
      onSubmit={(event) => {
        event.preventDefault()
        if (!disabled && 'entry' in built) props.onSave(name, built.entry)
      }}
    >
      <label className={css.field}>
        <span>{props.t('mcpCard.name')}</span>
        <input value={name} aria-label={props.t('mcpCard.name')} disabled={props.busy || props.initialEntry !== undefined}
          onChange={(event) => { setName(event.target.value) }} />
      </label>
      {nameInvalid ? <p className={css.error} role="alert">{props.t('mcpCard.nameInvalid')}</p> : null}
      {nameTaken ? <p className={css.error} role="alert">{props.t('mcpCard.nameTaken')}</p> : null}
      <label className={css.field}>
        <span>{props.t('mcpCard.transport')}</span>
        <select value={draft.transport} aria-label={props.t('mcpCard.transport')} disabled={props.busy}
          onChange={(event) => { set({ transport: event.target.value as ServerDraft['transport'] }) }}>
          <option value="stdio">stdio</option>
          <option value="streamable-http">streamable-http</option>
        </select>
      </label>
      {draft.transport === 'stdio' ? (
        <>
          <label className={css.field}>
            <span>{props.t('mcpCard.command')}</span>
            <input value={draft.command} aria-label={props.t('mcpCard.command')} disabled={props.busy}
              onChange={(event) => { set({ command: event.target.value }) }} />
          </label>
          {'key' in built ? <p className={css.error} role="alert">{props.t('mcpCard.required')}</p> : null}
          <label className={css.field}>
            <span>{props.t('mcpCard.args')}</span>
            <textarea value={draft.args} aria-label={props.t('mcpCard.args')} disabled={props.busy} rows={2}
              onChange={(event) => { set({ args: event.target.value }) }} />
          </label>
          <label className={css.field}>
            <span>{props.t('mcpCard.env')}</span>
            <textarea value={draft.env} aria-label={props.t('mcpCard.env')} disabled={props.busy} rows={2}
              onChange={(event) => { set({ env: event.target.value }) }} />
          </label>
          <label className={css.field}>
            <span>{props.t('mcpCard.cwd')}</span>
            <input value={draft.cwd} aria-label={props.t('mcpCard.cwd')} disabled={props.busy}
              onChange={(event) => { set({ cwd: event.target.value }) }} />
          </label>
        </>
      ) : (
        <>
          <label className={css.field}>
            <span>{props.t('mcpCard.url')}</span>
            <input value={draft.url} aria-label={props.t('mcpCard.url')} disabled={props.busy}
              onChange={(event) => { set({ url: event.target.value }) }} />
          </label>
          {'key' in built ? <p className={css.error} role="alert">{props.t('mcpCard.required')}</p> : null}
          <label className={css.field}>
            <span>{props.t('mcpCard.headers')}</span>
            <textarea value={draft.headers} aria-label={props.t('mcpCard.headers')} disabled={props.busy} rows={2}
              onChange={(event) => { set({ headers: event.target.value }) }} />
          </label>
        </>
      )}
      <details className={css.advanced}>
        <summary>{props.t('mcpCard.advanced')}</summary>
        <label className={css.field}>
          <span>{props.t('mcpCard.toolCallTimeoutMs')}</span>
          <input inputMode="numeric" value={draft.toolCallTimeoutMs} aria-label={props.t('mcpCard.toolCallTimeoutMs')} disabled={props.busy}
            onChange={(event) => { set({ toolCallTimeoutMs: event.target.value }) }} />
        </label>
        <label className={css.field}>
          <span>{props.t('mcpCard.startupTimeoutMs')}</span>
          <input inputMode="numeric" value={draft.startupTimeoutMs} aria-label={props.t('mcpCard.startupTimeoutMs')} disabled={props.busy}
            onChange={(event) => { set({ startupTimeoutMs: event.target.value }) }} />
        </label>
        <label className={css.check}>
          <input type="checkbox" checked={draft.failOnStartupError} aria-label={props.t('mcpCard.failOnStartupError')} disabled={props.busy}
            onChange={(event) => { set({ failOnStartupError: event.target.checked }) }} />
          <span>{props.t('mcpCard.failOnStartupError')}</span>
        </label>
      </details>
      <div className={css.formActions}>
        <button type="submit" disabled={disabled}>{props.t('mcpCard.save')}</button>
        <button type="button" onClick={props.onCancel}>{props.t('mcpCard.cancel')}</button>
      </div>
    </form>
  )
}

/** Render the MCP servers card. */
export function McpCard(props: McpCardComponentProps) {
  const { t, useMcpCard, setEnabled, remove, save } = props
  const state = useMcpCard(s => s)
  const [editing, setEditing] = useState<{ name: string; isNew: boolean } | undefined>(undefined)
  if (state.status !== 'ready') return null
  const disabled = !state.writable || state.busy
  return (
    <li className={css.card}>
      <div className={css.head}>
        <div>
          <div className={css.title}>{t('mcpCard.title')}</div>
          <div className={css.description}>{t('mcpCard.description')}</div>
        </div>
      </div>
      {state.error === undefined ? null : <p className={css.error} role="alert">{state.error}</p>}
      {state.servers.length === 0 && editing === undefined
        ? <p className={css.empty}>{t('mcpCard.empty')}</p>
        : null}
      <ul className={css.list}>
        {state.servers.map(row => (
          editing !== undefined && !editing.isNew && editing.name === row.name
            ? (
              <li key={row.name} className={css.editingRow}>
                <ServerForm
                  initialName={row.name}
                  initialEntry={row.entry}
                  namesTaken={candidate => state.servers.some(other => other.name === candidate)}
                  busy={state.busy}
                  t={t}
                  onCancel={() => { setEditing(undefined) }}
                  onSave={(name, entry) => { save(name, entry); setEditing(undefined) }}
                />
              </li>
            )
            : (
              <li key={row.name} className={css.row}>
                <span className={css.rowName}>{row.name}</span>
                <span className={css.rowTransport}>{row.entry.transport}</span>
                <button type="button" disabled={disabled}
                  onClick={() => { setEnabled(row.name, !row.enabled) }}>
                  {row.enabled ? t('mcpCard.disable') : t('mcpCard.enable')}
                </button>
                <button type="button" disabled={disabled} onClick={() => { setEditing({ name: row.name, isNew: false }) }}>
                  {t('mcpCard.edit')}
                </button>
                <button type="button" disabled={disabled}
                  onClick={() => { if (window.confirm(t('mcpCard.confirmRemove'))) remove(row.name) }}>
                  {t('mcpCard.remove')}
                </button>
              </li>
            )
        ))}
        {editing !== undefined && editing.isNew
          ? (
            <li className={css.editingRow}>
              <ServerForm
                initialName=""
                initialEntry={undefined}
                namesTaken={candidate => state.servers.some(other => other.name === candidate)}
                busy={state.busy}
                t={t}
                onCancel={() => { setEditing(undefined) }}
                onSave={(name, entry) => { save(name, entry); setEditing(undefined) }}
              />
            </li>
          )
          : null}
      </ul>
      {editing === undefined
        ? <button type="button" className={css.add} disabled={disabled} onClick={() => { setEditing({ name: '', isNew: true }) }}>{t('mcpCard.add')}</button>
        : null}
    </li>
  )
}

/** Re-exported for the slot registration's store/inject wiring in index.ts. */
export type { McpCardController }
