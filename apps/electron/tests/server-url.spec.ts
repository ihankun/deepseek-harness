import { describe, expect, it } from 'vitest'
import { serverUrlFromLine } from '../src/server-url.ts'

describe('serverUrlFromLine', () => {
  it('extracts the loopback URL from the ready line', () => {
    expect(serverUrlFromLine('dsh web: http://127.0.0.1:4567')).toBe('http://127.0.0.1:4567')
  })

  it('keeps the launch-token query the cookie exchange needs', () => {
    expect(serverUrlFromLine('dsh web: http://127.0.0.1:4567/?token=abc_-123'))
      .toBe('http://127.0.0.1:4567/?token=abc_-123')
  })

  it('ignores the optional LAN suffix', () => {
    expect(serverUrlFromLine('dsh web: http://127.0.0.1:4567 (LAN: http://192.168.1.5:4567)'))
      .toBe('http://127.0.0.1:4567')
  })

  it('keeps the token while ignoring the optional LAN suffix', () => {
    expect(serverUrlFromLine('dsh web: http://127.0.0.1:4567/?token=abc_-123 (LAN: http://192.168.1.5:4567)'))
      .toBe('http://127.0.0.1:4567/?token=abc_-123')
  })

  it('finds the ready line inside surrounding output', () => {
    expect(serverUrlFromLine('info [logger] booting…\ndsh web: http://127.0.0.1:3080\nmore output'))
      .toBe('http://127.0.0.1:3080')
  })

  it('returns undefined for output without a ready line', () => {
    expect(serverUrlFromLine('booting…')).toBeUndefined()
  })
})
