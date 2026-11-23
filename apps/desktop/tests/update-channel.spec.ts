import { expect, it } from 'vitest'
import { desktopUpdateChannel, desktopUpdateFeedChannel } from '../src/update-channel.ts'

it('reads the installed channel independently from the current version', () => {
  expect(desktopUpdateChannel({ version: '1.0.0', dshDesktopUpdateChannel: 'nightly' })).toBe('nightly')
  expect(desktopUpdateChannel({ version: '1.0.0', dshDesktopUpdateChannel: 'stable' })).toBe('stable')
  expect(desktopUpdateChannel({ version: '1.0.0' })).toBe('nightly')
  expect(() => desktopUpdateChannel({ dshDesktopUpdateChannel: 'latest' })).toThrow(/channel/u)
  expect(() => desktopUpdateChannel({ dshDesktopUpdateChannel: 'beta' })).toThrow(/channel/u)
  expect(() => desktopUpdateChannel(null)).toThrow(/manifest/u)
})

it('reads the packaged feed independently from the distribution channel', () => {
  expect(desktopUpdateFeedChannel({ dshDesktopUpdateFeedChannel: 'latest' }, 'nightly')).toBe('latest')
  expect(desktopUpdateFeedChannel({ dshDesktopUpdateFeedChannel: 'stable' }, 'nightly')).toBe('stable')
  expect(desktopUpdateFeedChannel({ version: '1.0.0' }, 'stable')).toBe('stable')
  expect(() => desktopUpdateFeedChannel({ dshDesktopUpdateFeedChannel: 'beta' }, 'nightly')).toThrow(/feed channel/u)
  expect(() => desktopUpdateFeedChannel(null, 'nightly')).toThrow(/manifest/u)
})
