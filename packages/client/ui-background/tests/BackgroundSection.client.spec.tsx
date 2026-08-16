// @vitest-environment jsdom
/** BackgroundSection behavior: preference cards drive the injected face,
 * preset swatches select ids, uploads chain through the face with busy and
 * failure presentation, invalid snapshots render the error banner, and the
 * probe effect tracks stored-image availability without letting a stale
 * verdict overwrite a newer one. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { useSyncExternalStore } from 'react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { BackgroundSection } from '../src/client/BackgroundSection.tsx'
import type { BackgroundSectionComponentProps, BackgroundSectionInjected } from '../src/client/BackgroundSection.tsx'
import { createBackgroundSectionStore } from '../src/client/settings-store.ts'
import type { BackgroundSectionState } from '../src/client/settings-store.ts'
import {
  BACKGROUND_PRESETS, DEFAULT_BACKGROUND, type BackgroundImageRef, type BackgroundSettings, type BackdropResolution,
} from '../src/background-settings.ts'

afterEach(cleanup)

const COPY: Record<string, string> = {
  'nav': 'Background',
  'title': 'Background',
  'kind.none': 'None',
  'kind.preset': 'Presets',
  'kind.image': 'Image',
  'preset.aurora': 'Aurora',
  'preset.dusk': 'Dusk',
  'preset.mist': 'Mist',
  'upload': 'Upload image',
  'uploading': 'Uploading…',
  'remove': 'Remove image',
  'dimming': 'Dimming',
  'imageUnavailable': 'The background image is no longer available; upload it again.',
  'invalid.unknownPreset': 'The selected preset does not exist; choose again.',
  'invalid.missingImageRef': 'The image reference is missing; upload again.',
}

/** Empty standard-kit hook bindings (the section reads neither). */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  })
  return bindSnapshotSelector(store)
}

/** One stored-image reference, distinct per attachment id. */
function imageRef(attachmentId: string): BackgroundImageRef {
  return { attachmentId, mediaType: 'image/png', bytes: 3, width: 2, height: 2 }
}

/** Image-preference section over one stored reference. */
function imageSection(attachmentId: string): BackgroundSettings {
  return { preference: 'image', image: imageRef(attachmentId), dimming: 45 }
}

/** The injected face with the vi.fn control surface on every member. */
type FaceMocks = {
  [K in keyof BackgroundSectionInjected]: BackgroundSectionInjected[K] extends (...params: infer P) => infer R
    ? Mock<(...params: P) => R>
    : never
}

function mountSection(
  section: BackgroundSettings,
  backdrop: BackdropResolution = { kind: 'none' },
  configure?: (face: FaceMocks) => void,
) {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createBackgroundSectionStore().create()
  store.actions.sync(section, backdrop, 0)
  const face = {
    setNone: vi.fn<() => void>(),
    setPreset: vi.fn<(id: string) => void>(),
    uploadImage: vi.fn<(file: File) => Promise<void>>(() => Promise.resolve()),
    setDimming: vi.fn<(value: number) => void>(),
    probeImage: vi.fn<() => Promise<boolean>>(() => Promise.resolve(true)),
  } satisfies FaceMocks
  configure?.(face)
  // uSES binding over the engine instance, like the framework supplies.
  const useStore = <S,>(selector: (state: BackgroundSectionState) => S) =>
    useSyncExternalStore(
      onChange => store.subscribe(onChange),
      () => selector(store.getSnapshot()),
    )
  const props: BackgroundSectionComponentProps = {
    close: () => {},
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useStore,
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    ...face,
  }
  render(<BackgroundSection {...props} />)
  return { face, store }
}

const pressed = (name: RegExp): string | null =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed')

