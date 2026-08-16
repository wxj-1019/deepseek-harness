/** The Aqua row store mirrors runtime payloads under a monotonic revision
 * guard: stale revisions never land, and every field rides the payload. */
import { describe, expect, it } from 'vitest'
import { AQUA_DEFAULTS, type AquaSection } from '../src/aqua-settings.ts'
import { createAquaRowStore, type AquaSettingsPayload } from '../src/client/settings-store.ts'

describe('createAquaRowStore', () => {
  it('starts at the shipped defaults with revision -1', () => {
    const store = createAquaRowStore().create()
    expect(store.getSnapshot()).toEqual({ ...AQUA_DEFAULTS, dark: false, revision: -1 })
  })

  it('mirrors sync writes and drops stale revisions', () => {
    const store = createAquaRowStore().create()
    // Payloads are full section snapshots; the helper accumulates like the
    // runtime's section state. The stale call below bypasses the helper so a
    // rejected payload never corrupts the accumulated snapshot.
    let section: AquaSection = { ...AQUA_DEFAULTS }
    const payload = (over: Partial<AquaSettingsPayload>): AquaSettingsPayload => {
      const { dark = false, ...fields } = over
      section = { ...section, ...fields }
      return { ...section, dark }
    }
    store.actions.sync(payload({ blur: 9 }), 4)
    expect(store.getSnapshot()).toMatchObject({ blur: 9, revision: 4 })
    store.actions.sync({ ...AQUA_DEFAULTS, blur: 40, dark: false }, 3)
    expect(store.getSnapshot()).toMatchObject({ blur: 9, revision: 4 })
    store.actions.sync(payload({ mode: 'compat', dark: true }), 5)
    expect(store.getSnapshot()).toMatchObject({ mode: 'compat', blur: 9, dark: true, revision: 5 })
  })
})
