/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-settings-dev-checks`.
 * @module @deepseek-ai/dsh-client-ui-settings-dev-checks/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-settings-dev-checks'

/** Cordis companion plugin name. */
export const name = 'client-ui-settings-dev-checks-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the page is a pure projection of the bound settings
 * scope snapshot and owns no cross-plugin mutable relation; scope transport,
 * Host registration, and the scripts-side key lock are covered directly by
 * this package's specs and scripts/dev-checks.spec.ts.
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
