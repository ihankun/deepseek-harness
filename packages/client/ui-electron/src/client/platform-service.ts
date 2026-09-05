/**
 * Platform detection service for Electron-specific UI adaptations.
 * Provides platform information without requiring direct window.dshWindow access.
 */

/** A live snapshot of the auto-update state machine, mirrored from the main process. */
export interface UpdaterState {
  /** Whether this build can auto-update at all. */
  supported: boolean
  /** The current state-machine phase. */
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
  /** The version that will be (or was) installed. */
  version: string | null
  /** The release name from GitHub, or null. */
  releaseName: string | null
  /** The release notes (markdown), or null. */
  releaseNotes: string | null
  /** Live download progress while `downloading`. */
  progress: { percent: number; transferred: number; total: number } | null
  /** The last failure message while `error`. */
  error: string | null
}

/** The preload bridge the Electron main process installs on `window`. */
export interface DshWindowBridge {
  platform: string
  minimize(): void
  toggleMaximize(): void
  close(): void
  /** The current auto-update state, or null when unsupported. */
  updaterState(): Promise<UpdaterState | null>
  /** Ask the main process to check for updates. Resolves true when accepted. */
  updaterCheck(): Promise<boolean>
  /** Approve and start downloading the available update. Resolves true when accepted. */
  updaterDownload(): Promise<boolean>
  /** Quit and install the downloaded update. Resolves true when accepted. */
  updaterInstall(): Promise<boolean>
  /** Subscribe to auto-update state changes pushed from the main process. */
  onUpdaterStateChange(listener: (state: UpdaterState) => void): void
  /** The app's version string (e.g. 0.1.1), or null when the sender is invalid. */
  version(): Promise<string | null>
}

declare global {
  interface Window {
    /** The desktop shell's preload bridge, present only inside the Electron shell. */
    dshWindow?: DshWindowBridge
  }
}

/** Read the live preload bridge; undefined outside the desktop shell. */
export function readDshWindowBridge(): DshWindowBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return window.dshWindow
}

export interface PlatformService {
  /** Whether the app is running in Electron shell. */
  readonly isElectron: boolean
  /** Whether the app is running on macOS. */
  readonly isMac: boolean
  /** Whether the app is running on Windows. */
  readonly isWindows: boolean
  /** Whether the app should reserve space for macOS traffic lights. */
  readonly reserveTrafficLights: boolean
}

/** Default platform detection implementation. */
export class DefaultPlatformService implements PlatformService {
  readonly isElectron: boolean
  readonly isMac: boolean
  readonly isWindows: boolean
  readonly reserveTrafficLights: boolean

  constructor() {
    if (typeof window === 'undefined' || window.dshWindow === undefined) {
      this.isElectron = false
      this.isMac = false
      this.isWindows = false
      this.reserveTrafficLights = false
    } else {
      this.isElectron = true
      this.isMac = window.dshWindow.platform === 'darwin'
      this.isWindows = window.dshWindow.platform === 'win32'
      this.reserveTrafficLights = this.isMac
    }
  }
}
