/** GitHub Releases update source shared by packaging configuration and verification. */

/** Repository that hosts the Desktop installers and update metadata. */
const GITHUB_UPDATE = { owner: 'ihankun', repo: 'deepseek-harness' }

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u
const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/u

/**
 * Resolve the one GitHub Releases feed packaged applications check for updates.
 * The configured channel is always `latest`: one release carries every installer
 * and update descriptor, and the installed application's nightly/stable setting
 * no longer selects a separate feed.
 * @param {NodeJS.ProcessEnv} environment - Packaging environment.
 * @returns {{ provider: 'github', owner: string, repo: string, channel: 'latest' }} GitHub update source.
 */
export function resolveDesktopGitHubUpdateConfig(environment = process.env) {
  const owner = environment.DSH_DESKTOP_GITHUB_OWNER ?? GITHUB_UPDATE.owner
  const repo = environment.DSH_DESKTOP_GITHUB_REPO ?? GITHUB_UPDATE.repo
  if (!OWNER_PATTERN.test(owner)) {
    throw new Error('desktop update source: DSH_DESKTOP_GITHUB_OWNER must be a GitHub account name')
  }
  if (!REPOSITORY_PATTERN.test(repo) || repo === '.' || repo === '..') {
    throw new Error('desktop update source: DSH_DESKTOP_GITHUB_REPO must be a GitHub repository name')
  }
  return { provider: 'github', owner, repo, channel: 'latest' }
}

/**
 * Name the electron-builder update descriptor that belongs to one target.
 * @param {'darwin' | 'win32'} platform - Packaged target platform.
 * @returns {'latest-mac.yml' | 'latest.yml'} Descriptor filename uploaded with the artifacts.
 */
export function desktopGitHubUpdateMetadataFilename(platform) {
  if (platform === 'darwin') return 'latest-mac.yml'
  if (platform === 'win32') return 'latest.yml'
  throw new Error(`desktop update source: unsupported metadata platform ${platform}`)
}
