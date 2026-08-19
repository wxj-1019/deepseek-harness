/**
 * The runtime: replica stores, the completion watcher's edge behavior, and
 * the settings-scope write path (optimistic replica over an authoritative
 * republish).
 */
import { describe, expect, it, vi } from 'vitest'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import {
  browserNotifyPort,
  DesktopNotifyRuntime,
  type NotificationPayload,
  type NotifyPort,
} from '../src/client/desktop-notify.ts'
import type { DesktopNotifySettings } from '../src/desktop-notify-settings.ts'
import { listState, summary } from './support.client.ts'

/** One recorded toast plus a replay for the click-through assertion. */
function recordingPort(): { port: NotifyPort; shown: { payload: NotificationPayload; onClick: () => void }[] } {
  const shown: { payload: NotificationPayload; onClick: () => void }[] = []
  return {
    port: { show: (payload, onClick) => { shown.push({ payload, onClick }); return true } },
    shown,
  }
}

/** A runtime over fresh fakes; every injection point is controllable. */
function bench(opts?: {
  enabled?: boolean
  hidden?: boolean
  notify?: NotifyPort | undefined
  initial?: SessionListState
}) {
  const list = createSnapshotStore(opts?.initial ?? listState([]))
  const open = vi.fn<(id: SessionId) => void>()
  const stub = stubSettingsScope<DesktopNotifySettings>()
  const { port, shown } = recordingPort()
  const focusWindow = vi.fn()
  const runtime = new DesktopNotifyRuntime({
    sessions: { list, open },
    scope: stub.scope,
    notify: opts?.notify ?? port,
    bodyText: () => '任务已完成',
    isHidden: () => opts?.hidden ?? false,
    focusWindow,
  })
  const stop = runtime.start()
  stub.publish({
    status: 'ready',
    writable: true,
    value: { enabled: opts?.enabled ?? false },
  })
  return { runtime, list, open, stub, shown, focusWindow, stop }
}

describe('DesktopNotifyRuntime replicas', () => {
  it('adopts the scope value and writability into the replica stores', () => {
    const { runtime, stub } = bench()
    expect(runtime.enabled.getSnapshot()).toBe(false)
    expect(runtime.editable.getSnapshot()).toBe(true)
    stub.publish({ status: 'ready', writable: true, value: { enabled: true } })
    expect(runtime.enabled.getSnapshot()).toBe(true)
    stub.publish({ writable: false })
    expect(runtime.editable.getSnapshot()).toBe(false)
  })

  it('flips the replica optimistically and queues the durable write', () => {
    const { runtime, stub } = bench()
    runtime.setEnabled(true)
    expect(runtime.enabled.getSnapshot()).toBe(true)
    expect(stub.set).toHaveBeenCalledWith('enabled', true)
  })

  it('republishes the authoritative value after a rejected write', async () => {
    const { runtime, stub } = bench()
    stub.set.mockRejectedValueOnce(new Error('settings-conflict'))
    runtime.setEnabled(true)
    await Promise.resolve()
    stub.publish({ status: 'ready', writable: true, value: { enabled: false } })
    expect(runtime.enabled.getSnapshot()).toBe(false)
  })
})

describe('DesktopNotifyRuntime watcher', () => {
  it('seeds from the snapshot at start: a session already running is watched, not completed', () => {
    const { list, shown } = bench({ enabled: true, initial: listState([summary('a', true)]) })
    expect(shown).toHaveLength(0)
    list.set(listState([summary('a', false)]))
    expect(shown).toHaveLength(1)
  })

  it('toasts a completed session that is not the current selection', () => {
    const { list, shown } = bench({ enabled: true })
    list.set(listState([summary('a', true, 'Refactor work'), summary('b', false)], 'b'))
    list.set(listState([summary('a', false, 'Refactor work'), summary('b', false)], 'b'))
    expect(shown).toHaveLength(1)
    expect(shown[0]!.payload).toEqual({ title: 'Refactor work', body: '任务已完成', tag: 'a' })
  })

  it('stays quiet for the selected session on a visible tab, toasts it when hidden', () => {
    const { list, shown } = bench({ enabled: true })
    list.set(listState([summary('a', true)], 'a'))
    list.set(listState([summary('a', false)], 'a'))
    expect(shown).toHaveLength(0)
    list.set(listState([summary('a', true)], 'a'))
    list.set(listState([summary('a', false)], 'a'))
    expect(shown).toHaveLength(0)

    const hidden = bench({ enabled: true, hidden: true })
    hidden.list.set(listState([summary('a', true)], 'a'))
    hidden.list.set(listState([summary('a', false)], 'a'))
    expect(hidden.shown).toHaveLength(1)
  })

  it('never fires while the preference is off, and stops with the disposer', () => {
    const { list, shown, stop } = bench({ enabled: false })
    list.set(listState([summary('a', true)], 'b'))
    list.set(listState([summary('a', false)], 'b'))
    expect(shown).toHaveLength(0)

    stop()
    list.set(listState([summary('a', true)], 'b'))
    list.set(listState([summary('a', false)], 'b'))
    expect(shown).toHaveLength(0)
  })

  it('tolerates a missing notify port (browsers without the API)', () => {
    const { list } = bench({ enabled: true, notify: undefined })
    list.set(listState([summary('a', true)], 'b'))
    expect(() => { list.set(listState([summary('a', false)], 'b')) }).not.toThrow()
  })

  it('click-through focuses the window and selects the session', () => {
    const { list, shown, open, focusWindow } = bench({ enabled: true })
    list.set(listState([summary('a', true)], 'b'))
    list.set(listState([summary('a', false)], 'b'))
    shown[0]!.onClick()
    expect(focusWindow).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith('a')
  })
})

describe('browserNotifyPort', () => {
  it('is absent without the Notification API (node specs run there)', () => {
    expect(browserNotifyPort()).toBeUndefined()
  })
})
