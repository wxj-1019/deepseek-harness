/**
 * Package-owned invariant companion for vision-model routing.
 *
 * The service owns no independent event relationship: routing rides the
 * `agent/request` waterfall and the loop logs the effective provider/model in
 * `request/header` and `assistant/message` sources, whose ownership the agent
 * package validates. The empty installer keeps that absence explicit in
 * composed invariant sets.
 *
 * @module @deepseek-ai/dsh-llm-vision-route/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-llm-vision-route'

/** Cordis companion plugin name. */
export const name = 'llm-vision-route-invariant'
/** Services required before the companion can register. */
export const inject = ['invariants']

/** No runtime invariant: the loop owns the only durable model-selection relationship. */
const install: InvariantInstaller = () => {}

/**
 * Register the intentionally empty invariant contribution.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
