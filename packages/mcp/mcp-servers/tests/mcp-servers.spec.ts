/**
 * Unit tests for the mcp-servers composition: settings schema resolution and
 * the pure settings-to-rows composition (serverName injection, disabled
 * exclusion, `${NAME}` expansion, per-server skip reporting).
 */
import { describe, expect, it, vi } from 'vitest'
import { composeRows, McpSettings } from '@deepseek-ai/dsh-mcp-servers/src/index.ts'
import type { McpSettingsValue } from '@deepseek-ai/dsh-mcp-servers/src/index.ts'
import type { ServerEntry } from '@deepseek-ai/dsh-mcp-client'

const stdioEntry: ServerEntry = {
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'server-github'],
  env: { GITHUB_TOKEN: 'literal' },
  cwd: '',
  toolCallTimeoutMs: 60_000,
  startupTimeoutMs: 60_000,
  failOnStartupError: false,
  reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 },
}

const httpEntry: ServerEntry = {
  transport: 'streamable-http',
  url: 'http://localhost:3000/mcp',
  headers: { Authorization: 'Bearer literal' },
  toolCallTimeoutMs: 60_000,
  startupTimeoutMs: 60_000,
  failOnStartupError: false,
  reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 },
}

function settings(servers: Record<string, ServerEntry>, disabled: string[] = []): McpSettingsValue {
  return McpSettings({ servers, disabled })
}

// ---- Schema ----

describe('McpSettings schema', () => {
  it('resolves an absent section to empty servers and no disabled names', () => {
    expect(McpSettings({} as never)).toEqual({ servers: {}, disabled: [] })
    expect(McpSettings(undefined as never)).toEqual({ servers: {}, disabled: [] })
  })

  it('resolves stdio and streamable-http entries through the dictionary union', () => {
    const value = McpSettings({ servers: { gh: stdioEntry, web: httpEntry }, disabled: ['web'] })
    expect(Object.keys(value.servers)).toEqual(['gh', 'web'])
    expect(value.servers.gh).toEqual(stdioEntry)
    expect(value.disabled).toEqual(['web'])
  })

  it('rejects an entry whose transport matches neither branch', () => {
    expect(() => McpSettings({ servers: { bad: { transport: 'sse' } as never } } as never)).toThrow()
  })
})

// ---- composeRows ----

describe('composeRows', () => {
  it('composes one row per server with the dictionary key as serverName', () => {
    const rows = composeRows(settings({ gh: stdioEntry }), () => {})
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      id: 'mcp-servers:gh',
      name: '@deepseek-ai/dsh-mcp-client',
      config: { ...stdioEntry, serverName: 'gh' },
    })
  })

  it('composes streamable-http rows and keeps multiple servers in dictionary order', () => {
    const rows = composeRows(settings({ gh: stdioEntry, web: httpEntry }), () => {})
    expect(rows.map(row => row.id)).toEqual(['mcp-servers:gh', 'mcp-servers:web'])
    expect(rows[1]!.config).toEqual({ ...httpEntry, serverName: 'web' })
  })

  it('excludes disabled names without reporting them', () => {
    const report = vi.fn()
    const rows = composeRows(settings({ gh: stdioEntry }, ['gh']), report)
    expect(rows).toHaveLength(0)
    expect(report).not.toHaveBeenCalled()
  })

  it('skips an invalid server name and reports the pattern', () => {
    const messages: string[] = []
    const rows = composeRows(settings({ 'has space': stdioEntry }), message => messages.push(message))
    expect(rows).toHaveLength(0)
    expect(messages).toEqual([
      'mcp-servers: server name "has space" must match ^[A-Za-z0-9_-]{1,32}$ — server skipped',
    ])
  })

  it('expands ${NAME} references in stdio env values', () => {
    vi.stubEnv('MCP_TEST_TOKEN', 'secret-value')
    try {
      const entry = { ...stdioEntry, env: { TOKEN: '${MCP_TEST_TOKEN}', KEEP: 'literal', BOTH: '${MCP_TEST_TOKEN}-suffix' } }
      const rows = composeRows(settings({ gh: entry }), () => {})
      expect(rows[0]!.config.env).toEqual({ TOKEN: 'secret-value', KEEP: 'literal', BOTH: 'secret-value-suffix' })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('expands ${NAME} references in streamable-http header values', () => {
    vi.stubEnv('MCP_TEST_AUTH', 'token')
    try {
      const entry = { ...httpEntry, headers: { Authorization: 'Bearer ${MCP_TEST_AUTH}' } }
      const rows = composeRows(settings({ web: entry }), () => {})
      expect(rows[0]!.config.headers).toEqual({ Authorization: 'Bearer token' })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('skips only the server referencing an unset variable and names both key and variable', () => {
    const messages: string[] = []
    const bad = { ...stdioEntry, env: { TOKEN: '${MCP_TEST_UNSET_VARIABLE}' } }
    const rows = composeRows(settings({ bad, gh: stdioEntry }), message => messages.push(message))
    expect(rows.map(row => row.id)).toEqual(['mcp-servers:gh'])
    expect(messages).toEqual([
      'mcp-servers: env.TOKEN references unset environment variable MCP_TEST_UNSET_VARIABLE — server "bad" skipped',
    ])
  })

  it('skips only the http server referencing an unset header variable', () => {
    const messages: string[] = []
    const bad = { ...httpEntry, headers: { Authorization: 'Bearer ${MCP_TEST_UNSET_VARIABLE}' } }
    const rows = composeRows(settings({ bad, web: httpEntry }), message => messages.push(message))
    expect(rows.map(row => row.id)).toEqual(['mcp-servers:web'])
    expect(messages).toEqual([
      'mcp-servers: headers.Authorization references unset environment variable MCP_TEST_UNSET_VARIABLE — server "bad" skipped',
    ])
  })
})
