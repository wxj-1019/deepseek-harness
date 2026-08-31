/**
 * Browser-local object layer over the user's durable todo list. The Host owns
 * every durable mutation; this controller mirrors the list snapshot, applies
 * verbs through the generated `userTodos` Remote, and reloads after each
 * committed change — its own and everyone else's, via the pushed
 * `user-todo/changed` event.
 * @module @deepseek-ai/dsh-client-ui-user-todo/client/controller
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  LinkedWorkspaceId,
  UserTodoFailure,
  UserTodoId,
  UserTodoItemNotFound,
  UserTodoListResult,
  UserTodoRecord,
  UserTodoRejected,
  UserTodoSessionLinkWithoutWorkspace,
  UserTodoSessionNotInWorkspace,
  UserTodoTitleBlank,
  UserTodoWorkspaceNotFound,
} from '@deepseek-ai/dsh-user-todo/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
/** Every verb's business union: an opaque success value or a typed rejection. */
type UserTodoBusinessResult =
  | { readonly ok: true; readonly value: unknown }
  | UserTodoRejected<UserTodoFailure>

type PutFailure =
  | UserTodoTitleBlank
  | UserTodoItemNotFound
  | UserTodoWorkspaceNotFound
  | UserTodoSessionLinkWithoutWorkspace
  | UserTodoSessionNotInWorkspace

/** The four Remote calls this controller needs, matching the generated face. */
export interface UserTodosRemoteFace {
  list: () => Promise<RemoteResult<UserTodoListResult>>
  put: (request: {
    id?: UserTodoId
    title?: string
    workspaceId?: LinkedWorkspaceId | null
    sessionId?: SessionId | null
    dueAt?: number | null
  }) => Promise<RemoteResult<
    | { readonly ok: true; readonly value: UserTodoRecord }
    | UserTodoRejected<PutFailure>
  >>
  toggle: (request: { id: UserTodoId; done: boolean }) => Promise<RemoteResult<
    | { readonly ok: true; readonly value: UserTodoRecord }
    | UserTodoRejected<UserTodoItemNotFound>
  >>
  delete: (request: { id: UserTodoId }) => Promise<RemoteResult<
    | { readonly ok: true; readonly value: { readonly absent: true } }
  >>
}

/** Load state of the one list read that feeds the panel. */
export type UserTodoStatus = 'cold' | 'loading' | 'ready' | 'error'

/** Immutable view published to the panel. */
export interface UserTodoState {
  status: UserTodoStatus
  /** Current items in creation order. */
  items: readonly UserTodoRecord[]
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

/** One shared controller for the whole client (the list is user-global). */
export class UserTodoController implements HostObservable<UserTodoState> {
  /** The snapshot the panel renders from (uSES-safe store). */
  readonly store: SnapshotStore<UserTodoState>

  constructor(private readonly remote: UserTodosRemoteFace) {
    this.store = createSnapshotStore<UserTodoState>({
      status: 'cold', items: [], error: null,
    })
  }

  /** @returns the current published state. */
  getSnapshot(): UserTodoState {
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

  /** @returns whether the list has never been read. */
  get cold(): boolean {
    return this.getSnapshot().status === 'cold'
  }

  /**
   * Read the whole list once; a failure keeps the last good items.
   * @returns resolution when the read settles.
   */
  async resync(): Promise<void> {
    // Only the first read advertises a loading state; later reads converge
    // silently so an open panel never flashes a spinner on top of data.
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
      const items = response.value.ok ? response.value.value.items : []
      this.store.update((state) => {
        state.status = 'ready'
        state.items = Object.freeze(items.map(item => ({ ...item })))
        state.error = null
      })
    } catch (error) {
      this.store.update((state) => {
        state.status = 'error'
        state.error = messageOf(error)
      })
    }
  }

  /** Read-once entry for first open: `resync` unless already read. */
  ensure(): Promise<void> {
    if (!this.cold && this.getSnapshot().status !== 'error') return Promise.resolve()
    return this.resync()
  }

  /**
   * Create an item from the composer input.
   * @param title - non-blank task text.
   * @returns the failure message, or undefined once committed.
   */
  async add(title: string): Promise<string | undefined> {
    return this.mutate(remote => remote.put({ title }))
  }

  /**
   * Toggle an item between open and done.
   * @param id - the addressed item.
   * @param done - desired state.
   * @returns the failure message, or undefined once committed.
   */
  async toggle(id: UserTodoId, done: boolean): Promise<string | undefined> {
    return this.mutate(remote => remote.toggle({ id, done }))
  }

  /**
   * Retitle an item inline.
   * @param id - the addressed item.
   * @param title - new non-blank text.
   * @returns the failure message, or undefined once committed.
   */
  async retitle(id: UserTodoId, title: string): Promise<string | undefined> {
    return this.mutate(remote => remote.put({ id, title }))
  }

  /**
   * Set or clear the project link of an item.
   * @param id - the addressed item.
   * @param workspaceId - the workspace to link, or undefined to unlink.
   * @returns the failure message, or undefined once committed.
   */
  async setWorkspaceLink(id: UserTodoId, workspaceId: string | undefined): Promise<string | undefined> {
    return this.mutate(remote =>
      remote.put({
        id,
        ...(workspaceId === undefined ? {} : { workspaceId: workspaceId as LinkedWorkspaceId }),
      }))
  }

  /**
   * Set or clear the session link of an item that already carries a
   * workspace link. The Host revalidates membership on every put.
   * @param id - the addressed item.
   * @param sessionId - the session to link, or undefined to clear.
   * @returns the failure message, or undefined once committed.
   */
  async setSessionLink(id: UserTodoId, sessionId: string | undefined): Promise<string | undefined> {
    return this.mutate(remote =>
      remote.put({ id, ...(sessionId === undefined ? {} : { sessionId: sessionId as SessionId }) }))
  }

  /**
   * Set or clear an item's due time (epoch milliseconds).
   * @param id - the addressed item.
   * @param dueMs - the due instant, or null to clear.
   * @returns the failure message, or undefined once committed.
   */
  async setDue(id: UserTodoId, dueMs: number | null): Promise<string | undefined> {
    return this.mutate(remote => remote.put({ id, dueAt: dueMs }))
  }

  /**
   * Delete an item.
   * @param id - the addressed item.
   * @returns the failure message, or undefined once committed.
   */
  async remove(id: UserTodoId): Promise<string | undefined> {
    return this.mutate(remote => remote.delete({ id }))
  }

  /** Run one verb, then converge the mirror with the Host's post-write state. */
  private async mutate<R extends UserTodoBusinessResult>(
    run: (remote: UserTodosRemoteFace) => Promise<RemoteResult<R>>,
  ): Promise<string | undefined> {
    try {
      const response = await run(this.remote)
      if (!response.ok) return response.error.message
      if (!response.value.ok) return `code:${String(response.value.error.code)}`
    } catch (error) {
      return messageOf(error)
    }
    await this.resync()
    return undefined
  }
}
