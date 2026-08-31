/**
 * Model-facing `lsp` tool over `ctx.lsp`. One read-only tool with four operations
 * (`goToDefinition`/`findReferences`/`goToImplementation`/`hover`); it converts one-based UTF-16
 * cursor coordinates to the seam's zero-based positions, requires the session workspace with no
 * fallback, caps and renders results, and attaches a configurable timeout budget for
 * `dsh-tool-call-timeout-policy` to enforce. It runtime-injects only `tools`, `lsp`, and `systemPrompt` and
 * imports no provider.
 *
 * Namespace plugin (named exports, no default export).
 * @module @deepseek-ai/dsh-tool-lsp
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { LspError } from '@deepseek-ai/dsh-lsp'
import type {} from '@deepseek-ai/dsh-lsp'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import {
  DEFAULT_MAX_LOCATIONS,
  DEFAULT_MAX_RESULT_CHARS,
  formatDiagnostics,
  formatCalls,
  formatHover,
  formatLocations,
  formatSymbols,
  formatWorkspaceEdit,
  LSP_OPERATIONS,
  parseLspArgs,
  presentLspCall,
} from './render.ts'
import { sessionCwd } from './session-cwd.ts'
import { applyRenamePlan } from './apply-rename.ts'
// Type-only: pulls the ctx.fs declaration merge (the filesystem service) into this program.
import type {} from '@deepseek-ai/dsh-fs'

export {
  DEFAULT_MAX_LOCATIONS,
  DEFAULT_MAX_RESULT_CHARS,
  formatHover,
  formatLocations,
  LSP_OPERATIONS,
  parseLspArgs,
  presentLspCall,
  renderUri,
} from './render.ts'
export { sessionCwd } from './session-cwd.ts'

/** Cordis plugin name for loader diagnostics. */
export const name = 'tool-lsp'

/** Services required by this plugin. */
export const inject = ['tools', 'lsp', 'systemPrompt', 'fs']

/** Default tool-call timeout budget (ms), covering the queued open/query/close lifecycle. */
export const DEFAULT_LSP_TOOL_TIMEOUT_MS = 60_000

/** The stable system-prompt guidance positioning LSP as a precision aid. */
export const LSP_PROMPT_TEXT =
  'Use search/read for ordinary navigation. Use lsp when textual matches are ambiguous or before a change requires precise definitions, implementations, or references. Positions are one-based line and character (UTF-16) at the cursor; an off-symbol position may return no results. findReferences always includes the declaration.'

/** Plugin configuration: result caps and the timeout budget. */
export interface Config {
  /** Largest number of rendered locations before an omission marker (default 100). */
  maxLocations?: number
  /** Largest complete rendered result in characters, including truncation metadata (default 16000). */
  maxResultChars?: number
  /** Tool-call timeout budget in ms (default 60000). */
  timeoutMs?: number
  /** Spaces per indentation level for `formatting` (default 2). */
  formattingTabSize?: number
  /** Whether `formatting` indents with spaces rather than tabs (default true). */
  formattingInsertSpaces?: boolean
}

export const Config: z<Config> = z.object({
  maxLocations: z.number().default(DEFAULT_MAX_LOCATIONS),
  maxResultChars: z.number().default(DEFAULT_MAX_RESULT_CHARS),
  timeoutMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_LSP_TOOL_TIMEOUT_MS),
  formattingTabSize: z.number().default(2),
  formattingInsertSpaces: z.boolean().default(true),
})

type ResolvedConfig = Required<Config>

const LSP_POSITION_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    line: { type: 'integer', required: true },
    character: { type: 'integer', required: true },
  },
} as const

const LSP_RANGE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    start: { ...LSP_POSITION_OUTPUT_SCHEMA, required: true },
    end: { ...LSP_POSITION_OUTPUT_SCHEMA, required: true },
  },
} as const

