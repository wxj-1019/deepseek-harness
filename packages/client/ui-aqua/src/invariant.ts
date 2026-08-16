/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-aqua`.
 * @module @deepseek-ai/dsh-client-ui-aqua/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-aqua'

/** Cordis companion plugin name. */
export const name = 'client-ui-aqua-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the settings scope validates and publishes the durable
 * section, the runtime applies exactly what adoption delivers, and every
 * layer-owned effect (token overrides, the DOM attributes, the ambient scene)
 * is disposed with the plugin fiber. Store/service agreement is covered
 * directly by this package's runtime, layer, and host behavior specs.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
