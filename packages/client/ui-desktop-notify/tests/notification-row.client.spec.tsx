// @vitest-environment jsdom
/**
 * The General settings row against props-direct fakes: the permission matrix
 * (granted / default / denied / unsupported) drives the toggle behavior and
 * the hint copy.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import {
  NotificationRow,
  type NotificationRowInjected,
  type NotificationRowProps,
} from '../src/client/NotificationRow.tsx'
import {
  browserNotifyPort,
  documentHidden,
  focusWindow,
  notificationPermission,
  requestNotificationPermission,
  type PermissionState,
} from '../src/client/desktop-notify.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const t = makeTranslate(zh)

/** The framework's synthesized hook over one store (selector form; reading a
 * stable store needs no React state, so a plain function satisfies the call). */
function hookOf<T>(store: SnapshotStore<T>) {
  return function select<S>(select: (value: T) => S): S {
    return select(store.getSnapshot())
  }
}

/** Row props over fresh stores; the setEnabled spy is exposed for assertions. */
function rowProps(opts: {
  enabled?: boolean
  editable?: boolean
  permission?: () => PermissionState
  request?: () => Promise<NotificationPermission> | undefined
}): NotificationRowProps & Pick<NotificationRowInjected, 'setEnabled'> {
  const enabled = createSnapshotStore(opts.enabled ?? false)
  const editable = createSnapshotStore(opts.editable ?? true)
  const setEnabled = vi.fn()
  return {
    useEnabled: hookOf(enabled),
    useEditable: hookOf(editable),
    setEnabled,
    permission: opts.permission ?? (() => 'granted'),
    requestPermission: opts.request ?? (() => Promise.resolve('granted')),
    t,
  } as unknown as NotificationRowProps & Pick<NotificationRowInjected, 'setEnabled'>
}

/** Microtask flush so a requestPermission continuation has run. */
async function flush(): Promise<void> {
  await new Promise<void>((resolve) => { queueMicrotask(resolve) })
  await new Promise<void>((resolve) => { queueMicrotask(resolve) })
}

describe('NotificationRow', () => {
  it('turns on immediately when permission is already granted', () => {
    const props = rowProps({})
    render(<NotificationRow {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.rowTitle }))
    expect(props.setEnabled).toHaveBeenCalledTimes(1)
    expect(props.setEnabled).toHaveBeenCalledWith(true)
  })

  it('turns off when already enabled', () => {
    const props = rowProps({ enabled: true })
    render(<NotificationRow {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.rowTitle }))
    expect(props.setEnabled).toHaveBeenCalledTimes(1)
    expect(props.setEnabled).toHaveBeenCalledWith(false)
  })

  it('asks the browser first when permission is default, and persists only on granted', async () => {
    const request = vi.fn((): Promise<NotificationPermission> => Promise.resolve('granted'))
    const props = rowProps({ permission: () => 'default', request })
    render(<NotificationRow {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.rowTitle }))
    expect(request).toHaveBeenCalledOnce()
    expect(props.setEnabled).not.toHaveBeenCalled()
    await flush()
    expect(props.setEnabled).toHaveBeenCalledTimes(1)
    expect(props.setEnabled).toHaveBeenCalledWith(true)
  })

  it('stays off when the browser prompt is denied', async () => {
    const request = vi.fn((): Promise<NotificationPermission> => Promise.resolve('denied'))
    const props = rowProps({ permission: () => 'default', request })
    render(<NotificationRow {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.rowTitle }))
    await flush()
    expect(props.setEnabled).not.toHaveBeenCalled()
  })

  it('shows the re-enable hint and never requests when permission is denied', () => {
    const request = vi.fn()
    const props = rowProps({ permission: () => 'denied', request })
    render(<NotificationRow {...props} />)
    expect(screen.getByText(zh.permissionDenied)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: zh.rowTitle }))
    expect(request).not.toHaveBeenCalled()
    expect(props.setEnabled).not.toHaveBeenCalled()
  })

  it('shows the unsupported hint without the API', () => {
    const props = rowProps({ permission: () => 'unsupported' })
    render(<NotificationRow {...props} />)
    expect(screen.getByText(zh.unsupported)).toBeDefined()
  })

  it('is inert while the scope is not writable', () => {
    const props = rowProps({ editable: false })
    render(<NotificationRow {...props} />)
    const button = screen.getByRole('button', { name: zh.rowTitle }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(props.setEnabled).not.toHaveBeenCalled()
  })

  it('survives a default permission whose request face is missing', async () => {
    const props = rowProps({ permission: () => 'default', request: () => undefined })
    render(<NotificationRow {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.rowTitle }))
    await flush()
    expect(props.setEnabled).not.toHaveBeenCalled()
  })
})

/** The Web Notification seam against a stubbed global (jsdom ships none). */
class StubNotification {
  static permission: NotificationPermission = 'granted'
  static readonly requestPermission = vi.fn(async () => 'granted')
  static readonly instances: StubNotification[] = []
  onclick: (() => void) | null = null
  constructor(
    public readonly title: string,
    public readonly options?: { body?: string; tag?: string },
  ) {
    StubNotification.instances.push(this)
  }
}

describe('browserNotifyPort', () => {
  it('shows a granted notification and wires its click-through', () => {
    vi.stubGlobal('Notification', StubNotification)
    const port = browserNotifyPort()
    expect(port).toBeDefined()
    const clicks: number[] = []
    expect(port!.show({ title: 't', body: 'b', tag: 'g' }, () => { clicks.push(1) })).toBe(true)
    StubNotification.instances.at(-1)!.onclick!()
    expect(clicks).toEqual([1])
  })

  it('re-checks permission at show time: a later denial shows nothing', () => {
    vi.stubGlobal('Notification', StubNotification)
    StubNotification.permission = 'denied'
    const port = browserNotifyPort()
    expect(port!.show({ title: 't', body: 'b', tag: 'g' }, () => {})).toBe(false)
    StubNotification.permission = 'granted'
  })

  it('drops a toast whose constructor throws instead of breaking the watcher', () => {
    vi.stubGlobal('Notification', class {
      static permission: NotificationPermission = 'granted'
      constructor() { throw new Error('unsupported options shape') }
    })
    const port = browserNotifyPort()
    expect(port!.show({ title: 't', body: 'b', tag: 'g' }, () => {})).toBe(false)
  })
})

describe('permission readers', () => {
  it('read and request through the global when present', async () => {
    vi.stubGlobal('Notification', StubNotification)
    expect(notificationPermission()).toBe('granted')
    await expect(requestNotificationPermission()).resolves.toBe('granted')
  })

  it('report unsupported without the global', () => {
    expect(notificationPermission()).toBe('unsupported')
    expect(requestNotificationPermission()).toBeUndefined()
  })
})

describe('browser inputs', () => {
  it('reads the document visibility flag', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    expect(documentHidden()).toBe(true)
  })

  it('focuses the window on activation', () => {
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {})
    focusWindow()
    expect(focus).toHaveBeenCalledOnce()
  })
})
