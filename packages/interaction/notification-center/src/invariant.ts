/**
 * Package-owned invariant companion for the in-app notification center.
 *
 * The service owns no durable event relationship to validate: entries live in
 * their own storage domain, never enter a session log, and every collector
 * reads authoritative event surfaces. The empty installer keeps that absence
 * explicit in composed invariant sets.
 *
 * @module @deepseek-ai/dsh-notification-center/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-notification-center'

/** Cordis companion plugin name. */
export const name = 'notification-center-invariant'
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
