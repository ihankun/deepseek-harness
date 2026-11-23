/** Resolve the update channel sealed into the installed application manifest. */
import type { DesktopUpdatePreferences } from './settings-file.ts'

/** Installer-owned channel, independent of release version and upload environment. */
export type DesktopUpdateChannel = DesktopUpdatePreferences['channel']

/** Feed file the packaged updater requests; `latest` follows the newest GitHub Release. */
export type DesktopUpdateFeedChannel = DesktopUpdateChannel | 'latest'

/**
 * Read the packaged channel; older manifests retain their existing nightly behavior.
 * @param manifest Parsed application manifest.
 * @returns Validated channel. Invalid explicit values reject instead of changing feeds.
 */
export function desktopUpdateChannel(manifest: unknown): DesktopUpdateChannel {
  if (typeof manifest !== 'object' || manifest === null) throw new Error('desktop update: invalid application manifest')
  if (!('dshDesktopUpdateChannel' in manifest)) return 'nightly'
  const channel = manifest.dshDesktopUpdateChannel
  if (channel !== 'nightly' && channel !== 'stable') throw new Error('desktop update: invalid packaged channel')
  return channel
}

/**
 * Read the feed file the updater requests. Manifests without the field keep using
 * the selected distribution channel, so older packages and update fixtures retain
 * their existing feeds.
 * @param manifest Parsed application manifest.
 * @param channel Installer-owned distribution channel used as the fallback.
 * @returns Validated feed channel.
 */
export function desktopUpdateFeedChannel(manifest: unknown, channel: DesktopUpdateChannel): DesktopUpdateFeedChannel {
  if (typeof manifest !== 'object' || manifest === null) throw new Error('desktop update: invalid application manifest')
  if (!('dshDesktopUpdateFeedChannel' in manifest)) return channel
  const feedChannel = manifest.dshDesktopUpdateFeedChannel
  if (feedChannel !== 'latest' && feedChannel !== 'nightly' && feedChannel !== 'stable') {
    throw new Error('desktop update: invalid packaged feed channel')
  }
  return feedChannel
}
