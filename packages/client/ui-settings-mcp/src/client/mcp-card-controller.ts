/**
 * The MCP servers card controller: a projection of the `mcp` settings
 * namespace (server list + disabled names) and the path-op mutations the card
 * issues — per-server edits, enable/disable parking, and removal. Every write
 * carries the namespace revision, so a concurrent edit elsewhere surfaces as
 * the card's conflict message rather than a silent overwrite.
 */

import type { ClientRemote, SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/**
 * Namespace of the MCP server composition. Spelled here rather than imported:
 * a client package must not depend on a Host package.
 */
export const MCP_SETTINGS_NS = 'mcp'

/** One MCP server entry as the wire schema resolves it (fields optional per transport). */
export interface McpServerEntryView {
  /** Transport selector; narrows which fields the entry carries. */
  transport: 'stdio' | 'streamable-http'
  /** stdio: executable to spawn. */
  command?: string
  /** stdio: arguments passed to the command. */
  args?: string[]
  /** stdio: extra env vars; values may reference the ambient environment as `${NAME}`. */
  env?: Record<string, string>
  /** stdio: working directory for the child process. */
  cwd?: string
  /** streamable-http: MCP endpoint URL. */
  url?: string
  /** streamable-http: extra headers; values may reference `${NAME}`. */
  headers?: Record<string, string>
  /** Per-tool-call timeout (ms). */
  toolCallTimeoutMs?: number
  /** Initial connect + discovery budget (ms). */
  startupTimeoutMs?: number
  /** Reject the composed row's activation when startup fails. */
  failOnStartupError?: boolean
  /** Automatic reconnect policy after a lost connection. */
  reconnect?: { enabled?: boolean; initialDelayMs?: number; maxDelayMs?: number; maxAttempts?: number }
}

/** The `mcp` settings section as the card reads it. */
export interface McpSettingsView {
  /** Server entries keyed by the serverName each composed row receives. */
  servers: Record<string, McpServerEntryView>
  /** Server names parked out of composition without deleting their entries. */
  disabled: string[]
}

/** One rendered server row. */
export interface McpServerRow {
  /** Dictionary key: the row's `serverName`. */
  name: string
  /** The stored entry. */
  entry: McpServerEntryView
  /** False when the name sits in `disabled`. */
  enabled: boolean
}

/** What the MCP card renders. */
export interface McpCardState {
  /** Scope sync status; `unavailable` renders the card away. */
  status: 'loading' | 'ready' | 'unavailable'
  /** Servers sorted by name. */
  servers: McpServerRow[]
  /** Whether the Host document accepts writes. */
  writable: boolean
  /** A mutation is in flight; inputs disable. */
  busy: boolean
  /** Last mutation failure message; cleared by the next successful write. */
  error: string | undefined
}

/** Bridges the `mcp` scope and the settings mutation domain onto the card. */
export class McpCardController {
  /** Card projection the slot renderer binds as useMcpCard. */
  readonly store: SnapshotStore<McpCardState>
  private busy = false
  private errorMessage: string | undefined

  /**
   * @param scope - the bound settings scope for the `mcp` namespace.
   * @param api - wire face carrying `settings.mutate`.
   * @param messages - failure copy: `conflict` for a revision race, `unavailable` for a rejected write.
   */
  constructor(
    private readonly scope: SettingsScope<McpSettingsView>,
    private readonly api: Pick<ClientRemote, 'settings'>,
    private readonly messages: { conflict: string; unavailable: string },
  ) {
    this.store = createSnapshotStore<McpCardState>(this.project())
    scope.subscribe(() => { this.store.set(this.project()) })
  }

  /** Park one server in or out of composition without touching its entry. */
  async setEnabled(name: string, enabled: boolean): Promise<void> {
    const { value } = this.scope.getSnapshot()
    if (value === undefined) return
    const next = enabled
      ? value.disabled.filter(existing => existing !== name)
      : [...new Set([...value.disabled, name])]
    await this.apply([{ op: 'set', path: ['disabled'], value: next }])
  }

  /** Remove one server's entry (and any parked reference to it). */
  async remove(name: string): Promise<void> {
    const { value } = this.scope.getSnapshot()
    if (value === undefined) return
    const ops: SettingsPathOpView[] = [{ op: 'unset', path: ['servers', name] }]
    if (value.disabled.includes(name)) {
      ops.push({ op: 'set', path: ['disabled'], value: value.disabled.filter(existing => existing !== name) })
    }
    await this.apply(ops)
  }

  /** Add or replace one server entry under its dictionary key. */
  async save(name: string, entry: McpServerEntryView): Promise<void> {
    await this.apply([{ op: 'set', path: ['servers', name], value: entry as never }])
  }

  /** One revision-fenced mutation; a failure lands on the card as its message. */
  private async apply(ops: SettingsPathOpView[]): Promise<void> {
    const { revision } = this.scope.getSnapshot()
    if (revision === undefined) return
    this.busy = true
    this.errorMessage = undefined
    this.store.set(this.project())
    try {
      await this.api.settings.mutate(MCP_SETTINGS_NS, ops, revision)
    } catch (error) {
      const code = (error as { code?: string }).code
      this.errorMessage = code === 'settings/conflict'
        ? this.messages.conflict
        : this.messages.unavailable
    } finally {
      this.busy = false
      this.store.set(this.project())
    }
  }

  /** Project the scope snapshot into the card state. */
  private project(): McpCardState {
    const snapshot = this.scope.getSnapshot()
    const value = snapshot.value
    return {
      status: snapshot.status === 'ready' ? 'ready' : snapshot.status,
      servers: value === undefined
        ? []
        : Object.entries(value.servers)
          .map(([name, entry]) => ({ name, entry, enabled: !value.disabled.includes(name) }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      writable: snapshot.writable,
      busy: this.busy,
      error: this.errorMessage,
    }
  }
}
