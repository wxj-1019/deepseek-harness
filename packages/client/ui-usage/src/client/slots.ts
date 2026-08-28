/**
 * Injected face of the Usage settings section: the bound state selector hook
 * (reserved hooks seat) plus plain action callbacks. The section component
 * contains no subscription machinery and no ctx access.
 * @module @deepseek-ai/dsh-client-ui-usage/client/slots
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { UsageState } from './controller.ts'

/** Full injected share handed to the section component. */
export interface UsageSectionInjected {
  /** Reserved hooks seat: the renderer binds the store into `useUsage`. */
  hooks: { usage: HostObservable<UsageState> }

  /** Pull the ledger once unless it has already been read or is loaded. */
  ensure(): Promise<void>
}
