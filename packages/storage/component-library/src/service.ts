/**
 * Component library service: owns the `component_library` storage domain, the
 * learning pipeline (cold scan + watcher), the model-facing tools, the
 * always-on prompt section, the skills channel, and the Remote face the
 * settings panel reads.
 * @module @deepseek-ai/dsh-component-library/src/service
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { CLIENT_TREE, extractFile, recordPath, scanComponentLibrary, scanDesignTokens } from './scanner.ts'
import { componentLibraryDomainSpec, componentRecordSchema } from './spec.ts'
import { ComponentLibraryWatcher } from './watcher.ts'
import { registerComponentTools } from './tools.ts'
import { createComponentLibrarySkillProvider } from './skill.ts'
import type {
  ComponentLibraryListResult,
  ComponentLibraryQueryRequest,
  ComponentLibraryQueryResult,
  ComponentLibraryRecordRequest,
  ComponentLibraryRecordResult,
  ComponentLibraryReviewRequest,
  ComponentLibraryReviewResult,
  ComponentLibrarySummaryResult,
  ComponentMatch,
  ComponentRecord,
  StyleToken,
} from './types.ts'

export type * from './types.ts'
export { componentLibraryDomainSpec, componentRecordSchema } from './spec.ts'

/** Settings namespace the panel card keys on. */
export const COMPONENT_LIBRARY_SETTINGS_NAMESPACE = 'component-library'

/** User-facing component-library preferences. */
export interface ComponentLibrarySettings {
  /** Include unreviewed model-contributed records in query results (ranked last). */
  readonly includeUnreviewed: boolean
}

/** Settings schema for the component-library namespace. */
export const ComponentLibrarySettingsSchema: z<ComponentLibrarySettings> = z.object({
  includeUnreviewed: z.boolean().default(false),
})

/** The plugin's composition config. */
export interface Config {
  /**
   * Checkout root whose `packages/client` tree is learned. Absent resolves by
   * walking up from this package's own location, which lands on the harness
   * checkout in every source or installed layout the plugin ships in.
   */
  readonly root?: string
  /** Keep learning from file changes after the cold-start scan (default true). */
  readonly watch?: boolean
}

/** Schemastery configuration for the component-library plugin. */
export const Config: z<Config> = z.object({
  root: z.string(),
  watch: z.boolean(),
})

/** The resolved deployment choices the pipeline runs on. */
export interface ComponentLibrarySpec {
  /** Absolute checkout root containing {@link CLIENT_TREE}. */
  readonly root: string
  /** Whether the watcher keeps records fresh after the cold-start scan. */
  readonly watch: boolean
}

/**
 * Resolve the plugin config into the pipeline spec. A missing checkout root
 * is a loud load failure: the plugin's whole purpose is learning that tree.
 * @param config - composition config from the plugin entry.
 * @returns the resolved spec.
 */
export function resolveComponentLibrarySpec(config: Config): ComponentLibrarySpec {
  if (config.root !== undefined) {
    if (!existsSync(join(config.root, CLIENT_TREE))) {
      throw new Error(`component-library: config.root ${config.root} does not contain ${CLIENT_TREE}`)
    }
    return { root: config.root, watch: config.watch ?? true }
  }
  let directory = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(directory, CLIENT_TREE))) return { root: directory, watch: config.watch ?? true }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error('component-library: cannot locate the checkout root from this package; set config.root')
}

/** Query ranking: exact name beats package match beats keyword-in-jsdoc. */
function scoreRecord(record: ComponentRecord, query: string): number {
  const needle = query.trim().toLowerCase()
  if (needle === '') return 0
  if (record.name.toLowerCase() === needle) return 100
  if (record.name.toLowerCase().includes(needle)) return 60
  if (record.pkg.toLowerCase().includes(needle)) return 40
  if (record.jsdoc.toLowerCase().includes(needle)) return 20
  if (record.tokens.some(token => token.toLowerCase().includes(needle))) return 10
  return -1
}

/** Project one durable record into the model/panel-facing match shape. */
function toMatch(record: ComponentRecord): ComponentMatch {
  return Object.freeze({
    name: record.name,
    pkg: record.pkg,
    path: record.path,
    props: record.props,
    tokens: record.tokens,
    example: record.example,
    origin: record.origin,
  })
}

