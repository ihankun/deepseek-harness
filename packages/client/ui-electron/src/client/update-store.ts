/**
 * Auto-update state bridge for the desktop shell.
 *
 * Mirrors the main-process updater state machine into React via
 * useSyncExternalStore: the initial snapshot comes from the preload bridge,
 * and every pushed `dsh-updater-state` event updates it. All mutations
 * (check / download / install) forward to the main process. One instance is
 * created per plugin activation in `apply` and handed to the entry component
 * through the registration's inject face.
 * @module @deepseek-ai/dsh-client-ui-electron/update-store
 */

import { useSyncExternalStore } from 'react'
import type { DshWindowBridge, UpdaterState } from './platform-service.ts'

/** The default state before any main-process contact. */
const IDLE_STATE: UpdaterState = {
  supported: false,
  status: 'idle',
  version: null,
  releaseName: null,
  releaseNotes: null,
  progress: null,
  error: null,
}

/** A renderer-side mirror of the main-process updater. */
export class UpdateStore {
  private state: UpdaterState = IDLE_STATE
  private readonly listeners = new Set<() => void>()

  /**
   * Bind the store to the shell's preload bridge.
   * @param api - the desktop shell's preload bridge, undefined in a plain browser.
   */
  constructor(private readonly api: DshWindowBridge | undefined) {
    api?.onUpdaterStateChange((state) => { this.apply(state) })
    void api?.updaterState().then((state) => {
      if (state !== null) this.apply(state)
    }).catch(() => undefined)
  }

  /** Replace the state snapshot and notify subscribers. */
  private apply(state: UpdaterState): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }

  /** Subscribe to state changes; returns the unsubscribe function. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** The current state snapshot. */
  getSnapshot = (): UpdaterState => this.state

  /** Ask the main process to check for updates. */
  check(): void {
    void this.api?.updaterCheck()
  }

  /** Approve and start downloading the available update. */
  download(): void {
    void this.api?.updaterDownload()
  }

  /** Quit and install the downloaded update. */
  install(): void {
    void this.api?.updaterInstall()
  }
}

/** The inject face the update entry receives. */
export interface UpdateEntryInjected {
  /** The live updater state mirror. */
  store: UpdateStore
}

/** Subscribe to the store's state via the standard selector hook shape. */
export function useUpdaterStore(store: UpdateStore): UpdaterState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

/** True when the updater is between available and downloaded (actionable). */
export function hasActionableUpdate(state: UpdaterState): boolean {
  return state.status === 'available' || state.status === 'downloading' || state.status === 'downloaded'
}

/** True when the downloaded update is ready to install. */
export function readyToInstall(state: UpdaterState): boolean {
  return state.status === 'downloaded'
}
