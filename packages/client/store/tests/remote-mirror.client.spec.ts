import { describe, expect, it, vi } from 'vitest'
import { RemoteError, type RemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import { mirrorErrorMessage, RemoteMirrorController } from '../src/index.ts'

interface TestState {
  status: 'cold' | 'loading' | 'ready' | 'error'
  items: readonly string[]
  error: string | null
}

type ListOk = { readonly ok: true; readonly value: { readonly ok: true; readonly value: { readonly items: readonly string[] } } }
type AddOk = { readonly ok: true; readonly value: { readonly ok: true; readonly value: { readonly done: true } } }
type AddRejected = { readonly ok: true; readonly value: { readonly ok: false; readonly error: { readonly code: string } } }
type TransportFailed = { readonly ok: false; readonly error: RemoteFailure }

interface TestRemoteFace {
  list: () => Promise<ListOk | TransportFailed>
  add: (request: { readonly id: string }) => Promise<AddOk | AddRejected | TransportFailed>
}

class TestController extends RemoteMirrorController<TestState, TestRemoteFace, { readonly items: readonly string[] }> {
  constructor(remote: TestRemoteFace) {
    super(remote, { status: 'cold', items: [], error: null })
  }

  protected read(remote: TestRemoteFace): ReturnType<TestRemoteFace['list']> {
    return remote.list()
  }

  protected applyReady(state: TestState, value: { readonly items: readonly string[] }): void {
    state.items = Object.freeze([...value.items])
  }

  add(id: string): Promise<string | undefined> {
    return this.mutate(remote => remote.add({ id }))
  }
}

type ListResponse = Awaited<ReturnType<TestRemoteFace['list']>>
type AddResponse = Awaited<ReturnType<TestRemoteFace['add']>>

const okList = (items: readonly string[]): Promise<ListResponse> =>
  Promise.resolve({ ok: true, value: { ok: true, value: { items } } })

const okAdd = (): Promise<AddResponse> =>
  Promise.resolve({ ok: true, value: { ok: true, value: { done: true } } })

const transportFail = (message: string): TransportFailed =>
  ({ ok: false, error: new RemoteError('gateway/internal', message, {}) })

describe('RemoteMirrorController', () => {
  it('advertises loading only on the first read, then publishes the ready snapshot', async () => {
    const seen: string[] = []
    const controller = new TestController({ list: vi.fn(() => okList(['a'])), add: vi.fn(() => okAdd()) })
    controller.subscribe(() => { seen.push(controller.getSnapshot().status) })
    const settling = controller.resync()
    expect(controller.getSnapshot().status).toBe('loading')
    await settling
    expect(controller.getSnapshot()).toEqual({ status: 'ready', items: ['a'], error: null })
    expect(seen).toEqual(['loading', 'ready'])
  })

  it('converges silently on later reads', async () => {
    const list = vi.fn(() => okList(['a']))
    const controller = new TestController({ list, add: vi.fn(() => okAdd()) })
    await controller.resync()
    list.mockImplementation(() => okList(['a', 'b']))
    const seen: string[] = []
    controller.subscribe(() => { seen.push(controller.getSnapshot().status) })
    await controller.resync()
    expect(controller.getSnapshot().items).toEqual(['a', 'b'])
    expect(seen).toEqual(['ready'])
  })

  it('maps a transport failure to the error state and keeps the last good items', async () => {
    const list = vi.fn(() => okList(['a']))
    const controller = new TestController({ list, add: vi.fn(() => okAdd()) })
    await controller.resync()
    list.mockImplementation(() => Promise.resolve(transportFail('host down')))
    await controller.resync()
    expect(controller.getSnapshot().status).toBe('error')
    expect(controller.getSnapshot().error).toBe('host down')
    expect(controller.getSnapshot().items).toEqual(['a'])
  })

  it('maps a rejected read through mirrorErrorMessage', async () => {
    const controller = new TestController({
      list: vi.fn(() => Promise.reject(new Error('wire broke'))),
      add: vi.fn(() => okAdd()),
    })
    await controller.resync()
    expect(controller.getSnapshot().status).toBe('error')
    expect(controller.getSnapshot().error).toBe('wire broke')
  })

  it('ensure resolves without reading once ready, and re-reads from error', async () => {
    const list = vi.fn(() => okList(['a']))
    const controller = new TestController({ list, add: vi.fn(() => okAdd()) })
    await controller.ensure()
    expect(list).toHaveBeenCalledTimes(1)
    await controller.ensure()
    expect(list).toHaveBeenCalledTimes(1)
    list.mockImplementation(() => Promise.resolve(transportFail('host down')))
    await controller.resync()
    list.mockImplementation(() => okList(['a']))
    await controller.ensure()
    expect(list).toHaveBeenCalledTimes(3)
    expect(controller.getSnapshot().status).toBe('ready')
  })

  it('mutate converges from the Host and resolves undefined on success', async () => {
    const list = vi.fn(() => okList(['a']))
    const controller = new TestController({ list, add: vi.fn(() => okAdd()) })
    await controller.ensure()
    list.mockImplementation(() => okList(['a', 'b']))
    await expect(controller.add('b')).resolves.toBeUndefined()
    expect(controller.getSnapshot().items).toEqual(['a', 'b'])
  })

  it('mutate returns the transport message and does not converge', async () => {
    const list = vi.fn(() => okList(['a']))
    const add = vi.fn(() => Promise.resolve(transportFail('write refused')))
    const controller = new TestController({ list, add })
    await controller.ensure()
    await expect(controller.add('b')).resolves.toBe('write refused')
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('mutate returns code:<code> on a business rejection', async () => {
    const controller = new TestController({
      list: vi.fn(() => okList(['a'])),
      add: vi.fn((): Promise<AddOk | AddRejected | TransportFailed> =>
        Promise.resolve({
          ok: true,
          value: { ok: false, error: { code: 'item-not-found' } },
        })),
    })
    await controller.ensure()
    await expect(controller.add('b')).resolves.toBe('code:item-not-found')
  })

  it('mutate maps a rejection through mirrorErrorMessage', async () => {
    const controller = new TestController({
      list: vi.fn(() => okList(['a'])),
      add: vi.fn(() => Promise.reject(new Error('verb blew up'))),
    })
    await controller.ensure()
    await expect(controller.add('b')).resolves.toBe('verb blew up')
  })
})

describe('mirrorErrorMessage', () => {
  it('returns the message of an Error and String()s anything else', () => {
    expect(mirrorErrorMessage(new Error('boom'))).toBe('boom')
    expect(mirrorErrorMessage('plain')).toBe('plain')
  })
})