/**
 * Register the `lsp` tool and its system-prompt guidance.
 * @param ctx - the plugin context (must inject `tools`, `lsp`, `systemPrompt`).
 * @param config - the resolved plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  assertPositiveInteger('maxLocations', resolved.maxLocations)
  assertPositiveInteger('maxResultChars', resolved.maxResultChars)
  assertPositiveInteger('formattingTabSize', resolved.formattingTabSize)
  assertTimer('timeoutMs', resolved.timeoutMs)

  ctx.systemPrompt.section({
    name: 'tool:lsp',
    order: ctx.systemPrompt.getSectionOrder('TOOL_LSP'),
    text: LSP_PROMPT_TEXT,
  })

  ctx.tools.register(defineTool({
    name: 'lsp',
    description:
      'Query a language server for precise code navigation. operation is one of goToDefinition, findReferences, goToImplementation, hover, formatting. line and character are one-based UTF-16 cursor coordinates. findReferences includes the declaration. formatting returns the formatted edit plan for the whole file.',
    parameters: {
      operation: {
        type: 'string',
        required: true,
        enum: [...LSP_OPERATIONS],
        description: 'goToDefinition, findReferences, goToImplementation, hover (cursor operations — line/character required); '
          + 'documentSymbol, diagnostics (file outline / pulled diagnostics — file_path required); '
          + 'workspaceSymbol (query required); rename (file_path, line, character, new_name); formatting (file_path only); incomingCalls/outgoingCalls (file_path, line, character — the host prepares the symbol at the cursor and returns its callers or callees).',
      },
      file_path: { type: 'string', description: 'The source file to query, relative to the workspace or absolute.' },
      line: { type: 'number', description: 'One-based line of the cursor (cursor operations and rename).' },
      character: { type: 'number', description: 'One-based UTF-16 column of the cursor (cursor operations and rename).' },
      query: { type: 'string', description: 'Symbol name fragment for workspaceSymbol.' },
      new_name: { type: 'string', description: 'The new identifier for rename.' },
      apply: { type: 'boolean', description: 'rename only: the host applies the plan itself with version guards and reports applied files; default false returns the plan for you to apply.' },
    },
    output: {
      schema: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'locations' },
              locations: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    uri: { type: 'string', required: true },
                    range: { ...LSP_RANGE_OUTPUT_SCHEMA, required: true },
                  },
                },
              },
              resolvedWorkspaceUri: { type: 'string', required: true },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'hover' },
              hover: {
                required: true,
                oneOf: [
                  { type: 'null' },
                  {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      contents: { type: 'string', required: true },
                      range: LSP_RANGE_OUTPUT_SCHEMA,
                    },
                  },
                ],
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'symbols' },
              symbols: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string', required: true },
                    kind: { type: 'number', required: true },
                    container: { type: 'string' },
                    uri: { type: 'string', required: true },
                    range: { ...LSP_RANGE_OUTPUT_SCHEMA, required: true },
                  },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'diagnostics' },
              diagnostics: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    range: { ...LSP_RANGE_OUTPUT_SCHEMA, required: true },
                    message: { type: 'string', required: true },
                    severity: { type: 'number' },
                    source: { type: 'string' },
                  },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'calls' },
              calls: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string', required: true },
                    kind: { type: 'number', required: true },
                    uri: { type: 'string', required: true },
                    range: { ...LSP_RANGE_OUTPUT_SCHEMA, required: true },
                    container: { type: 'string' },
                    callSites: {
                      type: 'array',
                      required: true,
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          start: { ...LSP_POSITION_OUTPUT_SCHEMA, required: true },
                          end: { ...LSP_POSITION_OUTPUT_SCHEMA, required: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'rename-applied' },
              applied: { type: 'number', required: true },
              files: { type: 'array', required: true, items: { type: 'string' } },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'workspaceEdit' },
              edits: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    uri: { type: 'string', required: true },
                    edits: {
                      type: 'array',
                      required: true,
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          range: { ...LSP_RANGE_OUTPUT_SCHEMA, required: true },
                          newText: { type: 'string', required: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      render: (_args, value) => {
        switch (value.kind) {
          case 'locations':
            return [{ type: 'text', text: formatLocations(value.locations, value.resolvedWorkspaceUri, resolved.maxLocations, resolved.maxResultChars) }]
          case 'hover':
            return [{ type: 'text', text: formatHover(value.hover, resolved.maxResultChars) }]
          case 'symbols':
            return [{ type: 'text', text: formatSymbols(value.symbols, '', resolved.maxLocations, resolved.maxResultChars) }]
          case 'diagnostics':
            return [{ type: 'text', text: formatDiagnostics(value.diagnostics, '', resolved.maxLocations, resolved.maxResultChars) }]
          case 'calls':
            return [{ type: 'text', text: formatCalls(value.calls, resolved.maxLocations, resolved.maxResultChars) }]
          case 'rename-applied':
            return [{ type: 'text', text: `Applied rename across ${value.files.length} file(s): ${value.files.join(', ')}` }]
          case 'workspaceEdit':
            return [{ type: 'text', text: formatWorkspaceEdit(value.edits, '', resolved.maxResultChars) }]
          /* v8 ignore next -- exhaustive over the output schema's closed union; unreachable. */
          default:
            return assertNever(value, 'tool-lsp output')
        }
      },
    },
    timeoutMs: resolved.timeoutMs,
    async execute(args, exec) {
      const input = parseLspArgs(args)
      const workspaceRoot = sessionCwd(exec)
      if (workspaceRoot === undefined) {
        throw new LspError('the lsp tool requires a session workspace cwd', 'LSP_WORKSPACE_REQUIRED')
      }
      const result = await ctx.lsp.query({
        operation: input.operation,
        ...('filePath' in input ? { filePath: input.filePath } : {}),
        ...('position' in input ? { position: input.position } : {}),
        ...('query' in input ? { query: input.query } : {}),
        ...('newName' in input ? { newName: input.newName } : {}),
        ...(input.operation === 'formatting'
          ? { formatting: { tabSize: resolved.formattingTabSize, insertSpaces: resolved.formattingInsertSpaces } }
          : {}),
        workspaceRoot,
      }, exec.signal)
      switch (result.kind) {
        case 'locations':
          return {
            kind: 'locations' as const,
            locations: result.locations.map(location => ({
              uri: location.uri,
              range: {
                start: { line: location.range.start.line, character: location.range.start.character },
                end: { line: location.range.end.line, character: location.range.end.character },
              },
            })),
            resolvedWorkspaceUri: result.resolvedWorkspaceUri,
          }
        case 'hover':
          return {
            kind: 'hover' as const,
            hover: result.hover === null
              ? null
              : {
                contents: result.hover.contents,
                ...result.hover.range === undefined
                  ? {}
                  : {
                    range: {
                      start: { line: result.hover.range.start.line, character: result.hover.range.start.character },
                      end: { line: result.hover.range.end.line, character: result.hover.range.end.character },
                    },
                  },
              },
          }
        case 'symbols':
          return {
            kind: 'symbols' as const,
            symbols: result.symbols.map(symbol => ({
              name: symbol.name,
              kind: symbol.kind,
              ...(symbol.container !== undefined ? { container: symbol.container } : {}),
              uri: symbol.uri,
              range: {
                start: { line: symbol.range.start.line, character: symbol.range.start.character },
                end: { line: symbol.range.end.line, character: symbol.range.end.character },
              },
            })),
          }
        case 'diagnostics':
          return {
            kind: 'diagnostics' as const,
            diagnostics: result.diagnostics.map(diagnostic => ({
              range: {
                start: { line: diagnostic.range.start.line, character: diagnostic.range.start.character },
                end: { line: diagnostic.range.end.line, character: diagnostic.range.end.character },
              },
              message: diagnostic.message,
              ...(diagnostic.severity !== undefined ? { severity: diagnostic.severity } : {}),
              ...(diagnostic.source !== undefined ? { source: diagnostic.source } : {}),
            })),
          }
        case 'calls':
          return {
            kind: 'calls' as const,
            calls: result.calls.map(call => ({
              name: call.name,
              kind: call.kind,
              uri: call.uri,
              range: {
                start: { line: call.range.start.line, character: call.range.start.character },
                end: { line: call.range.end.line, character: call.range.end.character },
              },
              ...(call.container !== undefined ? { container: call.container } : {}),
              callSites: call.callSites.map(span => ({
                start: { line: span.start.line, character: span.start.character },
                end: { line: span.end.line, character: span.end.character },
              })),
            })),
          }
        case 'workspaceEdit':
          if (input.operation === 'rename' && input.apply) {
            const applied = await applyRenamePlan(ctx.fs, result.edits, workspaceRoot, exec.signal)
            return {
              kind: 'rename-applied' as const,
              applied: result.edits.reduce((count, file) => count + file.edits.length, 0),
              files: [...applied.files],
            }
          }
          return {
            kind: 'workspaceEdit' as const,
            edits: result.edits.map(file => ({
              uri: file.uri,
              edits: file.edits.map(edit => ({
                range: {
                  start: { line: edit.range.start.line, character: edit.range.start.character },
                  end: { line: edit.range.end.line, character: edit.range.end.character },
                },
                newText: edit.newText,
              })),
            })),
          }
        /* v8 ignore next -- exhaustive over the closed LspQueryResult union; unreachable. */
        default:
          return assertNever(result, 'tool-lsp result')
      }
    },
    presentCall: presentLspCall,
  }))
}

/** Reject a non-positive-integer config value at load, so misconfiguration fails loud. */
function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`tool-lsp: ${name} must be a positive integer`)
  }
}

/** Reject a timer value Node would clamp instead of scheduling as configured. */
function assertTimer(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_TIMER_DELAY_MS) {
    throw new Error(`tool-lsp: ${name} must be a positive integer no greater than ${MAX_TIMER_DELAY_MS}`)
  }
}
