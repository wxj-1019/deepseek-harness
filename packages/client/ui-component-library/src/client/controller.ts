/**
 * Browser-local object layer over the component library. The Host owns every
 * durable record; this controller mirrors the list, reloads after each
 * committed change — via the pushed `component-library/changed` event — and
 * issues the panel's review decisions.
 * @module @deepseek-ai/dsh-client-ui-component-library/client/controller
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { mirrorErrorMessage, RemoteMirrorController } from '@deepseek-ai/dsh-client-store'
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
  /** Reason the last review decision failed, cleared by the next attempt or success. */
  reviewError: string | null
}

/** Payload inside the list call's success value. */
type ComponentLibraryListValue = { readonly items: readonly ComponentRecord[] }

/** One shared controller for the whole client (the library is user-global). */
export class ComponentLibraryController
  extends RemoteMirrorController<ComponentLibraryState, ComponentLibraryRemoteFace, ComponentLibraryListValue>
  implements HostObservable<ComponentLibraryState> {
  constructor(remote: ComponentLibraryRemoteFace) {
    super(remote, { status: 'cold', items: [], query: '', error: null, reviewError: null })
  }

  protected read(remote: ComponentLibraryRemoteFace): Promise<RemoteResult<ComponentLibraryListResult>> {
    return remote.list()
  }

  protected applyReady(state: ComponentLibraryState, value: ComponentLibraryListValue): void {
    state.items = Object.freeze(value.items.map(record => ({ ...record })))
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
   * Apply one review decision, then converge from the Host. The injected
   * face discards this promise, so a failure publishes to the store instead
   * of rejecting — the card renders it as the review error line.
   * @param id - the record under review.
   * @param decision - `approve` lifts the quarantine; `discard` deletes.
   * @returns resolution when the follow-up read settles.
   */
  async review(id: string, decision: 'approve' | 'discard'): Promise<void> {
    this.store.update((state) => {
      state.reviewError = null
    })
    try {
      const response = await this.remote.review({ id, decision })
      if (!response.ok) throw new Error(response.error.message)
      const result = response.value
      if (!result.ok) throw new Error(result.error.code)
    } catch (error) {
      this.store.update((state) => {
        state.reviewError = mirrorErrorMessage(error)
      })
      return
    }
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