/** The default `limit` of one query. */
export const DEFAULT_QUERY_LIMIT = 10

declare module '@deepseek-ai/cordis' {
  interface Context {
    componentLibrary: ComponentLibraryService
  }
}

/** Copy and freeze one record before it crosses the service boundary. */
function snapshotRecord(record: ComponentRecord): ComponentRecord {
  return Object.freeze({ ...record })
}

/**
 * Storage-domain owner of the component library. Durable writes — scan,
 * watch, model tool, panel review — each broadcast `component-library/changed`
 * after the domain commits, which the panel uses to refetch.
 */
export class ComponentLibraryService extends TypertRemoteService {
  static inject = ['storageDomain', 'tools', 'systemPrompt', 'skills', 'settings']

  /** Composition config; the loader fills defaults from {@link Config}. */
  static Config: z<Config> = Config

  private readonly spec: ComponentLibrarySpec
  private table?: KvTable<string, ComponentRecord>
  private tokens: readonly StyleToken[] = []
  private settings?: ComponentLibrarySettings
  private changeQueued = false

  /**
   * @param ctx - Host context carrying the storage, tool, prompt, skill, and settings services.
   * @param config - composition config; see {@link resolveComponentLibrarySpec}.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'componentLibrary')
    this.spec = resolveComponentLibrarySpec(config)
  }

  /** Open the domain, register every consumer face, and start learning. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(componentLibraryDomainSpec)
    this.ctx.effect(() => async () => {
      await domain.close()
    }, 'component-library.domainClose')
    this.table = domain.table('components')

    const settingsScope = this.ctx.settings.register(COMPONENT_LIBRARY_SETTINGS_NAMESPACE, ComponentLibrarySettingsSchema)
    this.settings = settingsScope.get()
    this.ctx.effect(() => settingsScope.watch((value) => {
      this.settings = value
    }), 'component-library.settingsWatch')

    this.ctx.systemPrompt.section({
      name: 'component-library:reuse',
      order: this.ctx.systemPrompt.getSectionOrder('TOOL_COMPONENT_LIBRARY'),
      text: 'This checkout has a component library learned from its own UI packages. '
        + 'Before writing UI code, call component_query for the target area and prefer the scanned '
        + 'components and their `--dsw-*` design tokens over inventing new primitives. '
        + 'After creating a genuinely new reusable component, call component_record so later work can find it.',
    })

    registerComponentTools(this.ctx, this)
    this.ctx.skills.registerProvider((control) => {
      // The catalog caches list() output; a library change must re-collect so
      // a later load regenerates the body from fresh records.
      this.ctx.on('component-library/changed', () => control.invalidate())
      return createComponentLibrarySkillProvider(this)
    })

    this.tokens = await scanDesignTokens(this.spec.root)
    await this.rescan()
    if (this.spec.watch) {
      const warn = (line: string): void => {
        this.ctx.logger('component-library').warn('%s', line)
      }
      const watcher = new ComponentLibraryWatcher(this.spec.root, {
        onFileSettled: file => void this.relearnFile(file),
        onFileRemoved: file => void this.forgetFile(file),
      }, warn)
      this.ctx.effect(() => async () => {
        await watcher.dispose()
      }, 'component-library.watcher')
      await watcher.start()
    }
  }

  /** The resolved pipeline spec (checkout root, watch flag). */
  get pipelineSpec(): ComponentLibrarySpec {
    return this.spec
  }

  /** The parsed design-token inventory of the checkout's theme stylesheet. */
  get designTokens(): readonly StyleToken[] {
    return this.tokens
  }

  /**
   * Read every durable record, most recently updated first.
   * @returns the frozen snapshot list.
   */
  snapshotAll(): readonly ComponentRecord[] {
    const items = [...this.requireTable().entries()]
      .map(([, record]) => record)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(snapshotRecord)
    return Object.freeze(items)
  }

  /** Broadcast one settled change, coalesced to one emit per microtask burst. */
  private announce(): void {
    if (this.changeQueued) return
    this.changeQueued = true
    queueMicrotask(() => {
      this.changeQueued = false
      this.ctx.emit('component-library/changed')
    })
  }

