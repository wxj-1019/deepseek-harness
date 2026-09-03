/**
 * Bilingual dictionaries for the MCP servers settings card.
 * @module @deepseek-ai/dsh-client-ui-settings-mcp/src/client/locales
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.mcpServers'

const en = {
  'mcpCard.title': 'MCP servers',
  'mcpCard.description': 'Model Context Protocol servers composed from this settings document; edits apply without a restart.',
  'mcpCard.empty': 'No MCP servers configured. Add one to expose its tools to the model.',
  'mcpCard.add': 'Add server',
  'mcpCard.name': 'Server name',
  'mcpCard.nameInvalid': 'Letters, digits, dashes, and underscores only; up to 32 characters.',
  'mcpCard.nameTaken': 'A server already uses this name.',
  'mcpCard.transport': 'Transport',
  'mcpCard.transportStdio': 'stdio',
  'mcpCard.transportHttp': 'streamable-http',
  'mcpCard.command': 'Command',
  'mcpCard.args': 'Arguments (one per line)',
  'mcpCard.env': 'Environment (KEY=VALUE per line; VALUE may use ${NAME})',
  'mcpCard.cwd': 'Working directory',
  'mcpCard.url': 'Server URL',
  'mcpCard.headers': 'Headers (KEY=VALUE per line; VALUE may use ${NAME})',
  'mcpCard.toolCallTimeoutMs': 'Tool call timeout (ms)',
  'mcpCard.startupTimeoutMs': 'Startup timeout (ms)',
  'mcpCard.failOnStartupError': 'Fail activation when startup fails',
  'mcpCard.advanced': 'Advanced',
  'mcpCard.edit': 'Edit',
  'mcpCard.remove': 'Remove',
  'mcpCard.confirmRemove': 'Remove this server and its tools?',
  'mcpCard.enable': 'Enable',
  'mcpCard.disable': 'Disable',
  'mcpCard.save': 'Save',
  'mcpCard.cancel': 'Cancel',
  'mcpCard.required': 'This field is required.',
  'mcpCard.conflict': 'The settings changed elsewhere; reopen and retry.',
  'mcpCard.unavailable': 'The write was rejected; retry.',
  'mcpCard.busy': 'Saving…',
} as const

const zh: Record<keyof typeof en, string> = {
  'mcpCard.title': 'MCP 服务器',
  'mcpCard.description': '由本设置文档组装的模型上下文协议服务器；编辑无需重启即生效。',
  'mcpCard.empty': '尚未配置 MCP 服务器。添加一个即可向模型暴露其工具。',
  'mcpCard.add': '添加服务器',
  'mcpCard.name': '服务器名称',
  'mcpCard.nameInvalid': '仅限字母、数字、短横线和下划线，最长 32 个字符。',
  'mcpCard.nameTaken': '已有服务器使用了这个名称。',
  'mcpCard.transport': '传输方式',
  'mcpCard.transportStdio': 'stdio',
  'mcpCard.transportHttp': 'streamable-http',
  'mcpCard.command': '命令',
  'mcpCard.args': '参数（每行一个）',
  'mcpCard.env': '环境变量（每行 KEY=VALUE；VALUE 可用 ${NAME}）',
  'mcpCard.cwd': '工作目录',
  'mcpCard.url': '服务器 URL',
  'mcpCard.headers': '请求头（每行 KEY=VALUE；VALUE 可用 ${NAME}）',
  'mcpCard.toolCallTimeoutMs': '工具调用超时（毫秒）',
  'mcpCard.startupTimeoutMs': '启动超时（毫秒）',
  'mcpCard.failOnStartupError': '启动失败时终止激活',
  'mcpCard.advanced': '高级',
  'mcpCard.edit': '编辑',
  'mcpCard.remove': '删除',
  'mcpCard.confirmRemove': '删除该服务器及其工具？',
  'mcpCard.enable': '启用',
  'mcpCard.disable': '停用',
  'mcpCard.save': '保存',
  'mcpCard.cancel': '取消',
  'mcpCard.required': '该字段必填。',
  'mcpCard.conflict': '设置已在别处变更；请重新打开后重试。',
  'mcpCard.unavailable': '写入被拒绝；请重试。',
  'mcpCard.busy': '保存中…',
}

/** The dictionary's key union — the namespace's complete key set. */
export type McpLocaleKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The MCP servers settings card's copy. */
    'settings.mcpServers': McpLocaleKey
  }
}

export { en, zh }
