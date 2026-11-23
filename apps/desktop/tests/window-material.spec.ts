import { expect, it } from 'vitest'
import { windowsAcrylicAvailable } from '../src/window-material.ts'

it.each([
  ['win32', '10.0.22631', true],
  ['win32', '10.0.26100', true],
  ['win32', '10.0.22000', false],
  ['win32', '10.0.19045', false],
  ['win32', '10.0', false],
  ['darwin', '24.6.0', false],
  ['linux', '6.8.0', false],
] as const)('reports acrylic availability for %s %s', (platform, release, expected) => {
  expect(windowsAcrylicAvailable(platform, release)).toBe(expected)
})
