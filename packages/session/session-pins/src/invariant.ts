/**
 * Package-owned invariant companion for the pinned-session set.
 *
 * The service owns no durable event relationship to validate: pins live in
 * their own storage domain, never enter a session log, and naming a session
 * is validated at write time against the session store and persistence
 * catalog. The empty installer keeps that absence explicit in composed
 * invariant sets.
 *
 * @module @deepseek-ai/dsh-session-pins/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-session-pins'

/** Cordis companion plugin name. */
export const name = 'session-pins-invariant'
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
