// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  ComponentLibraryListResult,
  ComponentLibraryReviewResult,
  ComponentRecord,
} from '@deepseek-ai/dsh-component-library/types'
import { ComponentLibraryController, filterRecords } from '../src/client/controller.ts'
import type { ComponentLibraryRemoteFace } from '../src/client/controller.ts'
import { ComponentLibraryCard } from '../src/client/ComponentLibraryCard.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** One scanned record fixture. */
function scanned(id: string, name: string, jsdoc = ''): ComponentRecord {
  return {
    id,
    pkg: '@deepseek-ai/dsh-client-ui-demo',
    name,
    path: `packages/client/ui-demo/src/client/${name}.tsx`,
    props: [{ name: 'label', type: 'string', required: true }],
    tokens: ['--dsw-alias-label-primary'],
    jsdoc,
    example: '',
    origin: 'scanned',
    propsInferred: true,
    rawProps: '',
    reviewed: true,
    updatedAt: 1,
  }
}

/** One unreviewed model record fixture. */
function modeled(id: string, name: string): ComponentRecord {
  return { ...scanned(id, name), origin: 'model', reviewed: false }
}

/** A fake Remote face over an in-memory record set. */
function fakeRemote(initial: ComponentRecord[]): ComponentLibraryRemoteFace & { readonly records: readonly ComponentRecord[] } {
  const state = { records: [...initial] }
  return {
    list: () => Promise.resolve<RemoteResult<ComponentLibraryListResult>>({
      ok: true,
      value: { ok: true, value: { items: Object.freeze([...state.records]) } },
    }),
    review: (request) => {
      const current = state.records.find(record => record.id === request.id)
      if (current === undefined) {
        return Promise.resolve<RemoteResult<ComponentLibraryReviewResult>>({
          ok: true,
          value: { ok: false, error: { code: 'component-not-found', id: request.id } },
        })
      }
      if (request.decision === 'discard') {
        state.records = state.records.filter(record => record.id !== request.id)
      } else {
        state.records = state.records.map(record => record.id === request.id ? { ...record, reviewed: true } : record)
      }
      return Promise.resolve<RemoteResult<ComponentLibraryReviewResult>>({ ok: true, value: { ok: true, value: { done: true } } })
    },
    /** Mutable mirror for assertions. */
    get records() {
      return state.records
    },
  }
}

/** The standard runtime hooks the card type carries but never calls. */
const unusedHook = (): never => {
  throw new Error('unused in this card')
}

/** Mount the card with hand-fed slot props and a reactive store hook. */
function mountCard(controller: ComponentLibraryController): { reviewed: [string, string][] } {
  const reviewed: [string, string][] = []
  const t = (key: string): string => (en as Record<string, string>)[key] ?? key
  render(
    <ComponentLibraryCard
      t={t as never}
      useComponentLibrary={selector => useSyncExternalStore(
        listener => controller.subscribe(listener),
        () => selector(controller.getSnapshot()),
      )}
      ensure={() => void controller.ensure()}
      setQuery={(query) => {
        controller.setQuery(query)
      }}
      review={(id, decision) => {
        reviewed.push([id, decision])
        void controller.review(id, decision)
      }}
      useSessions={unusedHook}
      useWorkspaces={unusedHook}
      useSessionPendingInteraction={unusedHook}
    />,
  )
  return { reviewed }
}

