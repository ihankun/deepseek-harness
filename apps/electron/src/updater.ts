/**
 * Auto-update for the desktop shell.
 *
 * Windows uses electron-updater against the GitHub NSIS feed (latest.yml);
 * macOS is fully hand-written: the latest GitHub release is queried, the
 * matching-arch zip is downloaded with SHA-256 verification, and a detached
 * shell script replaces the running `.app` and relaunches it. Only packaged
 * NSIS / `.app` builds support updates; development and portable runs report
 * `supported: false`.
 * @module @deepseek-ai/dsh-electron-app/updater
 */

import { app, net } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pkg from 'electron-updater'
import type { UpdateInfo } from 'electron-updater'
import { MAC_ARTIFACT_PREFIX, macAssetNamePattern } from './mac-update-asset.ts'

const { autoUpdater } = pkg

/**
 * The app's own version, read from this app's package.json. `app.getVersion()`
 * reports the Electron version in dev (unpackaged) runs, so the product version
 * must come from the manifest itself.
 */
const APP_VERSION = readAppVersion()

/** Read the version from this app's package.json, falling back to Electron's. */
function readAppVersion(): string {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
    const manifest = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown }
    return typeof manifest.version === 'string' && manifest.version.length > 0
      ? manifest.version
      : app.getVersion()
  } catch {
    return app.getVersion()
  }
}

/** Minimum interval between update checks (debounces UI-triggered checks). */
const MIN_CHECK_INTERVAL_MS = 10_000
/** The GitHub repo the app ships from; the update source of record. */
const GITHUB_REPO = 'ihankun/deepseek-harness'
/** The GitHub releases API endpoint this app checks against. */
const RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
/** The macOS update package cache directory under userData. */
const MAC_UPDATE_CACHE_DIR = 'update-cache'
/** Persisted user-approved download version (resumes after a restart). */
const UPDATE_APPROVAL_FILE = 'update-download-approval.json'
/** HTTP User-Agent sent to GitHub API and asset requests. */
const USER_AGENT = 'DeepSeek-Harness'

/** A live snapshot of the update state machine, shared with the renderer. */
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

/** The updater's public face, exposed to IPC. */
export interface AutoUpdaterHandle {
  state(): UpdaterState
  check(): Promise<void>
  download(): Promise<void>
  install(): void
}

/** A GitHub release asset as returned by the releases API. */
interface GitHubAsset {
  name: string
  size: number
  digest: string | null
  browserDownloadUrl: string
}

/** A parsed latest GitHub release. */
interface GitHubRelease {
  tagName: string
  name: string | null
  body: string | null
  assets: GitHubAsset[]
}

/** A macOS update resolved from the latest release. */
interface MacUpdate {
  version: string
  releaseName: string | null
  releaseNotes: string | null
  assetUrl: string
  assetSize: number
  assetDigest: string | null
  downloadPath: string | null
}

/**
 * Create the auto-update controller, emitting every state transition to the
 * provided callback (which broadcasts to the renderer).
 * @param emit - called with each new state snapshot.
 * @returns the updater handle.
 */
export function createAutoUpdater(emit: (state: UpdaterState) => void): AutoUpdaterHandle {
  // Windows NSIS installers and macOS .app bundles update in place; portable
  // and development builds report unsupported so the UI hides the entry.
  const isWindows = process.platform === 'win32'
  const supported = app.isPackaged && (isWindows || process.platform === 'darwin') && !process.env.PORTABLE_EXECUTABLE_DIR
  let state: UpdaterState = {
    supported,
    status: 'idle',
    version: null,
    releaseName: null,
    releaseNotes: null,
    progress: null,
    error: null,
  }
  let checking = false
  let lastCheckAt = 0
  let macUpdate: MacUpdate | null = null
  let approvedVersion: string | null = null

  const setState = (patch: Partial<UpdaterState>): void => {
    state = { ...state, ...patch }
    emit(state)
  }

  const startDownload = async (): Promise<void> => {
    if (isWindows) {
      await autoUpdater.downloadUpdate()
      return
    }
    if (!macUpdate) return
    const downloadPath = await downloadMacUpdate(macUpdate, setState)
    macUpdate = { ...macUpdate, downloadPath }
    setState({
      status: 'downloaded',
      version: macUpdate.version,
      releaseName: macUpdate.releaseName,
      releaseNotes: macUpdate.releaseNotes,
      progress: null,
      error: null,
    })
  }

  if (supported && isWindows) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('checking-for-update', () => { setState({ status: 'checking', error: null }) })
    autoUpdater.on('update-available', (info) => {
      setState({
        status: 'available',
        version: info.version,
        releaseName: info.releaseName ?? null,
        releaseNotes: extractReleaseNotes(info),
        error: null,
      })
      if (approvedVersion && normalizeVersion(approvedVersion) === normalizeVersion(info.version)) {
        void autoUpdater.downloadUpdate().catch((error: unknown) => {
          setState({ status: 'error', error: error instanceof Error ? error.message : String(error) })
        })
      }
    })
    autoUpdater.on('update-not-available', () => { setState({ status: 'not-available', error: null }) })
    autoUpdater.on('download-progress', (progress) => {
      setState({
        status: 'downloading',
        progress: { percent: progress.percent, transferred: progress.transferred, total: progress.total },
      })
    })
    autoUpdater.on('update-downloaded', (info) => {
      setState({
        status: 'downloaded',
        version: info.version,
        releaseName: info.releaseName ?? null,
        releaseNotes: extractReleaseNotes(info),
        progress: null,
        error: null,
      })
    })
    autoUpdater.on('error', (error) => { setState({ status: 'error', error: error instanceof Error ? error.message : String(error) }) })
  }

  const checkMac = async (): Promise<void> => {
    const update = await checkForMacUpdate(setState)
    if (!update) return
    macUpdate = update
    if (approvedVersion && normalizeVersion(approvedVersion) === normalizeVersion(update.version)) {
      await startDownload()
    }
  }

  return {
    state: () => state,
    check: async () => {
      if (!supported || checking) return
      const now = Date.now()
      if (now - lastCheckAt < MIN_CHECK_INTERVAL_MS) return
      lastCheckAt = now
      checking = true
      try {
        approvedVersion = await loadApprovedVersion()
        if (isWindows) await autoUpdater.checkForUpdates()
        else await checkMac()
      } catch (error) {
        setState({ status: 'error', error: error instanceof Error ? error.message : String(error) })
      } finally {
        checking = false
      }
    },
    download: async () => {
      if (!supported || checking) return
      const version = state.version
      if (!version) return
      try {
        approvedVersion = version
        await saveApprovedVersion(version)
        await startDownload()
      } catch (error) {
        setState({ status: 'error', error: error instanceof Error ? error.message : String(error) })
      }
    },
    install: () => {
      if (state.status !== 'downloaded') return
      if (isWindows) {
        autoUpdater.quitAndInstall()
        return
      }
      installMacUpdate(macUpdate)
    },
  }
}

