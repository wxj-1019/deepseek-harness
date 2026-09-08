/**
 * Shared browser-local mirror over a Host-owned Remote list. Panel
 * controllers (session pins, user todo, notification center, usage ledger,
 * component library) repeat the same lifecycle: a cold/loading/ready/error
 * snapshot store, a read-once `ensure`, a `resync` that keeps the last good
 * list on failure, and a verb wrapper that maps transport and business
 * failures to display text before converging from the Host. This module is
 * that skeleton; each package subclasses with its read and ready-apply steps.
 * @module @deepseek-ai/dsh-client-store/remote-mirror
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { createSnapshotStore, type SnapshotStore } from './index.ts'

/** Load state of the one list read that feeds a panel surface. */
export type MirrorStatus = 'cold' | 'loading' | 'ready' | 'error'

/** Common shape of every Host-mirrored panel state. */
export interface MirrorState {
  status: MirrorStatus
  /** Reason the last read failed, cleared by the next successful read. */
  error: string | null
}

/** Read-side business discriminant: a Host list call never rejects business-side. */
export type MirrorReadResult<ListValue> = { readonly ok: true; readonly value: ListValue }

/** Verb-side business discriminant shared by every Host mutation union. */
export type MirrorVerbResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: { readonly code: string } }

/**
 * Turn a rejected call into display text; transports reject with anything.
 * @param error - the rejection value.
 * @returns the message to show.
 */
export function mirrorErrorMessage(error: unknown): string {
  /* v8 ignore next -- transports reject with Errors; the String arm satisfies the unknown type */
  return error instanceof Error ? error.message : String(error)
}

/**
 * Base class for one-shared-controller-per-client panels over a Host-owned
 * list. Subclasses name the {@link MirrorState} extension, the Remote face,
 * and the list payload, then implement {@link read} and {@link applyReady}.
 * @template State - the package's published state; extends {@link MirrorState}.
 * @template RemoteFace - the package's generated Remote calls.
 * @template ListValue - the payload inside the list call's success value.
 */
export abstract class RemoteMirrorController<State extends MirrorState, RemoteFace, ListValue> {
  /** The snapshot the surfaces render from (uSES-safe store). */
  readonly store: SnapshotStore<State>

  /**
   * @param remote - the generated Remote face every verb is applied through.
   * @param initial - the cold-state snapshot the store is seeded with.
   */
  protected constructor(
    protected readonly remote: RemoteFace,
    initial: State,
  ) {
    this.store = createSnapshotStore<State>(initial)
  }

  /** @returns the current published state. */
  getSnapshot(): State {
    return this.store.getSnapshot()
  }

  /**
   * Subscribe to state revisions.
   * @param listener - called on every store update.
   * @returns the unsubscribe disposer.
   */
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener)
  }

  /** @returns whether the list has never been read. */
  get cold(): boolean {
    return this.getSnapshot().status === 'cold'
  }

  /**
   * Read the whole list once; a failure keeps the last good snapshot.
   * @returns resolution when the read settles.
   */
  async resync(): Promise<void> {
    // Only the first read advertises a loading state; later reads converge
    // silently so an open surface never flashes a spinner over data.
    const firstRead = this.cold
    if (firstRead) {
      this.store.update((state) => {
        state.status = 'loading'
        state.error = null
      })
    }
    try {
      const response = await this.read(this.remote)
      if (!response.ok) throw new Error(response.error.message)
      this.store.update((state) => {
        state.status = 'ready'
        this.applyReady(state, response.value.value)
        state.error = null
      })
    } catch (error) {
      this.store.update((state) => {
        state.status = 'error'
        state.error = mirrorErrorMessage(error)
      })
    }
  }

  /** Read-once entry for first render: `resync` unless already read. */
  ensure(): Promise<void> {
    if (!this.cold && this.getSnapshot().status !== 'error') return Promise.resolve()
    return this.resync()
  }

  /**
   * Run one mutation verb, then converge the mirror with the Host's
   * post-write state. Transport failures yield the transport message;
   * business rejections yield `code:<code>`; success yields undefined.
   * @param run - applies one verb through the Remote face.
   * @returns the failure message, or undefined once committed.
   */
  protected async mutate(
    run: (remote: RemoteFace) => Promise<RemoteResult<MirrorVerbResult>>,
  ): Promise<string | undefined> {
    try {
      const response = await run(this.remote)
      if (!response.ok) return response.error.message
      if (!response.value.ok) return `code:${response.value.error.code}`
    } catch (error) {
      return mirrorErrorMessage(error)
    }
    await this.resync()
    return undefined
  }

  /**
   * Issue the list read through the Remote face.
   * @param remote - the generated Remote face.
   * @returns the transport-wrapped list result.
   */
  protected abstract read(remote: RemoteFace): Promise<RemoteResult<MirrorReadResult<ListValue>>>

  /**
   * Fold one successful list payload into the draft state. Called inside the
   * ready update, before `error` is cleared.
   * @param state - the immer draft of the published state.
   * @param value - the list call's success payload.
   */
  protected abstract applyReady(state: State, value: ListValue): void
}
