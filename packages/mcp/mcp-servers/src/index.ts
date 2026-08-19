/**
 * MCP server composition manager: mounts one `@deepseek-ai/dsh-mcp-client`
 * row per server declared under the `mcp` settings namespace and keeps the
 * mounted set in step with committed settings edits.
 *
 * Class plugin mounted as a loader group row (`group: true`). Each settings
 * server becomes the child row `mcp-servers:<name>` whose config is the entry
 * plus the dictionary-key `serverName`; names under `mcp.disabled` are
 * excluded while their entries stay for a later re-enable. The settings
 * dictionary merges per server, so one edit re-applies exactly that row — the
 * loader's config-diff path — and never touches the others.
 *
 * `env` and `headers` values may reference the ambient environment as
 * `${NAME}`; an unresolved reference skips that server with an error instead
 * of leaking an emptied secret into the child process or request.
 *
 * @module @deepseek-ai/dsh-mcp-servers
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { EntryGroup } from '@deepseek-ai/cordis-plugin-loader'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import z from '@deepseek-ai/schemastery'
import { SERVER_NAME_PATTERN, ServerEntryConfig } from '@deepseek-ai/dsh-mcp-client'
import type { ServerEntry } from '@deepseek-ai/dsh-mcp-client'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
// Side-effect type import: declaration-merges `ctx.settings` onto Context.
import type {} from '@deepseek-ai/dsh-settings'

/** Settings namespace this manager owns. */
const SETTINGS_NAMESPACE = settingsNamespace('mcp')

/** Loader name of the bridge plugin each composed row mounts. */
const MCP_CLIENT_PLUGIN = '@deepseek-ai/dsh-mcp-client'

/** Row id prefix; each settings server becomes `<prefix>:<name>`. */
const ROW_ID_PREFIX = 'mcp-servers'

/** One `${NAME}` reference inside an `env` or `headers` value. */
const ENV_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g

/** The `mcp` settings document: the server dictionary plus excluded names. */
export interface McpSettingsValue {
  /** Server entries keyed by the `serverName` each composed row receives. */
  servers: Record<string, ServerEntry>
  /** Server names excluded from composition; the entries stay for a later re-enable. */
  disabled: string[]
}

/** Schemastery schema for the `mcp` settings namespace. */
export const McpSettings = z.object({
  servers: z.dict(ServerEntryConfig).default({}),
  disabled: z.array(String).default([]),
}) as unknown as z<McpSettingsValue>

/** Outcome of expanding `${NAME}` references in one string. */
type Expansion = { value: string } | { missing: string }

/**
 * Expand every `${NAME}` reference in one value against the ambient environment.
 * @param source - the raw settings value.
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
 * @param dict - raw settings dictionary.
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

/** A composed row's config: the settings entry plus the dictionary-key `serverName`. */
type ComposedConfig = ServerEntry & { serverName: string }

/**
 * Compose loader rows from one resolved `mcp` settings value. Pure: each
 * composition problem is reported through `report` and skips only that server.
 * @param value - resolved `mcp` settings value.
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

  static inject = ['settings']

  constructor(ctx: Context) {
    super(ctx, ctx.fiber.entry!.parent.tree)
  }

  async* [Service.init](): AsyncGenerator<() => void, void, void> {
    // Registered first so a disposal during the initial composition still
    // tears the mounted rows down.
    yield () => { void this.stop() }
    const scope = this.ctx.settings.register(SETTINGS_NAMESPACE, McpSettings)
    const unwatch = scope.watch((next) => {
      void this.update(composeRows(next, (message) => this.ctx.logger.error(message)))
    })
    yield () => { unwatch() }
    await this.update(composeRows(scope.get(), (message) => this.ctx.logger.error(message)))
  }
}
