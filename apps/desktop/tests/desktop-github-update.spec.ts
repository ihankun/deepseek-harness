import { expect, it } from 'vitest'
import {
  desktopGitHubUpdateMetadataFilename,
  resolveDesktopGitHubUpdateConfig,
} from '../scripts/desktop-github-update.mjs'

it('defaults to the fork GitHub latest release feed', () => {
  expect(resolveDesktopGitHubUpdateConfig({})).toEqual({
    provider: 'github', owner: 'ihankun', repo: 'deepseek-harness', channel: 'latest',
  })
})

it('accepts environment overrides', () => {
  expect(resolveDesktopGitHubUpdateConfig({ DSH_DESKTOP_GITHUB_OWNER: 'other', DSH_DESKTOP_GITHUB_REPO: 'repo.name' }))
    .toEqual({ provider: 'github', owner: 'other', repo: 'repo.name', channel: 'latest' })
})

it.each(['', 'bad owner', '-bad', 'bad-'])('rejects invalid owner %j', (owner) => {
  expect(() => resolveDesktopGitHubUpdateConfig({ DSH_DESKTOP_GITHUB_OWNER: owner }))
    .toThrow(/DSH_DESKTOP_GITHUB_OWNER/u)
})

it.each(['', '.', '..', 'bad repo', 'a/b'])('rejects invalid repository %j', (repo) => {
  expect(() => resolveDesktopGitHubUpdateConfig({ DSH_DESKTOP_GITHUB_REPO: repo }))
    .toThrow(/DSH_DESKTOP_GITHUB_REPO/u)
})

it('names the latest metadata file for each target', () => {
  expect(desktopGitHubUpdateMetadataFilename('win32')).toBe('latest.yml')
  expect(desktopGitHubUpdateMetadataFilename('darwin')).toBe('latest-mac.yml')
  expect(() => desktopGitHubUpdateMetadataFilename('linux' as 'win32')).toThrow(/metadata platform/u)
})
