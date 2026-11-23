/** Channel policy applied after electron-updater's channel setter. */
import type { AppUpdater } from 'electron-updater'
import type { DesktopUpdateFeedChannel } from '../../update-channel.ts'

/**
 * Select the packaged feed file, accepting prereleases while preventing downgrades.
 * @param updater - Updater whose prior operations have settled.
 * @param channel - Feed file the updater requests.
 */
export function selectUpdateChannel(updater: AppUpdater, channel: DesktopUpdateFeedChannel): void {
  updater.channel = channel
  // The library channel setter enables downgrades.
  updater.allowDowngrade = false
  updater.allowPrerelease = true
}
