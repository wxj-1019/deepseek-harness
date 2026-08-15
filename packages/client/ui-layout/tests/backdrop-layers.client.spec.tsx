// @vitest-environment jsdom
/**
 * Backdrop layers: AppFrame renders the two inert layers behind the columns,
 * and the frame, shell body, and boot-page stylesheets consume the three
 * --dsw-specific-backdrop-* body variables with inert fallbacks. The mount
 * runs the real layout-store engine path (app-frame.client.spec.tsx is the
 * harness of record); the CSS assertions read the stylesheets from disk, the
 * idiom of ui-theme's scrollbar-styles spec.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { AppFrame } from '@deepseek-ai/dsh-client-ui-layout/src/client/AppFrame.tsx'
import type { AppFrameProps } from '@deepseek-ai/dsh-client-ui-layout/src/client/AppFrame.tsx'
import { createLayoutStore } from '@deepseek-ai/dsh-client-ui-layout/src/client/stores.ts'
import type {
  SessionId, SessionListState, WorkspaceListState,
} from '@deepseek-ai/dsh-client-runtime/client'

// Session selection control for the SessionProvider and useSessions stubs.
const selectedSession = { current: 's-test' as SessionId | undefined }

// Render-prop contract stub fed through the standard seat prop (the renderer
// injects the real one in production): session mode runs children(id), empty
// mode runs the empty branch. Typed as the seat's own component type so the
// branded sessionId parameter stays contract-checked.
const SessionProviderStub: AppFrameProps['SessionProvider'] = ({ children, empty }) =>
  selectedSession.current === undefined ? <>{empty?.() ?? null}</> : <>{children(selectedSession.current)}</>

/** Observer stub: the mount path only needs an observable; this spec never drives resizes. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let frameWidth = 1920

/** Test-local selector hook over a framework-neutral store instance. */
function hookOf<T>(inst: { subscribe: (fn: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(sel: (s: T) => S): S { return sel(useSyncExternalStore(inst.subscribe, inst.getSnapshot)) }
}

function mountFrame() {
  window.innerWidth = frameWidth // first-render viewport source before the observer fires
  const instance = createLayoutStore().create()
  const renderSlot = ((key: string) => {
    if (key === 'sidebar') return <div data-testid="sidebar-content" />
    if (key === 'conversation') return <div data-testid="center-content" />
    if (key === 'details') return <div data-testid="details-content" />
    return null
  }) as AppFrameProps['renderSlot']
  const useSessions = ((sel: (s: SessionListState) => unknown) => {
    const current = selectedSession.current
    const sessionState = {
      ids: current === undefined ? [] : [current],
      byId: current === undefined
        ? {}
        : { [current]: { id: current, displayTitle: 'Test', running: false, blank: false, updatedAt: 1 } },
      current,
      phase: 'ready',
    } as SessionListState
    return sel(sessionState)
  }) as never
  const workspaceState: WorkspaceListState = {
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  }
  const element = () => (
    <AppFrame
      useStore={hookOf(instance)}
      actions={instance.actions}
      renderSlot={renderSlot}
      useSessions={useSessions}
      useWorkspaces={((sel: (s: WorkspaceListState) => unknown) => sel(workspaceState)) as never}
      SessionProvider={SessionProviderStub}
    />
  )
  const utils = render(element())
  const frame = utils.container.firstElementChild as HTMLElement
  return { frame, ...utils }
}

beforeEach(() => {
  frameWidth = 1920
  window.innerWidth = frameWidth
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  Element.prototype.getBoundingClientRect = function () {
    return { width: frameWidth, height: 1080, top: 0, left: 0, right: frameWidth, bottom: 1080, x: 0, y: 0, toJSON: () => ({}) }
  }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('backdrop layers', () => {
  it('renders the inert backdrop and scrim layers behind the columns', () => {
    const { frame } = mountFrame()
    const backdrop = frame.querySelector('[class*="backdrop"]')
    const scrim = frame.querySelector('[class*="scrim"]')
    expect(backdrop).not.toBeNull()
    expect(backdrop?.getAttribute('aria-hidden')).toBe('true')
    expect(scrim).not.toBeNull()
    expect(scrim?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('backdrop stylesheet contract', () => {
  // The jsdom environment shim repurposes the global URL constructor (relative
  // resolutions base on its fake http origin), so these paths resolve through
  // Node's own fileURLToPath plus path join instead of the ui-theme spec's
  // `new URL(rel, import.meta.url)` idiom, which only the node environment
  // leaves intact.
  const TESTS_DIR = dirname(fileURLToPath(import.meta.url))

  it('AppFrame consumes the surface var and both layer vars with fallbacks', () => {
    const css = readFileSync(join(TESTS_DIR, '../src/client/AppFrame.module.css'), 'utf8')
    expect(css).toContain('background: var(--dsw-specific-backdrop-surface, var(--dsw-alias-bg-base))')
    expect(css).toContain('background-image: var(--dsw-specific-backdrop-image, none)')
    expect(css).toContain('background: var(--dsw-specific-backdrop-scrim, transparent)')
    expect(css).toContain('pointer-events: none')
    // Paint order is the load-bearing half of the contract: the layers must
    // stay absolutely positioned below the frame's own background (negative
    // z-index). A z-index of 0 or higher paints the backdrop over the
    // conversation UI while every DOM assertion here stays green.
    expect(css).toContain('position: absolute')
    expect(css).toContain('z-index: -2')
    expect(css).toContain('z-index: -1')
  })

  it('the shell body and boot page repaint through the surface var', () => {
    const base = readFileSync(join(TESTS_DIR, '../../web/src/base.css'), 'utf8')
    expect(base).toContain('background: var(--dsw-specific-backdrop-surface, var(--dsw-alias-bg-base))')
    const boot = readFileSync(join(TESTS_DIR, '../../web/src/AppRoot.module.css'), 'utf8')
    expect(boot).toContain('background: var(--dsw-specific-backdrop-surface, var(--dsw-alias-bg-base, #f9fafb))')
  })
})
