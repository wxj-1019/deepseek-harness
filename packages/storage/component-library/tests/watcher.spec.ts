import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeWatcher extends EventEmitter {
  readonly options: Record<string, unknown>
  readonly watchedPath: string
  closeCalls: number
  close(): Promise<void>
}

const harness = vi.hoisted(() => {
  const watchers: FakeWatcher[] = []
  return { watchers, startupError: undefined as Error | undefined }
})

vi.mock('chokidar', () => ({
  default: {
    watch(path: string, options: Record<string, unknown>): FakeWatcher {
      const watcher = new EventEmitter() as FakeWatcher
      Object.defineProperty(watcher, 'options', { value: options })
      Object.defineProperty(watcher, 'watchedPath', { value: path })
      watcher.closeCalls = 0
      watcher.close = () => {
        watcher.closeCalls += 1
        return Promise.resolve()
      }
      harness.watchers.push(watcher)
      queueMicrotask(() => {
        if (harness.startupError !== undefined) watcher.emit('error', harness.startupError)
        else watcher.emit('ready')
      })
      return watcher
    },
  },
}))

import { ComponentLibraryWatcher } from '../src/watcher.ts'

beforeEach(() => {
  harness.watchers.length = 0
  harness.startupError = undefined
})

function collect(): {
  settled: string[]
  removed: string[]
  events: { onFileSettled: (file: string) => void; onFileRemoved: (file: string) => void }
} {
  const settled: string[] = []
  const removed: string[] = []
  return {
    settled,
    removed,
    events: {
      onFileSettled: file => settled.push(file),
      onFileRemoved: file => removed.push(file),
    },
  }
}

const noLog = (): void => {}

describe('ComponentLibraryWatcher', () => {
  it('watches the client tree with a 200 ms stability threshold and node_modules ignored', async () => {
    const { events } = collect()
    const watcher = new ComponentLibraryWatcher('/checkout', events, noLog)
    await watcher.start()
    const fake = harness.watchers[0]
    expect(fake?.watchedPath.replaceAll('\\', '/')).toBe('/checkout/packages/client')
    expect(fake?.options).toMatchObject({
      ignoreInitial: true,
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    })
    await watcher.dispose()
    expect(fake?.closeCalls).toBe(1)
  })

  it('raises onFileSettled for settled tsx files and their css modules', async () => {
    const { settled, events } = collect()
    const watcher = new ComponentLibraryWatcher('/checkout', events, noLog)
    await watcher.start()
    const fake = harness.watchers[0]!

    fake.emit('change', '/checkout/packages/client/ui-demo/src/client/Gauge.tsx')
    fake.emit('add', '/checkout/packages/client/ui-demo/src/client/New.tsx')
    // A settled CSS module re-learns its sibling component file.
    fake.emit('change', '/checkout/packages/client/ui-demo/src/client/Gauge.module.css')
    // Irrelevant kinds never reach the pipeline.
    fake.emit('change', '/checkout/packages/client/ui-demo/src/client/notes.md')

    expect(settled).toEqual([
      '/checkout/packages/client/ui-demo/src/client/Gauge.tsx',
      '/checkout/packages/client/ui-demo/src/client/New.tsx',
      '/checkout/packages/client/ui-demo/src/client/Gauge.tsx',
    ])
    await watcher.dispose()
  })

  it('raises onFileRemoved for an unlinked tsx but re-learns on an unlinked css module', async () => {
    const { settled, removed, events } = collect()
    const watcher = new ComponentLibraryWatcher('/checkout', events, noLog)
    await watcher.start()
    const fake = harness.watchers[0]!

    fake.emit('unlink', '/checkout/packages/client/ui-demo/src/client/Old.tsx')
    fake.emit('unlink', '/checkout/packages/client/ui-demo/src/client/Gauge.module.css')

    expect(removed).toEqual(['/checkout/packages/client/ui-demo/src/client/Old.tsx'])
    expect(settled).toEqual(['/checkout/packages/client/ui-demo/src/client/Gauge.tsx'])
    await watcher.dispose()
  })

  it('rejects start on a watcher error and disposes cleanly', async () => {
    const { events } = collect()
    harness.startupError = new Error('spawn EMFILE')
    const lines: string[] = []
    const watcher = new ComponentLibraryWatcher('/checkout', events, line => lines.push(line))
    await expect(watcher.start()).rejects.toThrow('spawn EMFILE')
    expect(lines.some(line => line.includes('spawn EMFILE'))).toBe(true)
    await watcher.dispose()
  })

  it('tolerates dispose before start and double start', async () => {
    const { events } = collect()
    const watcher = new ComponentLibraryWatcher('/checkout', events, noLog)
    await watcher.dispose()
    await Promise.all([watcher.start(), watcher.start()])
    expect(harness.watchers).toHaveLength(1)
    await watcher.dispose()
    await watcher.dispose()
    expect(harness.watchers[0]?.closeCalls).toBe(1)
  })
})
