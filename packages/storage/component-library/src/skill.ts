/**
 * Skills channel of the component library: one `component-library` skill
 * whose body is generated from the durable domain on demand — a short
 * introduction, the token-tier conventions, and the current component list.
 * Models that prefer long-form guidance load it through the skill tool
 * instead of calling `component_query` repeatedly.
 * @module @deepseek-ai/dsh-component-library/src/skill
 */

import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'
import type { ComponentLibraryService } from './service.ts'

const PROVIDER_NAME = 'component-library'
const INVOCATION = { modelInvocable: true, userInvocable: true } as const
const DESCRIPTION =
  'Reuse this checkout’s learned UI components and `--dsw-*` design tokens when writing UI code. '
  + 'Use before creating new components or styles in packages/client.'
const LOCATOR = { kind: 'generated' } as const

/** Render the token-tier conventions section from the live inventory. */
function renderTokenSection(service: ComponentLibraryService): string {
  const tokens = service.designTokens
  const counts = { static: 0, alias: 0, specific: 0 }
  for (const token of tokens) counts[token.tier] += 1
  if (tokens.length === 0) return '## Design tokens\n\nThe theme token inventory is unavailable.\n'
  const samples = (tier: keyof typeof counts): string =>
    tokens.filter(token => token.tier === tier).slice(0, 5).map(token => `\`${token.name}\``).join(', ')
  return `## Design tokens

Style with \`--dsw-*\` custom properties only; never hardcode colors or spacing raw values.

- \`--dsw-static-*\` (${counts.static}) — the base palette, e.g. ${samples('static')}.
- \`--dsw-alias-*\` (${counts.alias}) — semantic aliases over the palette, e.g. ${samples('alias')}. Prefer these.
- \`--dsw-specific-*\` (${counts.specific}) — one-off surface values, e.g. ${samples('specific')}.
`
}

/** Render the component list section from the durable records. */
function renderComponentSection(service: ComponentLibraryService): string {
  const records = service.snapshotAll()
  if (records.length === 0) return '## Components\n\nThe library holds no components yet.\n'
  const byPackage = new Map<string, string[]>()
  for (const record of records) {
    const line = record.jsdoc === '' ? `\`${record.name}\`` : `\`${record.name}\` — ${record.jsdoc}`
    byPackage.set(record.pkg, [...(byPackage.get(record.pkg) ?? []), line])
  }
  const sections = [...byPackage.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([pkg, lines]) => `### ${pkg}\n\n${lines.map(line => `- ${line}`).join('\n')}`)
  return `## Components (${records.length})\n\n${sections.join('\n\n')}\n`
}

/** Generate the skill body from the current domain state. */
function renderSkillBody(service: ComponentLibraryService): string {
  return `This checkout’s UI component library is learned from its own \`packages/client\` tree and kept
current as files change. Reuse these components and tokens instead of inventing new primitives.

${renderTokenSection(service)}
${renderComponentSection(service)}
Call \`component_query\` with a name, package, or purpose keyword for full props, tokens, and usage
examples before writing UI code. After creating a genuinely new reusable component, call
\`component_record\` so later work can find it.
`
}

/**
 * Create the `component-library` skill provider bound to one service
 * instance.
 * @param service - the owning library service.
 * @returns the provider to hand to `ctx.skills.registerProvider`.
 */
export function createComponentLibrarySkillProvider(service: ComponentLibraryService): SkillProvider {
  const candidate: SkillCandidate = {
    name: PROVIDER_NAME,
    description: DESCRIPTION,
    invocation: INVOCATION,
    provider: PROVIDER_NAME,
    source: 'bundled',
    rank: BUNDLED_SKILL_RANK,
    locator: LOCATOR,
  }
  return {
    name: PROVIDER_NAME,
    list: () => Promise.resolve([candidate]),
    get: () => Promise.resolve<SkillDefinition>({
      name: candidate.name,
      description: candidate.description,
      invocation: candidate.invocation,
      provider: candidate.provider,
      source: candidate.source,
      content: renderSkillBody(service),
    }),
  }
}
