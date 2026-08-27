/**
 * Public request, value, and failure vocabulary for the user's daily todo
 * list. This module contains types only so generated Remote clients can
 * consume it without importing Host runtime code, and it carries the seam's
 * Cordis event declaration.
 * @module @deepseek-ai/dsh-user-todo/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * A linked workspace's id, structurally the workspace package's branded
 * `WorkspaceId`. Declared locally so this client-safe module stays clear of
 * the workspace package's import graph (its `types` entry carries the
 * host-side session-root declarations).
 */
export type LinkedWorkspaceId = Branded<'WorkspaceId'>

/** Nominal id of one todo item, minted by the Host service. */
export type UserTodoId = Branded<'UserTodoId'>

/**
 * Mint one todo-item id from an opaque string. The brand is only a marker:
 * callers pass generated uuids through unchanged.
 * @param value - the opaque id text.
 * @returns the branded id.
 */
export function UserTodoId(value: string): UserTodoId {
  return value as UserTodoId
}

/** One todo item on the user's list. */
export interface UserTodoRecord {
  /** Stable item identity, minted at create and never rewritten. */
  readonly id: UserTodoId
  /** Required non-blank task text. */
  readonly title: string
  /** Optional explanation, stored verbatim after validation. */
  readonly note?: string
  /** Whether the task is done; `completedAt` is present exactly when true. */
  readonly done: boolean
  /** Host-assigned creation time in Unix epoch milliseconds. */
  readonly createdAt: number
  /** Host-assigned completion time in epoch milliseconds; absent while open. */
  readonly completedAt?: number
  /** Optional linked project (workspace). Present whenever `sessionId` is. */
  readonly workspaceId?: LinkedWorkspaceId
  /**
   * Optional linked session inside {@link workspaceId}. Write-side validated
   * against the workspace registry; the link stores ids only and is not
   * lifecycle-fenced (a deleted session leaves the reference stale by design).
   */
  readonly sessionId?: SessionId
}

/** Create one item, or retitle / annotate / relink an existing one. */
export interface UserTodoPutRequest {
  /** Absent to create a new item with a fresh id; present to update in place. */
  readonly id?: UserTodoId
  /** Desired title. Required on create; omitted keeps the current title. */
  readonly title?: string
  /** Desired note; `null` clears, omitted keeps the current note. */
  readonly note?: string | null
  /** Desired project link; `null` clears, omitted keeps the current link. */
  readonly workspaceId?: LinkedWorkspaceId | null
  /** Desired session link; `null` clears, omitted keeps the current link. */
  readonly sessionId?: SessionId | null
}

/** Flip one item between open and done. */
export interface UserTodoToggleRequest {
  /** The addressed item. */
  readonly id: UserTodoId
  /** Desired state; entering `true` stamps `completedAt`, leaving clears it. */
  readonly done: boolean
}

/** Remove one item from the list. */
export interface UserTodoDeleteRequest {
  /** The addressed item. */
  readonly id: UserTodoId
}

/** Idempotent deletion acknowledgement. */
export interface UserTodoDeleteValue {
  /** Stable postcondition shared by the first deletion and every retry. */
  readonly absent: true
}

/** Current values of every item on the list, oldest first. */
export interface UserTodoListValue {
  /** Fresh immutable snapshots in creation order. */
  readonly items: readonly UserTodoRecord[]
}

/** A supplied title contains no non-whitespace character. */
export interface UserTodoTitleBlank {
  readonly code: 'title-blank'
}

/** No item exists for the requested id. */
export interface UserTodoItemNotFound {
  readonly code: 'item-not-found'
  readonly id: UserTodoId
}

/** The requested project link names no registered workspace. */
export interface UserTodoWorkspaceNotFound {
  readonly code: 'workspace-not-found'
  readonly workspaceId: LinkedWorkspaceId
}

/**
 * A session link was supplied without its workspace link.
 */
export interface UserTodoSessionLinkWithoutWorkspace {
  readonly code: 'session-link-without-workspace'
  readonly sessionId: SessionId
}

/**
 * The named session is not in the linked workspace's accounted sessions.
 */
export interface UserTodoSessionNotInWorkspace {
  readonly code: 'session-not-in-workspace'
  readonly workspaceId: LinkedWorkspaceId
  readonly sessionId: SessionId
}

/** Failures shared by the public user-todo operations. */
export type UserTodoFailure =
  | UserTodoTitleBlank
  | UserTodoItemNotFound
  | UserTodoWorkspaceNotFound
  | UserTodoSessionLinkWithoutWorkspace
  | UserTodoSessionNotInWorkspace

/** Successful public operation result. */
export interface UserTodoSuccess<T> {
  readonly ok: true
  readonly value: T
}

/** Rejected public operation result with a stable business failure. */
export interface UserTodoRejected<E extends UserTodoFailure> {
  readonly ok: false
  readonly error: E
}

/** Result returned by the `list` operation. */
export type UserTodoListResult = UserTodoSuccess<UserTodoListValue>

/** Result returned by the `put` operation. */
export type UserTodoPutResult =
  | UserTodoSuccess<UserTodoRecord>
  | UserTodoRejected<
    | UserTodoTitleBlank
    | UserTodoItemNotFound
    | UserTodoWorkspaceNotFound
    | UserTodoSessionLinkWithoutWorkspace
    | UserTodoSessionNotInWorkspace
  >

/** Result returned by the `toggle` operation. */
export type UserTodoToggleResult =
  | UserTodoSuccess<UserTodoRecord>
  | UserTodoRejected<UserTodoItemNotFound>

/** Result returned by the `delete` operation. */
export type UserTodoDeleteResult = UserTodoSuccess<UserTodoDeleteValue>

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * The user's todo list changed through any write verb (`put`, `toggle`,
     * `delete`). Emitted after the storage domain committed the mutation;
     * arguments are intentionally empty — consumers refetch instead of
     * replaying item deltas. Listener failures are contained by the emitter's
     * dispatch.
     * @mode emit
     */
    'user-todo/changed'(): void
  }
}
