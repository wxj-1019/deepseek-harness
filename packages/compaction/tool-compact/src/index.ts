/**
 * The model-facing `compact` tool: request compaction of the current
 * session's history through the compaction seam (`ctx.compaction.compactNow`),
 * the same manual path the human `/compact` command uses. The tool reports the
 * compacted scope, or the structured failure (busy / changed / summary /
 * commit / persistence / cancelled) as an error result — compaction never
 * silently degrades the conversation.
 * @module @deepseek-ai/dsh-tool-compact
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { ManualCompactionError } from '@deepseek-ai/dsh-compaction'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-compact'

/** Services required by the compaction tool. `compaction` is read at execute
 *  time from the plugin context: the schema only needs registration, and the
 *  compaction service provisions in compositions after this plugin loads. */
export const inject = ['tools', 'systemPrompt']

/** The tool takes no configuration. */
export interface Config {}

/**
 * The model-facing text for one expected compaction failure.
 * @param error - the structured manual-compaction rejection.
 * @returns the failure text.
 */
export function expectedFailureText(error: ManualCompactionError): string {
  switch (error.code) {
    case 'busy': return 'Compaction is unavailable because this process has an active compaction, or the agent is not idle.'
    case 'cancelled': return 'Compaction cancelled.'
    case 'changed': return 'The history selected for compaction changed before it could be replaced. The conversation is unchanged; the attempt is recorded in the session log.'
    case 'summary': return 'Compaction could not produce a useful summary. The conversation is unchanged; the attempt is recorded in the session log.'
    case 'commit': return 'Compaction did not finish cleanly; some session history may have changed. Inspect the current session state before retrying.'
    case 'persistence': return 'Compaction finished, but the session could not be saved.'
    /* v8 ignore next 2 -- ManualCompactionErrorCode is closed and every member is handled above */
    default: return `Compaction failed: ${String((error as { code?: unknown }).code)}`
  }
}

/** Register the `compact` tool. */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'tool:compact',
    order: 106,
    text: 'The compact tool asks the harness to compact this session\'s history into a summary, freeing context '
      + 'while preserving the conversation. Use it when the context is getting long and the recent history is mostly '
      + 'superseded detail; do not use it mid-investigation. The result reports how much history was compacted, or a '
      + 'structured reason why compaction did not happen.',
  })

  const tool = defineTool({
    name: 'compact',
    description: 'Compact this session\'s history: replace superseded detail with a summary to free context. '
      + 'Reports the compacted scope (history items and tokens) or a structured reason why compaction did not happen '
      + '(busy, changed, summary failure, commit or persistence trouble). The conversation is never silently degraded.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          items: { type: 'number', required: true },
          tokens: { type: 'number', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Compacted ${value.items} history items (~${value.tokens} tokens).`,
      }],
    },
    async execute(args, exec: ToolExecution) {
      void args
      const agent = exec.agent
      if (agent === undefined) throw new Error('compact requires a calling agent session')
      try {
        const result = await ctx.compaction.compactNow(agent, exec.signal)
        if (result === null) {
          return { items: 0, tokens: 0 }
        }
        return { items: result.shadowedSeqs.length, tokens: result.shadowedTokenCount }
      } catch (error: unknown) {
        if (exec.signal.aborted) throw new Error('Compaction cancelled.')
        if (error instanceof ManualCompactionError) throw new Error(expectedFailureText(error))
        throw error
      }
    },
  })
  ctx.tools.register(tool)
}
