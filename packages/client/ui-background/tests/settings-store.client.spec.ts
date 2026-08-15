/** Section store: init shape, mirrored sync, and the stale-revision guard. */
import { describe, expect, it } from 'vitest'
import { createBackgroundSectionStore } from '../src/client/settings-store.ts'
import { DEFAULT_BACKGROUND } from '../src/background-settings.ts'

describe('createBackgroundSectionStore', () => {
  it('starts at the default section with revision -1', () => {
    const store = createBackgroundSectionStore().create()
    expect(store.getSnapshot()).toEqual({
      section: DEFAULT_BACKGROUND,
      backdrop: { kind: 'none' },
      revision: -1,
    })
  })

  it('mirrors sync writes and drops stale revisions', () => {
    const store = createBackgroundSectionStore().create()
    store.actions.sync({ preference: 'preset', preset: 'mist', dimming: 45 }, { kind: 'preset', css: { light: 'a', dark: 'b' } }, 3)
    expect(store.getSnapshot().section.preference).toBe('preset')
    store.actions.sync(DEFAULT_BACKGROUND, { kind: 'none' }, 3)
    expect(store.getSnapshot().section.preference).toBe('preset')
    store.actions.sync(DEFAULT_BACKGROUND, { kind: 'none' }, 4)
    expect(store.getSnapshot().backdrop).toEqual({ kind: 'none' })
  })
})
