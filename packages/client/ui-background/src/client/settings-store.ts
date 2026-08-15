/**
 * Background section slot store: a mirror of the background service snapshot.
 * The plugin's apply-world change listener is the only writer; the section
 * component reads via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import {
  DEFAULT_BACKGROUND, type BackdropResolution, type BackgroundSettings,
} from '../background-settings.ts'

/** Store state mirrored from the background snapshot. */
export interface BackgroundSectionState {
  /** Durable section as last published. */
  section: BackgroundSettings
  /** Resolution for the section (drives the invalid banner). */
  backdrop: BackdropResolution
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type BackgroundSectionActions = {
  sync: (
    draft: BackgroundSectionState,
    section: BackgroundSettings,
    backdrop: BackdropResolution,
    revision: number,
  ) => void
}

/**
 * Declares the Background section state and write surface.
 * @returns the store handle.
 */
export function createBackgroundSectionStore(): EngineStoreHandle<BackgroundSectionState, BackgroundSectionActions> {
  return defineStore({
    init: (): BackgroundSectionState => ({ section: DEFAULT_BACKGROUND, backdrop: { kind: 'none' }, revision: -1 }),
    actions: {
      sync: (d, section: BackgroundSettings, backdrop: BackdropResolution, revision: number) => {
        if (revision <= d.revision) return
        d.section = section
        d.backdrop = backdrop
        d.revision = revision
      },
    },
  })
}
