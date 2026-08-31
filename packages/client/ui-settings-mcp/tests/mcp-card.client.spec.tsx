// @vitest-environment jsdom
/**
 * Tests for the MCP servers card: the controller's projection and revision-
 * fenced mutations, and the card's add/edit/enable/remove interactions over
 * them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the session standard-kit merge (useSessionPendingInteraction).
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientRemote, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { McpCardController, type McpSettingsView } from '../src/client/mcp-card-controller.ts'
import { McpCard } from '../src/client/McpCard.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

/** Minimal scope double: one mutable snapshot plus listener fan-out. */
function fakeScope(initial: Partial<SettingsScopeSnapshot<McpSettingsView>>): SettingsScope<McpSettingsView> & {
  publish(next: Partial<SettingsScopeSnapshot<McpSettingsView>>): void
} {
  let snapshot: SettingsScopeSnapshot<McpSettingsView> = {
    status: 'ready',
    value: { servers: {}, disabled: [] },
    base: {},
    user: {},
    revision: 3,
    writable: true,
    mode: 'host',
    ...initial,
  }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: vi.fn(async () => {}),
    unset: vi.fn(async () => {}),
    mutate: vi.fn(async () => {}),
    publish(next) {
      snapshot = { ...snapshot, ...next }
      for (const listener of listeners) listener()
    },
  }
}

function fakeApi(): { api: Pick<ClientRemote, 'settings'>; mutate: ReturnType<typeof vi.fn> } {
  const mutate = vi.fn(async (): Promise<RemoteResult<SettingsNamespaceView>> => ({
    ok: true,
    value: {
      value: { servers: {}, disabled: [] },
      base: {},
      user: {},
      revision: 4,
      writable: true,
      mode: 'host',
      status: 'ready',
    } as unknown as SettingsNamespaceView,
  }))
  const settings = {
    describe: vi.fn(async (): Promise<never> => { throw new Error('not used in this test') }),
    update: vi.fn(async (): Promise<never> => { throw new Error('not used in this test') }),
    replace: vi.fn(async (): Promise<never> => { throw new Error('not used in this test') }),
    canOpenAgentPresetDirectory: vi.fn(async (): Promise<RemoteResult<boolean>> => ({ ok: true, value: false })),
    openAgentPresetDirectory: vi.fn(async (): Promise<never> => { throw new Error('not used in this test') }),
    openSettingsDocument: vi.fn(async (): Promise<never> => { throw new Error('not used in this test') }),
    mutate,
  }
  return { api: { settings }, mutate }
}

const MESSAGES = { conflict: 'conflict-copy', unavailable: 'rejected-copy' }

// Global standard kit stubs: the card does not consume the hooks.
const unusedHook = (() => { throw new Error('unused by the MCP card') }) as never

function mountCard(controller: McpCardController): void {
  render(
    <McpCard
      t={key => (en as Record<string, string>)[key] ?? key}
      useMcpCard={selector => selector(controller.store.getSnapshot())}
      setEnabled={(name, enabled) => { void controller.setEnabled(name, enabled) }}
      remove={(name) => { void controller.remove(name) }}
      save={(name, entry) => { void controller.save(name, entry) }}
      useSessions={unusedHook}
      useWorkspaces={unusedHook}
      useSessionPendingInteraction={unusedHook}
    />,
  )
}

describe('McpCardController', () => {
  it('projects servers sorted by name with their parked state', () => {
    const scope = fakeScope({
      value: {
        servers: {
          web: { transport: 'streamable-http', url: 'http://x' },
          github: { transport: 'stdio', command: 'npx' },
        },
        disabled: ['web'],
      },
    })
    const { api } = fakeApi()
    const controller = new McpCardController(scope, api, MESSAGES)
    expect(controller.store.getSnapshot().servers.map(row => [row.name, row.enabled]))
      .toEqual([['github', true], ['web', false]])
  })

  it('parks and unparks a server through the disabled list', async () => {
    const scope = fakeScope({ value: { servers: { gh: { transport: 'stdio', command: 'npx' } }, disabled: [] } })
    const { api, mutate } = fakeApi()
    const controller = new McpCardController(scope, api, MESSAGES)
    await controller.setEnabled('gh', false)
    expect(mutate).toHaveBeenCalledWith('mcp', [{ op: 'set', path: ['disabled'], value: ['gh'] }], 3)
    scope.publish({ value: { servers: { gh: { transport: 'stdio', command: 'npx' } }, disabled: ['gh'] } })
    await controller.setEnabled('gh', true)
    expect(mutate).toHaveBeenLastCalledWith('mcp', [{ op: 'set', path: ['disabled'], value: [] }], 3)
  })

  it('removes one entry and its parked reference together', async () => {
    const scope = fakeScope({
      value: {
        servers: { gh: { transport: 'stdio', command: 'npx' }, web: { transport: 'streamable-http', url: 'http://x' } },
        disabled: ['gh'],
      },
    })
    const { api, mutate } = fakeApi()
    const controller = new McpCardController(scope, api, MESSAGES)
    await controller.remove('gh')
    expect(mutate).toHaveBeenCalledWith('mcp', [
      { op: 'unset', path: ['servers', 'gh'] },
      { op: 'set', path: ['disabled'], value: [] },
    ], 3)
  })

  it('reports a revision conflict through the card state', async () => {
    const scope = fakeScope({ value: { servers: {}, disabled: [] } })
    const mutate = vi.fn(async () => { throw Object.assign(new Error('conflict'), { code: 'settings/conflict' }) })
    const controller = new McpCardController(scope, {
      settings: { describe: vi.fn(), update: vi.fn(async (): Promise<never> => { throw new Error('x') }), replace: vi.fn(async (): Promise<never> => { throw new Error('x') }), canOpenAgentPresetDirectory: vi.fn(async (): Promise<RemoteResult<boolean>> => ({ ok: true, value: false })), openAgentPresetDirectory: vi.fn(async (): Promise<never> => { throw new Error('not used in this test') }), openSettingsDocument: vi.fn(async (): Promise<never> => { throw new Error('not used in this test') }), mutate },
    }, MESSAGES)
    await controller.save('gh', { transport: 'stdio', command: 'npx' })
    expect(controller.store.getSnapshot().error).toBe('conflict-copy')
    expect(controller.store.getSnapshot().busy).toBe(false)
  })
})