  /** Resolve the initialized durable table or fail a broken service lifecycle. */
  private requireTable(): KvTable<string, ComponentRecord> {
    if (this.table === undefined) {
      throw new Error('component-library: durable domain is not initialized')
    }
    return this.table
  }

  /**
   * Persist scanned records, skipping no-op writes so a rescan of an
   * unchanged file neither churns `updatedAt` nor re-announces the library.
   * Scanned records are authoritative: they overwrite model records of the
   * same id and are born reviewed.
   */
  private async upsertScanned(records: readonly ComponentRecord[]): Promise<void> {
    const table = this.requireTable()
    let touched = false
    for (const record of records) {
      const current = table.get(record.id)
      if (current !== undefined && current.origin === 'scanned') {
        const { updatedAt: _stale, ...rest } = current
        const { updatedAt: _fresh, ...incoming } = record
        if (JSON.stringify(rest) === JSON.stringify(incoming)) continue
      }
      await table.put(record.id, record)
      touched = true
    }
    if (touched) this.announce()
  }

  /** Cold-start or full re-scan: learn the tree, then drop stale scanned records. */
  private async rescan(): Promise<void> {
    const scanned = await scanComponentLibrary(this.spec.root, line => this.ctx.logger('component-library').warn('%s', line))
    await this.upsertScanned(scanned)
    const table = this.requireTable()
    const fresh = new Set(scanned.map(record => record.id))
    const stale = [...table.keys()].filter(key => table.get(key)?.origin === 'scanned' && !fresh.has(key))
    for (const key of stale) await table.delete(key)
    if (stale.length > 0) this.announce()
  }

  /** Re-learn one settled `.tsx` file (and its CSS module) after a watch event. */
  private async relearnFile(file: string): Promise<void> {
    const records = await extractFile(this.spec.root, file, line => this.ctx.logger('component-library').warn('%s', line))
    await this.upsertScanned(records)
    const table = this.requireTable()
    const path = records.at(0)?.path
    if (path === undefined) {
      await this.forgetFile(file)
      return
    }
    // A component renamed or deleted inside the file leaves a stale record.
    const fresh = new Set(records.map(record => record.id))
    const stale = [...table.keys()]
      .filter(key => table.get(key)?.path === path && table.get(key)?.origin === 'scanned' && !fresh.has(key))
    for (const key of stale) await table.delete(key)
    if (stale.length > 0) this.announce()
  }

  /** Drop every scanned record sourced from one removed `.tsx` file. */
  private async forgetFile(file: string): Promise<void> {
    const table = this.requireTable()
    const path = recordPath(this.spec.root, file)
    const stale = [...table.keys()].filter(key => table.get(key)?.path === path && table.get(key)?.origin === 'scanned')
    for (const key of stale) await table.delete(key)
    if (stale.length > 0) this.announce()
  }

  /**
   * Rank matches for one free-text query. Unreviewed model records stay
   * quarantined unless the settings namespace opts in; when included they
   * rank below every scanned match.
   * @param request - the query, optional package filter, optional limit.
   * @returns the ranked match list.
   */
  rankMatches(request: ComponentLibraryQueryRequest): readonly ComponentMatch[] {
    const table = this.requireTable()
    const includeUnreviewed = this.settings?.includeUnreviewed ?? false
    const limit = request.limit ?? DEFAULT_QUERY_LIMIT
    const scored: { record: ComponentRecord; score: number }[] = []
    for (const [, record] of table.entries()) {
      if (request.pkg !== undefined && record.pkg !== request.pkg) continue
      if (record.origin === 'model' && !record.reviewed && !includeUnreviewed) continue
      const score = scoreRecord(record, request.query)
      if (score < 0) continue
      scored.push({ record, score })
    }
    scored.sort((left, right) =>
      right.score - left.score
      || (left.record.origin === right.record.origin ? 0 : left.record.origin === 'scanned' ? -1 : 1)
      || Number(right.record.propsInferred) - Number(left.record.propsInferred)
      || (right.record.reviewed ? 1 : 0) - (left.record.reviewed ? 1 : 0)
      || right.record.updatedAt - left.record.updatedAt)
    const matches = scored.slice(0, limit).map(({ record }) => toMatch(record))
    return Object.freeze(matches)
  }

