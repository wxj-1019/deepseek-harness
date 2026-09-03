/**
 * Package-owned invariant companion for the component library: the panel's
 * `component-library/changed` notification must always trail a durable
 * `component_library` domain write — a replay can never announce a record the
 * store does not hold.
 * @module @deepseek-ai/dsh-component-library/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
/* jscpd:ignore-end */
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'
import type {} from './types.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-component-library'

/** Cordis companion plugin name. */
export const name = 'component-library-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** Count durable library writes and fail a change broadcast that did not follow one. */
const install: InvariantInstaller = (ctx, fail) => {
  let unannounced = 0
  ctx.on('domain/changed', (change: DomainChanged) => {
    if (change.domain === 'component_library') unannounced += 1
  }, { global: true })
  ctx.on('component-library/changed', () => {
    if (unannounced === 0) {
      fail('component-library/changed emitted without a preceding component_library domain write')
      return
    }
    unannounced -= 1
  }, { global: true })
}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
