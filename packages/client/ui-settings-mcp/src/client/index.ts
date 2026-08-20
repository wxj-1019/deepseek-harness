/**
 * Client half: the MCP servers card in the Plugins settings section's
 * configurable tab, keyed by the `mcp` settings namespace the tab pairs with
 * served card keys.
 * @module @deepseek-ai/dsh-client-ui-settings-mcp/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { MCP_SETTINGS_NS, McpCardController } from './mcp-card-controller.ts'
import type { McpServerEntryView } from './mcp-card-controller.ts'
import { McpCard } from './McpCard.tsx'
import { NS, en, zh } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const LOCALE_NS = NS

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'settingsScope']

export { MCP_SETTINGS_NS, McpCardController } from './mcp-card-controller.ts'
export { McpCard } from './McpCard.tsx'
export type { McpCardFace, McpCardComponentProps } from './McpCard.tsx'
export type { McpCardState, McpServerEntryView, McpServerRow, McpSettingsView } from './mcp-card-controller.ts'

/**
 * Mount the MCP servers card onto the Plugins configurable tab.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(LOCALE_NS)
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'ui-settings-mcp: card dictionaries')

  const { api } = ctx.get('connection') as ConnectionHandle
  const controller = new McpCardController(
    ctx.settingsScope.bind({ namespace: MCP_SETTINGS_NS }),
    api,
    { conflict: t('mcpCard.conflict'), unavailable: t('mcpCard.unavailable') },
  )

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: MCP_SETTINGS_NS,
    locale: LOCALE_NS,
    inject: () => ({
      hooks: { mcpCard: controller.store },
      setEnabled: (name: string, enabled: boolean) => { void controller.setEnabled(name, enabled) },
      remove: (name: string) => { void controller.remove(name) },
      save: (name: string, entry: McpServerEntryView) => { void controller.save(name, entry) },
    }),
  }, McpCard))
}
