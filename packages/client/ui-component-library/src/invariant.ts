/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-component-library`.
 * @module @deepseek-ai/dsh-client-ui-component-library/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-component-library'

/** Cordis companion plugin name. */
export const name = 'ui-component-library-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the card is a pure projection of the component_library
 * domain's Remote face; the write path's ordering is checked on the Host side.
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
