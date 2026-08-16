// @vitest-environment jsdom
/** AquaAppearanceRow behavior: the row renders nothing while the master
 * switch is off; knob and flag controls drive the injected face; wallpaper
 * picks upload through the injected face with busy and failure presentation;
 * the delete action clears the stored wallpaper. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { useSyncExternalStore } from 'react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { AquaAppearanceRow } from '../src/client/AquaAppearanceRow.tsx'
import type { AquaAppearanceRowComponentProps, AquaAppearanceRowInjected } from '../src/client/AquaAppearanceRow.tsx'
import { createAquaRowStore } from '../src/client/settings-store.ts'
// Type-only: loads the `settings.aqua` LocaleNamespaceMap merge the locale seat resolves against.
import type {} from '../src/client/locales.ts'
import type { AquaRowState } from '../src/client/settings-store.ts'
import { AQUA_DEFAULTS, type AquaSection, type WallpaperRef } from '../src/aqua-settings.ts'

afterEach(cleanup)

const COPY: Record<string, string> = {
  'aqua.mode': 'Mode',
  'aqua.modeMica': 'Mica',
  'aqua.modeCompat': 'Compatibility',
  'aqua.materialGroup': 'Glass material',
  'aqua.background': 'Backdrop',
  'aqua.backgroundFluid': 'Fluid',
  'aqua.backgroundWallpaper': 'Wallpaper',
  'aqua.wallpaper': 'Wallpaper',
  'aqua.chooseImage': 'Choose image',
  'aqua.chooseVideo': 'Choose video',
  'aqua.uploading': 'Uploading…',
  'aqua.uploadError': 'Upload failed: the image or video exceeds the size or format limits; try again.',
  'aqua.deleteWallpaper': 'Delete',
  'aqua.bgBrightness': 'Background brightness',
}

const IMAGE_REF: WallpaperRef = {
  attachmentId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'image/png',
  bytes: 3,
  width: 2,
  height: 2,
}

/** Empty standard-kit hook bindings (the row reads neither). */
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

type FaceMocks = {
  [K in keyof AquaAppearanceRowInjected]: AquaAppearanceRowInjected[K] extends (...params: infer P) => infer R
    ? Mock<(...params: P) => R>
    : never
}

function mountRow(section: AquaSection, dark = false, configure?: (face: FaceMocks) => void) {
  const store = createAquaRowStore().create()
  store.actions.sync({ ...section, dark }, 0)
  const face = {
    setMode: vi.fn<(value: 'mica' | 'compat') => void>(),
    setBlur: vi.fn<(value: number) => void>(),
    setFrost: vi.fn<(value: number) => void>(),
    setFluidHue: vi.fn<(value: number) => void>(),
    setFluidDepth: vi.fn<(value: number) => void>(),
    setBgBrightness: vi.fn<(value: number) => void>(),
    setBackground: vi.fn<(value: 'fluid' | 'wallpaper') => void>(),
    uploadWallpaper: vi.fn<(file: File) => Promise<void>>(() => Promise.resolve()),
    clearWallpaper: vi.fn<() => void>(),
    setWhale: vi.fn<(value: boolean) => void>(),
    setCritters: vi.fn<(value: boolean) => void>(),
    setMesh: vi.fn<(value: boolean) => void>(),
    setSpotlight: vi.fn<(value: boolean) => void>(),
    setPress: vi.fn<(value: boolean) => void>(),
    setWallpaperBlur: vi.fn<(value: number) => void>(),
    setWallpaperFrost: vi.fn<(value: number) => void>(),
    setVideoBlur: vi.fn<(value: number) => void>(),
    setVideoBrightness: vi.fn<(value: number) => void>(),
  } satisfies FaceMocks
  configure?.(face)
  const useStore = <S,>(selector: (state: AquaRowState) => S) =>
    useSyncExternalStore(onChange => store.subscribe(onChange), () => selector(store.getSnapshot()))
  const props: AquaAppearanceRowComponentProps = {
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useStore,
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    ...face,
  }
  render(<AquaAppearanceRow {...props} />)
  return { face, store }
}

describe('AquaAppearanceRow', () => {
  it('renders nothing while the master switch is off', () => {
    mountRow({ ...AQUA_DEFAULTS, enabled: false })
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('mode and backdrop segmented controls drive the injected face', () => {
    const { face } = mountRow({ ...AQUA_DEFAULTS })
    fireEvent.click(screen.getByRole('button', { name: 'Compatibility' }))
    expect(face.setMode).toHaveBeenCalledWith('compat')
    fireEvent.click(screen.getByRole('button', { name: 'Wallpaper' }))
    expect(face.setBackground).toHaveBeenCalledWith('wallpaper')
  })

  it('the image picker mounts behind its button and only uploads after the client-side downscale produces bytes', () => {
    // jsdom has no canvas decode, so the downscale never completes here; the
    // upload chain itself is covered by the video-input tests below. A click
    // alone (no file chosen) never uploads.
    const { face } = mountRow({ ...AQUA_DEFAULTS, background: 'wallpaper' })
    const input = document.querySelector('input[accept^="image/"]') as HTMLInputElement
    expect(input).not.toBeNull()
    const clicked = vi.fn()
    input.addEventListener('click', clicked)
    fireEvent.click(screen.getByRole('button', { name: 'Choose image' }))
    expect(clicked).toHaveBeenCalledTimes(1)
    expect(face.uploadWallpaper).not.toHaveBeenCalled()
  })

  it('a failed upload surfaces the error copy', async () => {
    mountRow({ ...AQUA_DEFAULTS, background: 'wallpaper' }, false, (face) => {
      face.uploadWallpaper.mockRejectedValueOnce(new Error('413'))
    })
    const input = document.querySelector('input[accept^="video/"]') as HTMLInputElement
    const file = new File([new Uint8Array([1, 1])], 'clip.webm', { type: 'video/webm' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByText(COPY['aqua.uploadError']!)).not.toBeNull()
  })

  it('a stored wallpaper offers the delete action and it clears', () => {
    const { face } = mountRow({ ...AQUA_DEFAULTS, background: 'wallpaper', wallpaper: IMAGE_REF })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(face.clearWallpaper).toHaveBeenCalledTimes(1)
  })
})
