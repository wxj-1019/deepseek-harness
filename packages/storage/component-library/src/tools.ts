/**
 * Model-facing tools of the component library: `component_query` retrieves
 * learned components before UI generation, `component_record` writes a
 * model-contributed record after the model creates one.
 * @module @deepseek-ai/dsh-component-library/src/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ComponentLibraryService } from './service.ts'
import type { ComponentMatch } from './types.ts'

/** Render one match list as the model-facing tool result text. */
function formatMatches(matches: readonly ComponentMatch[]): string {
  if (matches.length === 0) {
    return 'No library components match. Write the component from scratch, then call component_record.'
  }
  const lines = matches.map((match) => {
    const props = match.props.map(prop => `${prop.name}${prop.required ? '' : '?'}: ${prop.type}`).join(', ')
    const tokens = match.tokens.length === 0 ? '' : `\n  tokens: ${match.tokens.join(', ')}`
    const example = match.example === '' ? '' : `\n  example: ${match.example}`
    return `- ${match.name} (${match.pkg}) [${match.origin}]\n  path: ${match.path}\n  props: ${props === '' ? '(none)' : props}${tokens}${example}`
  })
  return `${matches.length} match(es):\n${lines.join('\n')}`
}

/** Wire item shape of one query match. */
const MATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', required: true },
    pkg: { type: 'string', required: true },
    path: { type: 'string', required: true },
    props: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          type: { type: 'string', required: true },
          required: { type: 'boolean', required: true },
        },
      },
    },
    tokens: { type: 'array', required: true, items: { type: 'string' } },
    example: { type: 'string', required: true },
    origin: { type: 'string', required: true, enum: ['scanned', 'model'] },
  },
} as const

/**
 * Register `component_query` and `component_record` on `ctx.tools`.
 * @param ctx - registrant context carrying the tool registry.
 * @param service - the owning library service the tools read and write through.
 */
export function registerComponentTools(ctx: Context, service: ComponentLibraryService): void {
  ctx.tools.register(defineTool({
    name: 'component_query',
    description:
      'Search this checkout’s learned UI component library before writing UI code. '
      + 'Returns matching components with their props, `--dsw-*` design tokens, source path, and a usage '
      + 'example, ranked exact-name first. Prefer reusing a scanned match over inventing a new primitive.',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'Free text: a component name, package name, purpose keyword, or `--dsw-*` token.',
      },
      pkg: { type: 'string', description: 'Restrict matches to one npm package name.' },
      limit: { type: 'integer', description: 'Maximum matches to return (default 10).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          matches: { type: 'array', required: true, items: MATCH_SCHEMA },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatMatches(value.matches) }],
      presentationMeta: (_args, value) => ({
        matchCount: value.matches.length,
        names: value.matches.map(match => `${match.pkg}/${match.name}`),
      }),
    },
    isConcurrencySafe: () => true,
    execute(args) {
      return Promise.resolve({ matches: service.rankMatches(args) })
    },
    presentCall: args => ({ card: 'generic', title: 'Query component library', kind: 'other', rawInput: args.query }),
    presentResult: (_args, result) => {
      if (result.isError) return undefined
      const meta = result.meta
      if (typeof meta !== 'object' || meta === null || !('matchCount' in meta)) return undefined
      return { card: 'generic', title: `Component library: ${String(meta.matchCount)} match(es)`, kind: 'other' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'component_record',
    description:
      'Record a UI component you just created into this checkout’s component library so later work can '
      + 'reuse it. The record is quarantined for human review before it ranks in component_query results. '
      + 'Only call this for genuinely reusable components, never for one-off markup.',
    parameters: {
      name: { type: 'string', required: true, description: 'The exported PascalCase component name.' },
      pkg: { type: 'string', required: true, description: 'The npm package name owning the component.' },
      path: {
        type: 'string',
        required: true,
        description: 'Repository-relative source path, e.g. packages/client/ui-foo/src/client/Bar.tsx.',
      },
      props: {
        type: 'array',
        description: 'The component’s props.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', required: true },
            type: { type: 'string', required: true },
            required: { type: 'boolean' },
          },
        },
      },
      tokens: {
        type: 'array',
        description: 'The `--dsw-*` design tokens the component’s styles reference.',
        items: { type: 'string' },
      },
      jsdoc: { type: 'string', description: 'One-line purpose summary.' },
      example: { type: 'string', description: 'A short usage snippet.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          done: { type: 'boolean', const: true, required: true },
          id: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Recorded ${value.id} (quarantined for human review).`,
      }],
      presentationMeta: (_args, value) => ({ id: value.id }),
    },
    async execute(args) {
      const result = await service.contribute({
        name: args.name,
        pkg: args.pkg,
        path: args.path,
        ...(args.props === undefined
          ? {}
          : { props: args.props.map(prop => ({ name: prop.name, type: prop.type, required: prop.required ?? false })) }),
        ...(args.tokens === undefined ? {} : { tokens: args.tokens }),
        ...(args.jsdoc === undefined ? {} : { jsdoc: args.jsdoc }),
        ...(args.example === undefined ? {} : { example: args.example }),
      })
      if (!result.ok) throw new Error(`component_record: ${result.error.detail}`)
      return result.value
    },
    presentCall: args => ({ card: 'generic', title: 'Record component', kind: 'other', rawInput: args.name }),
  }))
}
