/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-desktop-notify`.
 * @module @deepseek-ai/dsh-client-ui-desktop-notify/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-desktop-notify'

/** Cordis companion plugin name. */
export const name = 'client-ui-desktop-notify-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package is a read-only consumer of the session
 * list snapshot that renders one General settings row and fires Web
 * Notifications. It emits no cordis events, owns no cross-plugin mutable
 * state, and its single slot registration plus watcher subscription prove
 * disposal through the HMR-safety spec.
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
