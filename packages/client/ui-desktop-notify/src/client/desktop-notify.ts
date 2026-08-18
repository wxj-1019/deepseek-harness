/**
 * The desktop-notification runtime: a read replica of the enabled preference
 * plus the completion watcher over the session list. React-free — the plugin
 * owns one instance for the page's lifetime; the General settings row reads
 * the replica stores through the slot's hook synthesis, and {@link start}
 * wires both subscriptions (returned disposer = HMR-safe teardown).
 */

import {
  createSnapshotStore,
  type ObservableSnapshot,
  type SessionId,
  type SessionListState,
  type SettingsScope,
  type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { DesktopNotifySettings } from '../desktop-notify-settings.ts'
import { ENABLED_FIELD } from '../desktop-notify-settings.ts'
import { completedSince, runningOf, shouldNotify, type RunningMap } from './notifications.ts'

/** One notification the watcher asks the OS to show. */
export interface NotificationPayload {
  /** Notification title: the session's display title. */
  title: string
  /** Notification body: the localized completion line. */
  body: string
  /** Notification tag: the session id, so repeats replace instead of stack. */
  tag: string
}

/** The OS notification seam. Returns whether a notification actually went out. */
export interface NotifyPort {
  /** Show one notification; `onClick` fires when the user activates it. */
  show(payload: NotificationPayload, onClick: () => void): boolean
}

/** Current permission, with a sentinel for browsers without the API. */
export type PermissionState = NotificationPermission | 'unsupported'

/**
 * Read the browser permission state.
 * @returns the Notification permission, or 'unsupported' without the API.
 */
export function notificationPermission(): PermissionState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/**
 * Ask the browser for notification permission.
 * @returns the permission promise, or undefined when the API is absent.
 */
export function requestNotificationPermission(): Promise<NotificationPermission> | undefined {
  if (typeof Notification === 'undefined') return undefined
  return Notification.requestPermission()
}

/**
 * Read the document visibility (the watcher's hidden input).
 * @returns whether the document is hidden.
 */
export function documentHidden(): boolean {
  return document.hidden
}

/**
 * Focus the window (notification activation before the session jump).
 */
export function focusWindow(): void {
  window.focus()
}

/**
 * The Web Notification port: shows nothing unless permission is currently
 * granted — the user may revoke in browser settings at any time.
 * @returns the port, or undefined when the API is absent.
 */
export function browserNotifyPort(): NotifyPort | undefined {
  if (typeof Notification === 'undefined') return undefined
  return {
    show(payload, onClick) {
      if (Notification.permission !== 'granted') return false
      try {
        const toast = new Notification(payload.title, { body: payload.body, tag: payload.tag })
        toast.onclick = () => { onClick() }
        return true
      } catch {
        // The constructor rejects malformed options on some engines (e.g. an
        // options shape this spec predates); one dropped toast must never
        // break the watcher loop.
        return false
      }
    },
  }
}

/** The sessions face the runtime consumes (the ISessions slice it needs). */
export interface NotifySessionsFace {
  /** The session list snapshot feed. */
  list: ObservableSnapshot<SessionListState>
  /**
   * Select a session as current (notification click-through).
   * @param id - session id.
   */
  open(id: SessionId): void
}

/**
 * The completion-notification runtime.
 */
export class DesktopNotifyRuntime {
  /** Read replica of the durable enabled preference (optimistic on write). */
  readonly enabled: SnapshotStore<boolean>
  /** Whether the preference row may write (scope ready and writable). */
  readonly editable: SnapshotStore<boolean>
  private prev: RunningMap | undefined

  private readonly sessions: NotifySessionsFace
  private readonly scope: SettingsScope<DesktopNotifySettings>
  private readonly notify: NotifyPort | undefined
  private readonly bodyText: () => string
  private readonly isHidden: () => boolean
  private readonly focusWindow: () => void

  constructor(deps: {
    sessions: NotifySessionsFace
    scope: SettingsScope<DesktopNotifySettings>
    notify: NotifyPort | undefined
    bodyText: () => string
    isHidden: () => boolean
    focusWindow: () => void
  }) {
    this.sessions = deps.sessions
    this.scope = deps.scope
    this.notify = deps.notify
    this.bodyText = deps.bodyText
    this.isHidden = deps.isHidden
    this.focusWindow = deps.focusWindow
    this.enabled = createSnapshotStore(false)
    this.editable = createSnapshotStore(false)
  }

  /**
   * Flip the durable opt-in. The replica turns immediately; the scope's
   * conflict recovery republishes the authoritative value after a failed
   * write, so no explicit revert exists here.
   * @param next - the desired enabled value.
   */
  setEnabled(next: boolean): void {
    this.enabled.set(next)
    void this.scope.set(ENABLED_FIELD, next).catch(() => {
      // The scope's recovery read republishes the host value into the replica.
    })
  }

  /**
   * Wire both subscriptions and pull once.
   * @returns the disposer that stops the watcher.
   */
  start(): () => void {
    const stopScope = this.scope.subscribe(() => { this.syncScope() })
    const stopList = this.sessions.list.subscribe(() => { this.onList() })
    this.syncScope()
    this.onList()
    return () => {
      stopScope()
      stopList()
    }
  }

  /** Adopt the scope snapshot into the replica stores. */
  private syncScope(): void {
    const snapshot = this.scope.getSnapshot()
    this.enabled.set(snapshot.value?.enabled ?? false)
    this.editable.set(snapshot.status === 'ready' && snapshot.writable)
  }

  /** Diff the list snapshot: first sight seeds, later completions may toast. */
  private onList(): void {
    const state = this.sessions.list.getSnapshot()
    if (this.prev === undefined) {
      this.prev = runningOf(state)
      return
    }
    const done = completedSince(this.prev, state)
    this.prev = runningOf(state)
    if (!this.enabled.getSnapshot() || this.notify === undefined) return
    for (const id of done) {
      const summary = state.byId[id]
      if (!shouldNotify(id, state.current, this.isHidden())) continue
      this.notify.show(
        { title: summary.displayTitle, body: this.bodyText(), tag: id },
        () => {
          this.focusWindow()
          this.sessions.open(id)
        },
      )
    }
  }
}