/** Load the user-approved download version, or null. */
async function loadApprovedVersion(): Promise<string | null> {
  try {
    const file = join(app.getPath('userData'), UPDATE_APPROVAL_FILE)
    const content = await readFile(file, 'utf8')
    const parsed: unknown = JSON.parse(content)
    const version = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).approvedVersion : null
    return typeof version === 'string' && version ? version : null
  } catch {
    // Missing or corrupt approval file; treat as no approval.
    return null
  }
}

/** Persist the user-approved download version. */
async function saveApprovedVersion(version: string): Promise<void> {
  const file = join(app.getPath('userData'), UPDATE_APPROVAL_FILE)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ approvedVersion: version }, null, 2) + '\n', { mode: 0o600 })
}

/** Strip a `v` prefix and any prerelease suffix for comparison. */
function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '').replace(/-.+$/, '')
}

/** Compare dotted numeric versions; returns <0, 0, or >0. */
function compareVersions(a: string, b: string): number {
  const toParts = (value: string): number[] =>
    normalizeVersion(value).split('.').map(part => Number.parseInt(part, 10) || 0)
  const left = toParts(a)
  const right = toParts(b)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** The arch label used in the release asset name. */
function currentArch(): string {
  return process.arch === 'arm64' ? 'arm64' : 'x64'
}

/** Parse a GitHub release payload into the internal shape. */
function parseGitHubRelease(payload: unknown): GitHubRelease {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid release payload')
  const value = payload as Record<string, unknown>
  const tagName = typeof value.tag_name === 'string' ? value.tag_name : ''
  if (!tagName) throw new Error('Missing release tag')
  const assets: GitHubAsset[] = []
  if (Array.isArray(value.assets)) {
    for (const item of value.assets) {
      if (!item || typeof item !== 'object') continue
      const asset = item as Record<string, unknown>
      if (typeof asset.name !== 'string' || typeof asset.browser_download_url !== 'string') continue
      const digest = typeof asset.digest === 'string' ? asset.digest.replace(/^sha256:/, '') : null
      assets.push({
        name: asset.name,
        size: typeof asset.size === 'number' ? asset.size : 0,
        digest,
        browserDownloadUrl: asset.browser_download_url,
      })
    }
  }
  return {
    tagName,
    name: typeof value.name === 'string' ? value.name : null,
    body: typeof value.body === 'string' ? value.body : null,
    assets,
  }
}

/** Fetch the latest GitHub release. */
async function fetchLatestRelease(): Promise<GitHubRelease> {
  const response = await net.fetch(RELEASES_API_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return parseGitHubRelease(await response.json())
}

/** Resolve and publish a macOS update, or null when already current. */
async function checkForMacUpdate(setState: (patch: Partial<UpdaterState>) => void): Promise<MacUpdate | null> {
  setState({ status: 'checking', error: null })
  const release = await fetchLatestRelease()
  const arch = currentArch()
  const asset = release.assets.find(item => macAssetNamePattern(arch).test(item.name))
  if (!asset) throw new Error(`Update package for ${arch} not found`)
  const version = normalizeVersion(release.tagName)
  if (compareVersions(version, APP_VERSION) <= 0) {
    setState({ status: 'not-available', error: null })
    return null
  }
  const update: MacUpdate = {
    version,
    releaseName: release.name,
    releaseNotes: release.body,
    assetUrl: asset.browserDownloadUrl,
    assetSize: asset.size,
    assetDigest: asset.digest,
    downloadPath: null,
  }
  setState({
    status: 'available',
    version,
    releaseName: update.releaseName,
    releaseNotes: update.releaseNotes,
    error: null,
  })
  return update
}

/** The macOS update cache directory. */
function macUpdateDir(): string {
  return join(app.getPath('userData'), MAC_UPDATE_CACHE_DIR)
}

/** SHA-256 hex digest of a file. */
function sha256OfFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => { hash.update(chunk) })
    stream.on('end', () => { resolve(hash.digest('hex')) })
  })
}

