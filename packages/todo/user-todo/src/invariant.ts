/**
 * Package-owned invariant companion for the user's daily todo list.
 *
 * The service owns no durable event relationship to validate: items live in
 * their own storage domain, the list never enters a session log or a model
 * request, and link targets are validated at write time against the
 * workspace registry. The empty installer keeps that absence explicit in
 * composed invariant sets.
 *
 * @module @deepseek-ai/dsh-user-todo/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-user-todo'

/** Cordis companion plugin name. */
export const name = 'user-todo-invariant'
/** Services required before the companion can register. */
export const inject = ['invariants']

/** No runtime invariant: the storage domain is the only owned durable surface. */
const install: InvariantInstaller = () => {}

/**
 * Register the intentionally empty invariant contribution.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
