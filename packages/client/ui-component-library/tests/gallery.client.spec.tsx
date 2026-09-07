// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ComponentLibraryListResult, ComponentRecord } from '@deepseek-ai/dsh-component-library/types'
import { ComponentLibraryController } from '../src/client/controller.ts'
import type { ComponentLibraryRemoteFace } from '../src/client/controller.ts'
import { ComponentLibraryGallery } from '../src/client/ComponentLibraryGallery.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** One record fixture with a resolved props table and a captured example. */
function rich(id: string, name: string, pkg: string): ComponentRecord {
  return {
    id,
    pkg,
    name,
    path: `packages/client/x/src/client/${name}.tsx`,
    props: [{ name: 'label', type: 'string', required: true }],
    tokens: ['--dsw-alias-label-primary'],
    jsdoc: `The ${name} component.`,
    example: `<${name} label="hi" />`,
    origin: 'scanned',
    propsInferred: true,
    rawProps: '',
    reviewed: true,
    updatedAt: 1,
  }
}

/** One raw-props fixture: a dynamic props type the scanner could not resolve. */
function raw(id: string, name: string, rawProps: string): ComponentRecord {
  return { ...rich(id, name, '@deepseek-ai/dsh-client-ui-x'), props: [], propsInferred: false, rawProps }
}

/** A fake Remote face over an in-memory record set. */
function fakeRemote(initial: ComponentRecord[]): ComponentLibraryRemoteFace {
  const state = { records: [...initial] }
  return {
    list: () => Promise.resolve<RemoteResult<ComponentLibraryListResult>>({
      ok: true,
      value: { ok: true, value: { items: Object.freeze([...state.records]) } },
    }),
    review: () => Promise.reject(new Error('unused here')),
  }
}

/** Mount the gallery with hand-fed slot props and a reactive store hook. */
/** The page-global registry double the gallery reads through window.__DSH_STORIES__. */
type StoriesDouble = { has(id: string): boolean; mount(id: string, container: HTMLElement): Promise<(() => void) | undefined> }

/** Install the page-global registry double; removed by the returned reset. */
function installStories(double: StoriesDouble): () => void {
  ;(window as unknown as { __DSH_STORIES__?: StoriesDouble }).__DSH_STORIES__ = double
  return () => {
    delete (window as unknown as { __DSH_STORIES__?: StoriesDouble }).__DSH_STORIES__
  }
}

function mountGallery(controller: ComponentLibraryController): void {
  const t = (key: string): string => (en as Record<string, string>)[key] ?? key
  render(
    <ComponentLibraryGallery
      sessionId={'sess-1' as never}
      viewRequest={null}
      openView={() => {}}
      completeViewRequest={() => {}}
      useSession={() => { throw new Error('unused by the component library gallery') }}
      useSessions={(() => undefined) as never}
      useSessionPendingInteraction={() => { throw new Error('unused by the component library gallery') }}
      useWorkspaces={(() => undefined) as never}
      useProjection={() => undefined}
      useConversation={() => { throw new Error('unused by the component library gallery') }}
      useChat={() => { throw new Error('unused by the component library gallery') }}
      useTrajectory={() => { throw new Error('unused by the component library gallery') }}
      useInput={() => { throw new Error('unused by the component library gallery') }}
      inputActions={{} as never}
      t={t as never}
      useComponentLibrary={selector => useSyncExternalStore(
        listener => controller.subscribe(listener),
        () => selector(controller.getSnapshot()),
      )}
      ensure={() => void controller.ensure()}
      setQuery={(query) => {
        controller.setQuery(query)
      }}
    />,
  )
}

describe('ComponentLibraryGallery', () => {
  it('mounts a live preview when the page installs a story for the record', async () => {
    const mounts: string[] = []
    let disposed = 0
    const reset = installStories({
      has: id => id === 'ui-x/Gauge',
      mount: (id, container) => {
        mounts.push(id)
        const marker = document.createElement('div')
        marker.textContent = `story:${id}`
        container.appendChild(marker)
        return Promise.resolve(() => {
          disposed += 1
        })
      },
    })
    const controller = new ComponentLibraryController(fakeRemote([
      rich('ui-x/Gauge', 'Gauge', '@deepseek-ai/dsh-client-ui-x'),
      rich('ui-x/Panel', 'Panel', '@deepseek-ai/dsh-client-ui-x'),
    ]))
    mountGallery(controller)

    expect(await screen.findByText('story:ui-x/Gauge')).toBeDefined()
    expect(mounts).toEqual(['ui-x/Gauge'])

    // The record without a story releases the old preview on switch.
    fireEvent.click(screen.getAllByText('Panel')[0]!)
    await screen.findByText('The Panel component.')
    expect(disposed).toBe(1)
    expect(document.querySelector('[data-story="live"]')).toBeNull()
    reset()
  })

  it('renders the list, selects a row, and shows its contract', async () => {
    const controller = new ComponentLibraryController(fakeRemote([
      rich('ui-x/Gauge', 'Gauge', '@deepseek-ai/dsh-client-ui-x'),
      rich('ui-x/Panel', 'Panel', '@deepseek-ai/dsh-client-ui-x'),
    ]))
    mountGallery(controller)

    expect((await screen.findAllByText('Gauge')).length).toBeGreaterThan(0)
    // The first visible row is selected by default; its contract shows.
    expect(screen.getAllByText('The Gauge component.').length).toBeGreaterThan(0)
    expect(screen.getByText('label')).toBeDefined()
    expect(screen.getByText(en['gallery.required'])).toBeDefined()
    expect(screen.getByText('--dsw-alias-label-primary')).toBeDefined()
    // The CodeBlock's shiki tree splits the text; assert on the document text.
    expect(document.body.textContent).toContain('<Gauge label="hi" />')

    // Selecting the second row swaps the detail pane.
    fireEvent.click(screen.getAllByText('Panel')[0]!)
    expect(await screen.findByText('The Panel component.')).toBeDefined()
  })

  it('searches through the shared query and shows the raw props fallback', async () => {
    const controller = new ComponentLibraryController(fakeRemote([
      rich('ui-x/Gauge', 'Gauge', '@deepseek-ai/dsh-client-ui-x'),
      raw('ui-x/Panel', 'Panel', 'BaseProps & { title: string }'),
    ]))
    mountGallery(controller)
    expect((await screen.findAllByText('Gauge')).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('Panel'))
    expect(screen.getByText(en['gallery.propsRaw'])).toBeDefined()
    expect(document.body.textContent).toContain('BaseProps & { title: string }')

    fireEvent.change(screen.getByPlaceholderText(en['gallery.searchPlaceholder']), { target: { value: 'gauge' } })
    expect(screen.queryAllByText('Panel')).toHaveLength(0)
  })

  it('shows the empty state when nothing matches', async () => {
    const controller = new ComponentLibraryController(fakeRemote([rich('ui-x/Gauge', 'Gauge', '@deepseek-ai/dsh-client-ui-x')]))
    mountGallery(controller)
    expect((await screen.findAllByText('Gauge')).length).toBeGreaterThan(0)
    fireEvent.change(screen.getByPlaceholderText(en['gallery.searchPlaceholder']), { target: { value: 'zzz-none' } })
    expect(screen.getAllByText(en['gallery.empty']).length).toBeGreaterThan(0)
  })
})
