/**
 * Browser-local object layer over the user's durable todo list. The Host owns
 * every durable mutation; this controller mirrors the list snapshot, applies
 * verbs through the generated `userTodos` Remote, and reloads after each
 * committed change — its own and everyone else's, via the pushed
 * `user-todo/changed` event.
 * @module @deepseek-ai/dsh-client-ui-user-todo/client/controller
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { RemoteMirrorController } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  LinkedWorkspaceId,
  UserTodoId,
  UserTodoItemNotFound,
  UserTodoListResult,
  UserTodoListValue,
  UserTodoRecord,
  UserTodoRejected,
  UserTodoSessionLinkWithoutWorkspace,
  UserTodoSessionNotInWorkspace,
  UserTodoTitleBlank,
  UserTodoWorkspaceNotFound,
} from '@deepseek-ai/dsh-user-todo/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

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

/** One shared controller for the whole client (the list is user-global). */
export class UserTodoController
  extends RemoteMirrorController<UserTodoState, UserTodosRemoteFace, UserTodoListValue>
  implements HostObservable<UserTodoState> {
  constructor(remote: UserTodosRemoteFace) {
    super(remote, { status: 'cold', items: [], error: null })
  }

  protected read(remote: UserTodosRemoteFace): Promise<RemoteResult<UserTodoListResult>> {
    return remote.list()
  }

  protected applyReady(state: UserTodoState, value: UserTodoListValue): void {
    state.items = Object.freeze(value.items.map(item => ({ ...item })))
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
}
