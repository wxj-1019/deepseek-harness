/**
 * Loader-level integration for the mcp-servers manager: a settings document
 * drives real mcp-client rows through the Cordis Loader — the keyless package
 * fixture proves tool discovery end to end, and a committed settings change
 * proves add/remove propagation without a restart.
 */
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { boot } from '@deepseek-ai/dsh-app-boot'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as McpClient from '@deepseek-ai/dsh-mcp-client/src/index.ts'
import McpServers from '@deepseek-ai/dsh-mcp-servers/src/index.ts'

const root = resolve(import.meta.dirname, '../../../..')
const fixtureServer = resolve(root, 'packages/mcp/mcp-client/tests/fixture-server.ts')
const baseConfig = resolve(import.meta.dirname, 'fixtures/base.cordis.yml')

/** Read-only in-memory settings provider; committed changes arrive via {@link push}. */
class TestSettings extends SettingsProvider {
  doc: Record<string, unknown>

  constructor(ctx: ConstructorParameters<typeof SettingsProvider>[0], config: { doc?: Record<string, unknown> }) {
    super(ctx)
    this.doc = structuredClone(config?.doc ?? {})
  }

  get writable(): boolean {
    return false
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(): Promise<void> {
    return Promise.resolve()
  }

  /** Simulate an external storage change reaching the provider. */
  push(doc: Record<string, unknown>): void {
    this.doc = structuredClone(doc)
    this.publish(structuredClone(doc))
  }
}

/** A stdio settings entry pointing at the keyless package-owned fixture server. */
function fixtureServerEntry(): Record<string, unknown> {
  return {
    transport: 'stdio',
    command: process.execPath,
    args: [fixtureServer],
    env: {},
    cwd: root,
    toolCallTimeoutMs: 5_000,
  }
}

function docWith(names: string[], disabled: string[] = []): Record<string, unknown> {
  const servers = Object.fromEntries(names.map(name => [name, fixtureServerEntry()]))
  return { mcp: { servers, ...disabled.length > 0 ? { disabled } : {} } }
}

const liveContexts = new Set<Context>()

afterEach(async () => {
  await Promise.all([...liveContexts].map(async ctx => ctx.fiber.dispose()))
  liveContexts.clear()
  delete process.env.MCP_SERVERS_TEST_DOC
})

async function bootWithDoc(doc: Record<string, unknown>): Promise<Context> {
  process.env.MCP_SERVERS_TEST_DOC = JSON.stringify(doc)
  return await boot(
    'mcp-servers-integration-test',
    baseConfig,
    undefined,
    (ctx) => {
      liveContexts.add(ctx)
      ctx.loader.builtins['mcp-servers-test-settings'] = TestSettings
      ctx.loader.builtins['mcp-servers-test-manager'] = McpServers
      ctx.loader.builtins['mcp-servers-test-system-prompt'] = SystemPrompt
      ctx.loader.builtins['mcp-servers-test-tools'] = ToolRuntime
      ctx.loader.builtins['@deepseek-ai/dsh-mcp-client'] = McpClient
    },
  )
}

async function waitForTool(ctx: Context, name: string, present: boolean): Promise<void> {
  const deadline = Date.now() + 10_000
  while (ctx.tools.schemas().some(schema => schema.name === name) !== present) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${name} to be ${present ? 'registered' : 'unregistered'}`)
    await new Promise(resolveWait => setTimeout(resolveWait, 25))
  }
}

describe('mcp-servers loader integration', () => {
  it('mounts one mcp-client row per settings server and discovers its tools', async () => {
    const ctx = await bootWithDoc(docWith(['fixture']))
    await waitForTool(ctx, 'mcp__fixture__greet', true)
    expect(ctx.tools.get('mcp__fixture__add')).toBeDefined()
  }, 20_000)

  it('adds and removes rows on committed settings changes without a restart', async () => {
    const ctx = await bootWithDoc(docWith(['fixture']))
    await waitForTool(ctx, 'mcp__fixture__greet', true)

    const settings = ctx.settings as TestSettings
    settings.push(docWith(['fixture', 'second']))
    await waitForTool(ctx, 'mcp__second__greet', true)
    expect(ctx.tools.get('mcp__fixture__greet')).toBeDefined()

    settings.push(docWith(['fixture', 'second'], ['second']))
    await waitForTool(ctx, 'mcp__second__greet', false)
    expect(ctx.tools.get('mcp__fixture__greet')).toBeDefined()
  }, 20_000)
})
