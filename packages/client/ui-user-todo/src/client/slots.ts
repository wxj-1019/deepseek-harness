/**
 * Injected face of the sidebar-foot daily-todo entry: the bound state
 * selector hook (reserved hooks seat) plus plain action callbacks. The
 * business component contains no subscription machinery and no ctx access —
 * this face is the only channel to the shared controller.
 * @module @deepseek-ai/dsh-client-ui-user-todo/client/slots
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { UserTodoId } from '@deepseek-ai/dsh-user-todo/types'
import type { UserTodoState } from './controller.ts'

/** Full injected share handed to the slot entry's component. */
export interface UserTodoInjected {
  /**
   * Selector hook over the shared controller's store; the renderer binds the
   * bare observable into this `useTodo` selector hook.
   */
  hooks: { todo: HostObservable<UserTodoState> }

  /** Pull the list once unless it has already been read or is loaded. */
  ensure(): Promise<void>
  /** Force a list refetch (push events and reconnects use the same path). */
  resync(): Promise<void>
  /** Create an item from non-blank text; resolves a failure message. */
  add(title: string): Promise<string | undefined>
  /** Flip one item between open and done. */
  toggle(id: UserTodoId, done: boolean): Promise<string | undefined>
  /** Replace an item's title with new non-blank text. */
  retitle(id: UserTodoId, title: string): Promise<string | undefined>
  /** Set (`id`) or clear (`undefined`) the item's workspace link. */
  setWorkspaceLink(id: UserTodoId, workspaceId: string | undefined): Promise<string | undefined>
  /** Delete one item. */
  remove(id: UserTodoId): Promise<string | undefined>
}
