/**
 * Host registration for the MCP servers settings card. The card edits the
 * `mcp` settings namespace, which `@deepseek-ai/dsh-mcp-servers` already
 * registers and watches — this package contributes only the browser card, so
 * the Host half has nothing to register.
 * @module @deepseek-ai/dsh-client-ui-settings-mcp
 */

/**
 * No Host-side work: the namespace and its live composition are owned by
 * `dsh-mcp-servers`.
 * @param _ctx - Host context (unused).
 */
export function apply(_ctx: unknown): void {}
