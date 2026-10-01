/**
 * MCP server composition manager: mounts one `@deepseek-ai/dsh-mcp-client`
 * row per server declared in this group entry's volatile Config and keeps the
 * mounted set in step with live configuration edits.
 *
 * Class plugin mounted as a loader group row (`group: true`). Each configured
 * server becomes the child row `mcp-servers:<name>` whose config is the entry
 * plus the dictionary-key `serverName`; names under `disabled` are excluded
 * while their entries stay for a later re-enable. Both Config fields are
 * volatile, so a settings edit commits into the running references and
 * `loader/volatile-update` re-composes exactly the changed rows — the
 * loader's per-entry update path — without remounting this manager.
 *
 * `env` and `headers` values may reference the ambient environment as
 * `${NAME}`; an unresolved reference skips that server with an error instead
 * of leaking an emptied secret into the child process or request.
 *
 * @module @deepseek-ai/dsh-mcp-servers
 */

import { Context, Service, type Volatile } from '@deepseek-ai/cordis'
import { EntryGroup } from '@deepseek-ai/cordis-plugin-loader'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import z from '@deepseek-ai/schemastery'
import { SERVER_NAME_PATTERN, ServerEntryConfig } from '@deepseek-ai/dsh-mcp-client'
import type { ServerEntry } from '@deepseek-ai/dsh-mcp-client'
// Type-only: the Loader emits `loader/volatile-update` after committing a live
// edit into this entry's volatile Config references.
import type {} from '@deepseek-ai/cordis-plugin-loader'

/** Loader name of the bridge plugin each composed row mounts. */
const MCP_CLIENT_PLUGIN = '@deepseek-ai/dsh-mcp-client'

/** Row id prefix; each configured server becomes `<prefix>:<name>`. */
const ROW_ID_PREFIX = 'mcp-servers'

/** One `${NAME}` reference inside an `env` or `headers` value. */
const ENV_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g

/** The plain server dictionary plus excluded names. */
export interface McpSettingsValue {
  /** Server entries keyed by the `serverName` each composed row receives. */
  servers: Record<string, ServerEntry>
  /** Server names excluded from composition; the entries stay for a later re-enable. */
  disabled: string[]
}

/** Schemastery schema for this plugin's Config; both fields edit live. */
export const McpSettings = z.object({
  servers: z.dict(ServerEntryConfig).default({}).volatile(),
  disabled: z.array(String).default([]).volatile(),
})

/** Resolved Config: volatile fields arrive as live references. */
export interface Config {
  /** Live reference to the server dictionary. */
  servers: Volatile<Record<string, ServerEntry>>
  /** Live reference to the excluded server names. */
  disabled: Volatile<string[]>
}

/** Outcome of expanding `${NAME}` references in one string. */
type Expansion = { value: string } | { missing: string }

/**
 * Expand every `${NAME}` reference in one value against the ambient environment.
 * @param source - the raw configured value.
 * @returns the expanded value, or the first variable name that resolved to nothing.
 */
function expandReferences(source: string): Expansion {
  let missing: string | undefined
  const value = source.replace(ENV_REFERENCE, (_match, name: string) => {
    const resolved = process.env[name]
    if (resolved === undefined) {
      missing ??= name
      return ''
    }
    return resolved
  })
  return missing === undefined ? { value } : { missing }
}

/** Outcome of expanding one env/headers dictionary. */
type DictExpansion = { value: Record<string, string> } | { missing: { key: string; name: string } }

/**
 * Expand every value of an env/headers dictionary, or report the key holding
 * the first unresolved reference.
 * @param dict - raw configured dictionary.
 * @returns the expanded dictionary, or the failing key and variable name.
 */
function expandDict(dict: Record<string, string>): DictExpansion {
  const value: Record<string, string> = {}
  for (const [key, source] of Object.entries(dict)) {
    const expansion = expandReferences(source)
    if ('missing' in expansion) return { missing: { key, name: expansion.missing } }
    value[key] = expansion.value
  }
  return { value }
}

/** A composed row's config: the configured entry plus the dictionary-key `serverName`. */
type ComposedConfig = ServerEntry & { serverName: string }

/**
 * Compose loader rows from one resolved Config value. Pure: each composition
 * problem is reported through `report` and skips only that server.
 * @param value - resolved server dictionary and disabled names.
 * @param report - error sink naming skipped servers; the plugin passes its logger.
 * @returns rows for the loader group, one per enabled server.
 */
export function composeRows(value: McpSettingsValue, report: (message: string) => void): EntryOptions[] {
  const rows: EntryOptions[] = []
  for (const [name, entry] of Object.entries(value.servers)) {
    if (value.disabled.includes(name)) continue
    if (!SERVER_NAME_PATTERN.test(name)) {
      report(`mcp-servers: server name "${name}" must match ${SERVER_NAME_PATTERN.source} — server skipped`)
      continue
    }
    let config: ComposedConfig
    if (entry.transport === 'stdio') {
      const expansion = expandDict(entry.env)
      if ('missing' in expansion) {
        report(`mcp-servers: env.${expansion.missing.key} references unset environment variable ${expansion.missing.name} — server "${name}" skipped`)
        continue
      }
      config = { ...entry, serverName: name, env: expansion.value }
    } else {
      const expansion = expandDict(entry.headers)
      if ('missing' in expansion) {
        report(`mcp-servers: headers.${expansion.missing.key} references unset environment variable ${expansion.missing.name} — server "${name}" skipped`)
        continue
      }
      config = { ...entry, serverName: name, headers: expansion.value }
    }
    rows.push({ id: `${ROW_ID_PREFIX}:${name}`, name: MCP_CLIENT_PLUGIN, config })
  }
  return rows
}

/** MCP server composition manager mounted as a loader group row. */
export default class McpServers extends EntryGroup {
  static readonly [EntryGroup.key] = true

  static Config = McpSettings

  constructor(ctx: Context, private readonly config: Config) {
    const entry = ctx.fiber.entry
    if (entry === undefined) throw new Error('mcp-servers requires an owning loader entry')
    super(ctx, entry.parent.tree)
    // Live edits land as volatile commits on this entry, not as a remount.
    ctx.on('loader/volatile-update', () => { void this.compose() })
  }

  /** Snapshot the current server dictionary and disabled names. */
  private current(): McpSettingsValue {
    // Volatile snapshots are deep-readonly; composition only reads them and
    // each composed row receives a fresh object.
    return {
      servers: this.config.servers.get() as Record<string, ServerEntry>,
      disabled: [...this.config.disabled.get()],
    }
  }

  /** Reconcile the mounted rows with the current Config value. */
  private async compose(): Promise<void> {
    await this.update(composeRows(this.current(), (message) => { this.ctx.logger.error(message) }))
  }

  async* [Service.init](): AsyncGenerator<() => void, void, void> {
    // Registered first so a disposal during the initial composition still
    // tears the mounted rows down.
    yield () => { this.stop() }
    await this.compose()
  }
}