describe('BackgroundSection', () => {
  it('the Presets card from a bare section selects the first preset', () => {
    const { face } = mountSection({ preference: 'none', dimming: 45 })
    // Selection state comes from the store mirror: the none card is pressed,
    // the other preference cards are not.
    expect(pressed(/None/)).toBe('true')
    expect(pressed(/Presets/)).toBe('false')
    expect(pressed(/Image/)).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Presets' }))
    expect(face.setPreset).toHaveBeenCalledWith('aurora')
    // Without a stored image the file row is not mounted: the card's input
    // ref click is a no-op, not an upload.
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    expect(face.uploadImage).not.toHaveBeenCalled()
  })

  it('swatches select presets, the Presets card re-selects the current one, and None retracts', () => {
    const { face } = mountSection(
      { preference: 'preset', preset: 'mist', dimming: 45 },
      { kind: 'preset', css: { light: 'a', dark: 'b' } },
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Dusk' }))
    expect(face.setPreset).toHaveBeenCalledWith('dusk')
    // Swatch selection follows the store mirror, not the click echo: Mist
    // stays checked and Dusk stays unchecked until a sync lands.
    expect(screen.getByRole('radio', { name: 'Mist' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Dusk' }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Presets' }))
    expect(face.setPreset).toHaveBeenCalledWith('mist')
    fireEvent.click(screen.getByRole('button', { name: 'None' }))
    expect(face.setNone).toHaveBeenCalled()
  })

  it('paints each preset swatch as two half-height layers, light above and dark below', () => {
    mountSection(
      { preference: 'preset', preset: 'aurora', dimming: 45 },
      { kind: 'preset', css: BACKGROUND_PRESETS[0].css },
    )
    // jsdom cannot validate CSS, but the layer structure is the contract: a
    // gradient cannot be a color stop, so nesting the preset values inside one
    // outer gradient is invalid CSS Chromium drops (backgroundImage computes
    // to `none`); the two half-height layers are what actually paints the
    // split swatch.
    for (const preset of BACKGROUND_PRESETS) {
      const label = COPY[`preset.${preset.id}`] ?? preset.id
      const swatch = screen.getByRole('radio', { name: label })
      // jsdom re-serializes style values (hex becomes rgb()), so normalize the
      // expected layers through the same element-style round trip.
      const normalizer = document.createElement('div')
      normalizer.style.backgroundImage = preset.css.dark
      const dark = normalizer.style.backgroundImage
      normalizer.style.backgroundImage = preset.css.light
      const light = normalizer.style.backgroundImage
      normalizer.style.backgroundPosition = 'bottom, top'
      const position = normalizer.style.backgroundPosition
      expect(swatch.style.backgroundImage).toBe(`${dark}, ${light}`)
      expect(swatch.style.backgroundSize).toBe('100% 50%')
      expect(swatch.style.backgroundPosition).toBe(position)
      expect(swatch.style.backgroundRepeat).toBe('no-repeat')
    }
  })

  it('uploads the chosen file, ignores empty selections, and removes through setNone', async () => {
    const { face } = mountSection(imageSection(`sha256:${'a'.repeat(64)}`), { kind: 'image' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([1])], 'bg.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => { expect(face.uploadImage).toHaveBeenCalledWith(file) })

    fireEvent.change(input, { target: { files: [] } })
    expect(face.uploadImage).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }))
    expect(face.setNone).toHaveBeenCalled()
  })

  it('surfaces upload failures as the Error message', async () => {
    mountSection(imageSection(`sha256:${'a'.repeat(64)}`), { kind: 'image' }, (face) => {
      face.uploadImage.mockRejectedValue(new Error('413'))
    })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([1])], 'bg.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    expect((await screen.findByRole('alert')).textContent).toContain('413')
  })

  it('stringifies non-Error upload failures', async () => {
    mountSection(imageSection(`sha256:${'a'.repeat(64)}`), { kind: 'image' }, (face) => {
      face.uploadImage.mockRejectedValue('boom')
    })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([1])], 'bg.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    expect((await screen.findByRole('alert')).textContent).toContain('boom')
  })

  it('renders the invalid banner and drives the dimming slider', () => {
    const { face } = mountSection(
      { preference: 'preset', preset: 'gone', dimming: 45 },
      { kind: 'invalid', reason: 'unknown-preset' },
    )
    expect(screen.getByRole('alert').textContent).toContain('preset does not exist')
    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } })
    expect(face.setDimming).toHaveBeenCalledWith(60)
    // With the resolved backdrop not a preset, the card falls back to the
    // first preset id.
    fireEvent.click(screen.getByRole('button', { name: 'Presets' }))
    expect(face.setPreset).toHaveBeenCalledWith('aurora')
  })

  it('probes availability while an image stands', async () => {
    const section: BackgroundSettings = {
      preference: 'image',
      image: imageRef(`sha256:${'c'.repeat(64)}`),
      dimming: DEFAULT_BACKGROUND.dimming,
    }
    mountSection(section, { kind: 'image' })
    await waitFor(() => {
      expect(screen.queryAllByRole('alert')).toHaveLength(0)
    })
  })

  it('renders the uploading state while an upload is pending', async () => {
    mountSection(imageSection(`sha256:${'a'.repeat(64)}`), { kind: 'image' }, (face) => {
      face.uploadImage.mockImplementation(() => new Promise<void>(() => {}))
    })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([1])], 'bg.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Uploading…' })
      expect(button.hasAttribute('disabled')).toBe(true)
    })
  })

  it('banners an unavailable stored image', async () => {
    mountSection(imageSection(`sha256:${'a'.repeat(64)}`), { kind: 'image' }, (face) => {
      face.probeImage.mockResolvedValue(false)
    })
    expect((await screen.findByRole('alert')).textContent).toBe(COPY['imageUnavailable'])
  })

  it('treats a probe rejection as unavailable', async () => {
    mountSection(imageSection(`sha256:${'a'.repeat(64)}`), { kind: 'image' }, (face) => {
      face.probeImage.mockRejectedValue(new Error('net down'))
    })
    expect((await screen.findByRole('alert')).textContent).toBe(COPY['imageUnavailable'])
  })

  it('a stale probe cannot overwrite a newer unavailable verdict', async () => {
    let resolveFirst!: (value: boolean) => void
    const { store } = mountSection(imageSection(`sha256:${'a'.repeat(64)}`), { kind: 'image' }, (face) => {
      face.probeImage.mockImplementationOnce(() => new Promise<boolean>((resolve) => { resolveFirst = resolve }))
      face.probeImage.mockImplementation(() => Promise.resolve(false))
    })
    await act(async () => {
      store.actions.sync(imageSection(`sha256:${'b'.repeat(64)}`), { kind: 'image' }, 1)
    })
    expect((await screen.findByRole('alert')).textContent).toBe(COPY['imageUnavailable'])
    await act(async () => { resolveFirst(true) })
    expect(screen.getByRole('alert').textContent).toBe(COPY['imageUnavailable'])
  })

  it('a stale probe rejection cannot clear the current verdict', async () => {
    let rejectFirst!: (reason: unknown) => void
    const { store } = mountSection(imageSection(`sha256:${'a'.repeat(64)}`), { kind: 'image' }, (face) => {
      face.probeImage.mockImplementationOnce(() => new Promise<boolean>((_resolve, reject) => { rejectFirst = reject }))
      face.probeImage.mockImplementation(() => Promise.resolve(true))
    })
    await act(async () => {
      store.actions.sync(imageSection(`sha256:${'b'.repeat(64)}`), { kind: 'image' }, 1)
    })
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => { rejectFirst(new Error('late failure')) })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders the upload row without a stored image reference', () => {
    const { face } = mountSection({ preference: 'image', dimming: 45 }, { kind: 'image' })
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull()
    expect(screen.queryByLabelText('Image')).toBeNull()
    // The card and the action button both delegate to the mounted input.
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    fireEvent.click(screen.getByRole('button', { name: 'Upload image' }))
    expect(face.uploadImage).not.toHaveBeenCalled()
  })
})