/** True when an on-disk file matches the expected size and digest. */
async function fileMatchesDigest(filePath: string, digest: string | null, size: number): Promise<boolean> {
  if (statSync(filePath, { throwIfNoEntry: false })?.size !== size) return false
  if (!digest) return true
  return (await sha256OfFile(filePath)) === digest
}

/** Download the macOS update zip with streamed progress and SHA-256 verification. */
async function downloadMacUpdate(update: MacUpdate, setState: (patch: Partial<UpdaterState>) => void): Promise<string> {
  const destPath = join(macUpdateDir(), `${MAC_ARTIFACT_PREFIX}-${update.version}-${currentArch()}.zip`)
  if (await fileMatchesDigest(destPath, update.assetDigest, update.assetSize)) return destPath
  mkdirSync(macUpdateDir(), { recursive: true })
  setState({ status: 'downloading', progress: { percent: 0, transferred: 0, total: update.assetSize } })
  const response = await net.fetch(update.assetUrl, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
  let transferred = 0
  const reader = response.body.getReader()
  const file = createWriteStream(destPath)
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      transferred += value.byteLength
      file.write(value)
      setState({
        status: 'downloading',
        progress: { percent: Math.min(100, (transferred / update.assetSize) * 100), transferred, total: update.assetSize },
      })
    }
    await new Promise<void>((resolve, reject) => file.end((error: Error | null) => {
      if (error !== null) reject(error)
      else resolve()
    }))
    if (!(await fileMatchesDigest(destPath, update.assetDigest, update.assetSize))) {
      throw new Error('Downloaded file failed SHA-256 verification')
    }
  } catch (error) {
    file.destroy()
    rmSync(destPath, { force: true })
    throw error
  }
  return destPath
}

/** Quote a value for use inside a single-quoted shell string. */
function shQuote(value: string): string {
  return `'${value.replace(/'/g, '\'\\\'\'')}'`
}

/** Install the macOS update: a detached script swaps the .app and relaunches. */
function installMacUpdate(update: MacUpdate | null): void {
  if (!update?.downloadPath) return
  const appDir = resolve(dirname(app.getPath('exe')), '..', '..')
  const bundleName = basename(appDir)
  const extractDir = join(macUpdateDir(), 'extract')
  const scriptPath = join(macUpdateDir(), 'install.sh')
  const script = [
    '#!/bin/sh',
    'sleep 3',
    `APP_DIR=${shQuote(appDir)}`,
    `ZIP_PATH=${shQuote(update.downloadPath)}`,
    `EXTRACT_DIR=${shQuote(extractDir)}`,
    `BUNDLE_NAME=${shQuote(bundleName)}`,
    'rm -rf "$EXTRACT_DIR"',
    'mkdir -p "$EXTRACT_DIR"',
    'if ! ditto -xk "$ZIP_PATH" "$EXTRACT_DIR"; then exit 1; fi',
    'NEW_APP="$EXTRACT_DIR/$BUNDLE_NAME"',
    'if [ ! -d "$NEW_APP" ]; then exit 1; fi',
    'if [ -d "$APP_DIR" ]; then rm -rf "$APP_DIR.bak"; mv "$APP_DIR" "$APP_DIR.bak"; fi',
    'if ! mv "$NEW_APP" "$APP_DIR"; then',
    '  if [ -d "$APP_DIR.bak" ]; then mv "$APP_DIR.bak" "$APP_DIR"; fi',
    '  exit 1',
    'fi',
    'rm -rf "$APP_DIR.bak"',
    'xattr -dr com.apple.quarantine "$APP_DIR" 2>/dev/null || true',
    'open "$APP_DIR"',
  ].join('\n')
  writeFileSync(scriptPath, script, { mode: 0o755 })
  const child = spawn('/bin/sh', [scriptPath], { detached: true, stdio: 'ignore' })
  child.unref()
  app.quit()
}

/** Extract release notes from an electron-updater UpdateInfo. */
function extractReleaseNotes(info: UpdateInfo): string | null {
  const notes = info.releaseNotes
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    const note = notes.find(item => item.version === info.version) ?? notes[notes.length - 1]
    return note?.note ?? null
  }
  return null
}