  /**
   * Validate and store one model-contributed record: quarantined
   * (`reviewed: false`) until a human approves it on the panel. An id already
   * covered by the scanner is a loud rejection, not an overwrite.
   * @param request - the model's claim about the component it created.
   * @returns the stored id, or `invalid-record`.
   */
  async contribute(request: ComponentLibraryRecordRequest): Promise<ComponentLibraryRecordResult> {
    const directory = /packages\/client\/([^/]+)/.exec(request.path)?.[1]
    const id = `${directory ?? request.pkg}/${request.name}`
    const table = this.requireTable()
    const current = table.get(id)
    if (current?.origin === 'scanned') {
      return { ok: false, error: { code: 'invalid-record', detail: `${id} is already covered by the scanner` } }
    }
    const record: ComponentRecord = {
      id,
      pkg: request.pkg,
      name: request.name,
      path: request.path,
      props: request.props ?? [],
      tokens: request.tokens ?? [],
      jsdoc: request.jsdoc ?? '',
      example: request.example ?? '',
      origin: 'model',
      propsInferred: true,
      rawProps: '',
      reviewed: current?.reviewed ?? false,
      updatedAt: Date.now(),
    }
    const parsed = componentRecordSchema.safeParse(record)
    if (!parsed.success) {
      return { ok: false, error: { code: 'invalid-record', detail: parsed.error.issues.map(issue => issue.message).join('; ') } }
    }
    await table.put(id, record)
    this.announce()
    return { ok: true, value: { done: true, id } }
  }

  /**
   * Ranked component retrieval for the panel and the skill body.
   * @param request - the query, optional package filter, optional limit.
   * @returns the ranked matches.
   */
  @Remote('query')
  async query(request: ComponentLibraryQueryRequest): Promise<ComponentLibraryQueryResult> {
    return { ok: true, value: Object.freeze({ matches: this.rankMatches(request) }) }
  }

  /**
   * Library counts for the panel header.
   * @returns total, scanned, and pending-review counts.
   */
  @Remote('summary')
  async summary(): Promise<ComponentLibrarySummaryResult> {
    const table = this.requireTable()
    let scanned = 0
    let pendingReview = 0
    for (const [, record] of table.entries()) {
      if (record.origin === 'scanned') scanned += 1
      else if (!record.reviewed) pendingReview += 1
    }
    return { ok: true, value: Object.freeze({ total: table.size, scanned, pendingReview }) }
  }

  /**
   * Read every record, most recently updated first.
   * @returns the frozen snapshot list.
   */
  @Remote('list')
  async list(): Promise<ComponentLibraryListResult> {
    return { ok: true, value: Object.freeze({ items: this.snapshotAll() }) }
  }

  /**
   * Store one model-contributed record (the panel-free write path of
   * {@link contribute}).
   * @param request - the record claim.
   * @returns the stored id, or `invalid-record`.
   */
  @Remote('record')
  async record(request: ComponentLibraryRecordRequest): Promise<ComponentLibraryRecordResult> {
    return this.contribute(request)
  }

  /**
   * Apply one panel review decision: `approve` marks the record reviewed and
   * lifts the quarantine; `discard` deletes it.
   * @param request - the record and the decision.
   * @returns the ack, or `component-not-found`.
   */
  @Remote('review')
  async review(request: ComponentLibraryReviewRequest): Promise<ComponentLibraryReviewResult> {
    const table = this.requireTable()
    const current = table.get(request.id)
    if (current === undefined) {
      return { ok: false, error: { code: 'component-not-found', id: request.id } }
    }
    if (request.decision === 'discard') {
      await table.delete(request.id)
      this.announce()
      return { ok: true, value: { done: true } }
    }
    if (!current.reviewed) {
      await table.put(request.id, snapshotRecord({ ...current, reviewed: true, updatedAt: Date.now() }))
      this.announce()
    }
    return { ok: true, value: { done: true } }
  }
}

export default ComponentLibraryService
