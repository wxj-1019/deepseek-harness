/**
 * Continuous learning watcher: chokidar over the checkout's
 * `packages/client` tree with a 200 ms stability threshold. Only `.tsx` and
 * `*.module.css` events matter; a settled CSS module re-learns its sibling
 * component file because the token references live there.
 * @module @deepseek-ai/dsh-component-library/src/watcher
 */

import { join } from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import { CLIENT_TREE } from './scanner.ts'

/** Default awaitWriteFinish stability threshold, matching the skill watcher. */
export const WATCH_STABILITY_THRESHOLD_MS = 200

/** Default awaitWriteFinish poll interval, matching the skill watcher. */
export const WATCH_POLL_INTERVAL_MS = 100

/** Watch-root depth: packages/client/<pkg>/src/client/<nested dirs>/<file>. */
const WATCH_DEPTH = 6

/** Sink for one human-readable watcher log line. */
export type WatchLog = (line: string) => void

/** Callbacks the watcher raises on settled filesystem events. */
export interface ComponentLibraryWatchEvents {
  /** One `.tsx` file (or its CSS module) settled and should be re-learned. */
  readonly onFileSettled: (file: string) => void
  /** One `.tsx` file disappeared; its records should be dropped. */
  readonly onFileRemoved: (file: string) => void
}

/** True for the only two file kinds the pipeline learns from. */
function isRelevant(file: string): boolean {
  return file.endsWith('.tsx') || file.endsWith('.module.css')
}

/** Map one changed path to the `.tsx` file whose records it feeds. */
function sourceFileOf(file: string): string {
  return file.endsWith('.module.css') ? file.replace(/\.module\.css$/, '.tsx') : file
}

/**
 * Chokidar watcher over the client tree. Construction is cheap; `start`
 * opens the watcher and resolves on chokidar's ready event, `dispose` closes
 * it exactly once.
 */
export class ComponentLibraryWatcher {
  private watcher: FSWatcher | undefined
  private opening: Promise<void> | undefined

  /**
   * @param root - checkout root containing {@link CLIENT_TREE}.
   * @param events - settled-event callbacks.
   * @param log - watcher warning sink.
   */
  constructor(
    private readonly root: string,
    private readonly events: ComponentLibraryWatchEvents,
    private readonly log: WatchLog,
  ) {}

  /** Open the watcher; resolves once chokidar reports ready. */
  async start(): Promise<void> {
    if (this.opening !== undefined) return this.opening
    const watcher = chokidar.watch(join(this.root, CLIENT_TREE), {
      persistent: true,
      ignoreInitial: true,
      depth: WATCH_DEPTH,
      followSymlinks: false,
      atomic: true,
      awaitWriteFinish: {
        stabilityThreshold: WATCH_STABILITY_THRESHOLD_MS,
        pollInterval: WATCH_POLL_INTERVAL_MS,
      },
      ignored: /node_modules/,
    })
    this.watcher = watcher
    this.opening = new Promise<void>((resolve, reject) => {
      watcher.on('ready', () => {
        resolve()
      })
      watcher.on('error', (error) => {
        this.log(`component-library: watcher error: ${String(error)}`)
        if (this.opening !== undefined) reject(error instanceof Error ? error : new Error(String(error)))
      })
    })
    watcher.on('add', (file) => { this.settled(file) })
    watcher.on('change', (file) => { this.settled(file) })
    watcher.on('unlink', (file) => { this.removed(file) })
    // A disposed-then-ready race rejects nobody; the close simply wins.
    this.opening.catch(() => {})
    await this.opening
  }

  /** Close the watcher; safe to call more than once. */
  async dispose(): Promise<void> {
    const watcher = this.watcher
    this.watcher = undefined
    this.opening = undefined
    await watcher?.close()
  }

  /** Raise the settled callback for one relevant path. */
  private settled(file: string): void {
    if (!isRelevant(file)) return
    this.events.onFileSettled(sourceFileOf(file))
  }

  /** Raise the removal callback for one relevant path. */
  private removed(file: string): void {
    if (!isRelevant(file)) return
    if (file.endsWith('.module.css')) {
      // Token references changed; re-learn the sibling component file.
      this.events.onFileSettled(sourceFileOf(file))
      return
    }
    this.events.onFileRemoved(file)
  }
}