describe('McpCard', () => {
  it('renders the sorted list with transport and parked state', () => {
    const scope = fakeScope({
      value: {
        servers: {
          web: { transport: 'streamable-http', url: 'http://x' },
          github: { transport: 'stdio', command: 'npx' },
        },
        disabled: ['web'],
      },
    })
    const { api } = fakeApi()
    mountCard(new McpCardController(scope, api, MESSAGES))
    const rows = [...screen.getByRole('list').querySelectorAll('li')]
    expect(rows.map(row => row.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('stdio'), expect.stringContaining('stdio')]),
    )
    expect(screen.getByText('streamable-http')).toBeDefined()
    expect(screen.getByText(en['mcpCard.enable'])).toBeDefined()
  })

  it('adds a stdio server through the form', async () => {
    const scope = fakeScope({ value: { servers: {}, disabled: [] } })
    const { api, mutate } = fakeApi()
    mountCard(new McpCardController(scope, api, MESSAGES))
    fireEvent.click(screen.getByText(en['mcpCard.add']))
    fireEvent.change(screen.getByLabelText(en['mcpCard.name']), { target: { value: 'github' } })
    fireEvent.change(screen.getByLabelText(en['mcpCard.command']), { target: { value: 'npx' } })
    fireEvent.change(screen.getByLabelText(en['mcpCard.args']), { target: { value: '-y\nserver-github' } })
    fireEvent.change(screen.getByLabelText(en['mcpCard.env']), { target: { value: 'GITHUB_TOKEN=${GITHUB_TOKEN}' } })
    fireEvent.click(screen.getByText(en['mcpCard.save']))
    await vi.waitFor(() => { expect(mutate).toHaveBeenCalledTimes(1) })
    expect(mutate).toHaveBeenCalledWith('mcp', [{
      op: 'set',
      path: ['servers', 'github'],
      value: { transport: 'stdio', command: 'npx', args: ['-y', 'server-github'], env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' } },
    }], 3)
  })

  it('refuses an invalid server name and a duplicate', () => {
    const scope = fakeScope({ value: { servers: { github: { transport: 'stdio', command: 'npx' } }, disabled: [] } })
    const { api } = fakeApi()
    mountCard(new McpCardController(scope, api, MESSAGES))
    fireEvent.click(screen.getByText(en['mcpCard.add']))
    const name = screen.getByLabelText(en['mcpCard.name'])
    fireEvent.change(name, { target: { value: 'has space' } })
    expect(screen.getByText(en['mcpCard.nameInvalid'])).toBeDefined()
    fireEvent.change(name, { target: { value: 'github' } })
    fireEvent.change(screen.getByLabelText(en['mcpCard.command']), { target: { value: 'npx' } })
    expect(screen.getByText(en['mcpCard.nameTaken'])).toBeDefined()
    expect(screen.getByText(en['mcpCard.save'])).toHaveProperty('disabled', true)
  })

  it('toggles parking from a row button', async () => {
    const scope = fakeScope({ value: { servers: { gh: { transport: 'stdio', command: 'npx' } }, disabled: [] } })
    const { api, mutate } = fakeApi()
    mountCard(new McpCardController(scope, api, MESSAGES))
    fireEvent.click(screen.getByText(en['mcpCard.disable']))
    await vi.waitFor(() => { expect(mutate).toHaveBeenCalledTimes(1) })
    expect(mutate).toHaveBeenCalledWith('mcp', [{ op: 'set', path: ['disabled'], value: ['gh'] }], 3)
  })
})
