/**
 * Browser-local object layer over the component library. The Host owns every
 * durable record; this controller mirrors the list, reloads after each
 * committed change — via the pushed `component-library/changed` event — and
 * issues the panel's review decisions.
 * @module @deepseek-ai/dsh-client-ui-component-library/client/controller
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ComponentLibraryListResult,
  ComponentLibraryReviewResult,
  ComponentRecord,
} from '@deepseek-ai/dsh-component-library/types'

/** The Remote calls this controller needs, matching the generated face. */
export interface ComponentLibraryRemoteFace {
  list: () => Promise<RemoteResult<ComponentLibraryListResult>>
  review: (request: { id: string; decision: 'approve' | 'discard' }) => Promise<RemoteResult<ComponentLibraryReviewResult>>
}

/** Load state of the one list read that feeds the card. */
export type ComponentLibraryStatus = 'cold' | 'loading' | 'ready' | 'error'

/** Immutable view published to the card. */
export interface ComponentLibraryState {
  /** Read lifecycle; `cold` until the card first renders. */
  status: ComponentLibraryStatus
  /** Every durable record, most recently updated first. */
  items: readonly ComponentRecord[]
  /** The search box's current text (client-side filter). */
  query: string
  /** Reason the last load failed, cleared by the next successful load. */
  error: string | null
}

/**
 * Turn a rejected call into display text; transports reject with anything.
 * @param error - the rejection value.
 * @returns the message to show.
 */
function messageOf(error: unknown): string {
  /* v8 ignore next -- transports reject with Errors; the String arm satisfies the unknown type */
  return error instanceof Error ? error.message : String(error)
}

/** One shared controller for the whole client (the library is user-global). */
export class ComponentLibraryController implements HostObservable<ComponentLibraryState> {
  /** Card projection the slot renderer binds as useComponentLibrary. */
  readonly store: SnapshotStore<ComponentLibraryState>

  constructor(private readonly remote: ComponentLibraryRemoteFace) {
    this.store = createSnapshotStore<ComponentLibraryState>({
      status: 'cold', items: [], query: '', error: null,
    })
  }

  /** @returns the current published state. */
  getSnapshot(): ComponentLibraryState {
    return this.store.getSnapshot()
  }

  /**
   * Subscribe to state revisions.
   * @param listener - called on every store update.
   * @returns the unsubscribe disposer.
   */
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener)
  }

  /**
   * Whether the library has never been read.
   * @returns true while no list read has started.
   */
  get cold(): boolean {
    return this.getSnapshot().status === 'cold'
  }

  /**
   * Read the whole library once; a failure keeps the last good rows.
   * @returns resolution when the read settles.
   */
  async resync(): Promise<void> {
    // Only the first read advertises a loading state; later reads converge
    // silently so an open card never flashes a spinner over data.
    const firstRead = this.cold
    if (firstRead) {
      this.store.update((state) => {
        state.status = 'loading'
        state.error = null
      })
    }
    try {
      const response = await this.remote.list()
      if (!response.ok) throw new Error(response.error.message)
      this.store.update((state) => {
        state.status = 'ready'
        state.items = Object.freeze(response.value.value.items.map(record => ({ ...record })))
        state.error = null
      })
    } catch (error) {
      this.store.update((state) => {
        state.status = 'error'
        state.error = messageOf(error)
      })
    }
  }

  /** Read-once entry for first render: `resync` unless already read. */
  ensure(): Promise<void> {
    if (!this.cold && this.getSnapshot().status !== 'error') return Promise.resolve()
    return this.resync()
  }

  /**
   * Publish the search box text.
   * @param query - the new filter text.
   */
  setQuery(query: string): void {
    this.store.update((state) => {
      state.query = query
    })
  }

  /**
   * Apply one review decision, then converge from the Host.
   * @param id - the record under review.
   * @param decision - `approve` lifts the quarantine; `discard` deletes.
   * @returns resolution when the follow-up read settles.
   */
  async review(id: string, decision: 'approve' | 'discard'): Promise<void> {
    const response = await this.remote.review({ id, decision })
    if (!response.ok) throw new Error(response.error.message)
    const result = response.value
    if (!result.ok) throw new Error(result.error.code)
    await this.resync()
  }
}

/**
 * Filter one record list by the card's search text (name, package, or jsdoc).
 * @param items - the loaded records.
 * @param query - the search box text; blank returns everything.
 * @returns the matching records, in input order.
 */
export function filterRecords(items: readonly ComponentRecord[], query: string): readonly ComponentRecord[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return items
  return items.filter(item =>
    item.name.toLowerCase().includes(needle)
    || item.pkg.toLowerCase().includes(needle)
    || item.jsdoc.toLowerCase().includes(needle))
}