describe('ComponentLibraryController', () => {
  it('stays cold until ensure, then publishes the loaded rows', async () => {
    const remote = fakeRemote([scanned('ui-demo/Gauge', 'Gauge', 'One gauge.')])
    const controller = new ComponentLibraryController(remote)
    expect(controller.cold).toBe(true)
    await controller.ensure()
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.items.map(item => item.id)).toEqual(['ui-demo/Gauge'])
  })

  it('keeps the last good rows when a resync fails', async () => {
    const remote = fakeRemote([scanned('ui-demo/Gauge', 'Gauge')])
    const controller = new ComponentLibraryController(remote)
    await controller.ensure()
    vi.spyOn(remote, 'list').mockRejectedValueOnce(new Error('transport down'))
    await controller.resync()
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('error')
    expect(state.error).toBe('transport down')
    expect(state.items).toHaveLength(1)
  })

  it('applies a review decision through the remote and converges', async () => {
    const remote = fakeRemote([modeled('ui-demo/BotCard', 'BotCard')])
    const controller = new ComponentLibraryController(remote)
    await controller.ensure()
    await controller.review('ui-demo/BotCard', 'approve')
    expect(remote.records.at(0)?.reviewed).toBe(true)
    await controller.review('ui-demo/BotCard', 'discard')
    expect(remote.records).toHaveLength(0)
    expect(controller.store.getSnapshot().items).toHaveLength(0)
  })

  it('rejects a review of an unknown id', async () => {
    const controller = new ComponentLibraryController(fakeRemote([]))
    await expect(controller.review('ui-demo/Ghost', 'approve')).rejects.toThrow('component-not-found')
  })

  it('propagates a carrier-level review failure', async () => {
    const remote = fakeRemote([modeled('ui-demo/BotCard', 'BotCard')])
    vi.spyOn(remote, 'review').mockRejectedValueOnce(new Error('connection lost'))
    const controller = new ComponentLibraryController(remote)
    await controller.ensure()
    await expect(controller.review('ui-demo/BotCard', 'approve')).rejects.toThrow('connection lost')
  })

  it('publishes the search text and short-circuits a warm ensure', async () => {
    const remote = fakeRemote([scanned('ui-demo/Gauge', 'Gauge')])
    const listSpy = vi.spyOn(remote, 'list')
    const controller = new ComponentLibraryController(remote)
    await controller.ensure()
    expect(listSpy).toHaveBeenCalledTimes(1)
    await controller.ensure()
    expect(listSpy).toHaveBeenCalledTimes(1)
    controller.setQuery('gauge')
    expect(controller.store.getSnapshot().query).toBe('gauge')
  })
})

describe('filterRecords', () => {
  const items = [scanned('ui-demo/Gauge', 'Gauge', 'One gauge.'), scanned('ui-demo/Panel', 'Panel', 'A panel.')]

  it('returns everything for a blank query', () => {
    expect(filterRecords(items, '  ')).toHaveLength(2)
  })

  it('matches name, package, and jsdoc case-insensitively', () => {
    expect(filterRecords(items, 'gauge')).toHaveLength(1)
    expect(filterRecords(items, 'UI-DEMO')).toHaveLength(2)
    expect(filterRecords(items, 'panel')).toHaveLength(1)
    expect(filterRecords(items, 'nothing')).toHaveLength(0)
  })
})

describe('ComponentLibraryCard', () => {
  it('lists the loaded records and filters them from the search box', async () => {
    const controller = new ComponentLibraryController(fakeRemote([
      scanned('ui-demo/Gauge', 'Gauge', 'One gauge.'),
      scanned('ui-demo/Panel', 'Panel', 'A panel.'),
    ]))
    mountCard(controller)
    expect(await screen.findByText('Gauge')).toBeDefined()
    expect(screen.getByText('Panel')).toBeDefined()

    fireEvent.change(screen.getByPlaceholderText(en['card.searchPlaceholder']), { target: { value: 'gauge' } })
    expect(screen.queryByText('Panel')).toBeNull()
    expect(screen.getByText('Gauge')).toBeDefined()
  })

  it('shows review controls only on unreviewed model rows', async () => {
    const controller = new ComponentLibraryController(fakeRemote([
      scanned('ui-demo/Gauge', 'Gauge'),
      modeled('ui-demo/BotCard', 'BotCard'),
    ]))
    const { reviewed } = mountCard(controller)
    expect(await screen.findByText('BotCard')).toBeDefined()
    // One unreviewed model row: exactly one approve/discard pair.
    const approve = screen.getByText(en['card.approve'])
    fireEvent.click(approve)
    expect(reviewed).toEqual([['ui-demo/BotCard', 'approve']])
    await screen.findByText('BotCard')
  })

  it('renders the pending-review badge and the empty and error states', async () => {
    const pending = new ComponentLibraryController(fakeRemote([modeled('ui-demo/BotCard', 'BotCard')]))
    mountCard(pending)
    expect(await screen.findByText(en['card.pendingReview'], { exact: false })).toBeDefined()
    cleanup()

    const empty = new ComponentLibraryController(fakeRemote([]))
    mountCard(empty)
    expect(await screen.findByText(en['card.empty'])).toBeDefined()
    cleanup()

    const failing = new ComponentLibraryController({
      list: () => Promise.reject(new Error('host offline')),
      review: () => Promise.reject(new Error('host offline')),
    })
    mountCard(failing)
    expect(await screen.findByText('host offline')).toBeDefined()
  })
})
