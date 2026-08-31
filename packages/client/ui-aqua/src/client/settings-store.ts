/**
 * Aqua row slot store: a mirror of the durable section (plus the resolved
 * palette scheme the row's brightness half-range reads). The plugin's
 * apply-world change listener is the only writer; the row component reads via
 * props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import { AQUA_DEFAULTS, type AquaSection } from '../aqua-settings.ts'

/** The full payload the runtime pushes into the row store on every change. */
export type AquaSettingsPayload = AquaSection & {
  /** Resolved palette is dark (brightness knob = darkening half). */
  dark: boolean
}

/** Store state mirrored from the Aqua settings scope. */
export interface AquaRowState extends AquaSettingsPayload {
  /** Monotonic revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type AquaRowActions = {
  sync: (draft: AquaRowState, next: AquaSettingsPayload, revision: number) => void
}

/**
 * Declares the Aqua row state and write surface.
 * @returns the store handle.
 */
export function createAquaRowStore(): EngineStoreHandle<AquaRowState, AquaRowActions> {
  return defineStore({
    init: (): AquaRowState => ({ ...AQUA_DEFAULTS, dark: false, revision: -1 }),
    actions: {
      sync: (d, next: AquaSettingsPayload, revision: number) => {
        if (revision <= d.revision) return
        Object.assign(d, next)
        d.revision = revision
      },
    },
  })
}
