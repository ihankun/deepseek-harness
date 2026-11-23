/** GitHub Releases update source resolved for one packaging environment. */
export interface DesktopGitHubUpdateConfig {
  readonly provider: 'github'
  readonly owner: string
  readonly repo: string
  readonly channel: 'latest'
}

/**
 * Resolve the one GitHub Releases feed packaged applications check for updates.
 * The configured channel is always `latest`: one release carries every installer
 * and update descriptor, and the installed application's nightly/stable setting
 * no longer selects a separate feed.
 * @param environment - Packaging environment.
 * @returns GitHub update source.
 */
export function resolveDesktopGitHubUpdateConfig(environment?: NodeJS.ProcessEnv): DesktopGitHubUpdateConfig

/**
 * Name the electron-builder update descriptor that belongs to one target.
 * @param platform - Packaged target platform.
 * @returns Descriptor filename uploaded with the artifacts.
 */
export function desktopGitHubUpdateMetadataFilename(platform: 'darwin' | 'win32'): 'latest-mac.yml' | 'latest.yml'
