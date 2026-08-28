/**
 * Package-owned invariant companion for the usage ledger.
 *
 * The service owns no durable event relationship to validate: rows live in
 * their own storage domain, never enter a session log, and accumulation is a
 * pure sum of provider-reported samples. The empty installer keeps that
 * absence explicit in composed invariant sets.
 *
 * @module @deepseek-ai/dsh-usage-ledger/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-usage-ledger'

/** Cordis companion plugin name. */
export const name = 'usage-ledger-invariant'
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
