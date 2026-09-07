/**
 * Live-preview story for the MCP servers card: mounts the real component
 * over an in-memory settings scope and a scripted remote, the same fakes the
 * card's own spec uses. Consumed by the component library gallery through
 * `window.__DSH_STORIES__`.
 */
import { createRoot } from 'react-dom/client'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the session standard-kit merge (useSessionPendingInteraction).
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { McpCardController, type McpSettingsView } from '../../src/client/mcp-card-controller.ts'
import { McpCard } from '../../src/client/McpCard.tsx'
import { en } from '../../src/client/locales.ts'

/** Minimal scope double: one mutable snapshot plus listener fan-out. */
function fakeScope(initial: Partial<SettingsScopeSnapshot<McpSettingsView>>): SettingsScope<McpSettingsView> {
  const snapshot: SettingsScopeSnapshot<McpSettingsView> = {
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
    set: async () => {},
    unset: async () => {},
    mutate: async () => {},
  }
}

function fakeApi(): Pick<import('@deepseek-ai/dsh-api-remotes/client').ClientRemote, 'settings'> {
  const settings = {
    describe: async (): Promise<never> => { throw new Error('not used in this story') },
    update: async (): Promise<never> => { throw new Error('not used in this story') },
    replace: async (): Promise<never> => { throw new Error('not used in this story') },
    canOpenAgentPresetDirectory: async (): Promise<RemoteResult<boolean>> => ({ ok: true, value: false }),
    openAgentPresetDirectory: async (): Promise<never> => { throw new Error('not used in this story') },
    openSettingsDocument: async (): Promise<never> => { throw new Error('not used in this story') },
    mutate: async (): Promise<RemoteResult<import('@deepseek-ai/dsh-api-remotes/client').SettingsNamespaceView>> => ({
      ok: true,
      value: {
        value: { servers: {}, disabled: [] },
        base: {},
        user: {},
        revision: 4,
        writable: true,
        mode: 'host',
        status: 'ready',
      } as unknown as import('@deepseek-ai/dsh-api-remotes/client').SettingsNamespaceView,
    }),
  }
  return { settings }
}

const unusedHook = (() => { throw new Error('unused by the MCP card') }) as never

export const story = {
  record: 'ui-settings-mcp/McpCard',
  /**
   * Mount the card over two demo servers (one parked) with live mutations:
   * enable/remove/save act on the in-memory scope, so the preview is
   * interactive without a Host.
   */
  mount(container: HTMLElement): void {
    const scope = fakeScope({
      value: {
        servers: {
          github: { transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
          web: { transport: 'streamable-http', url: 'http://127.0.0.1:39273/mcp' },
        },
        disabled: ['web'],
      },
    })
    const controller = new McpCardController(scope, fakeApi(), { conflict: 'conflict-copy', unavailable: 'rejected-copy' })
    const root = createRoot(container)
    root.render(
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
    container.dataset.dshStoryRoot = 'true'
  },
}
