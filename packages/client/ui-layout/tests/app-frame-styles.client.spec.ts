/** Window-material contracts in the frame stylesheet. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/AppFrame.module.css', import.meta.url)), 'utf8')

/**
 * Declarations of one exact selector, keyed by property.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when absent.
 */
function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

it('keeps the opaque Windows chrome without the native material', () => {
  expect(declarations(':global([data-windows-titlebar]) .frame')?.get('background')).toBe('var(--dsw-specific-sidebar-fill)')
  expect(declarations(':global([data-windows-titlebar]) .frame::before')?.get('background')).toBe('var(--dsw-specific-sidebar-fill)')
  expect(declarations(':global([data-windows-titlebar]) .centerCol')?.get('background')).toBe('var(--dsw-alias-bg-base)')
})

it('shows the acrylic material through one translucent chrome tint', () => {
  expect(declarations(":global([data-windows-material='acrylic']) .frame")?.get('background'))
    .toBe('var(--dsw-specific-sidebar-tint)')
  expect(declarations(":global([data-windows-material='acrylic']) .frame::before")?.get('background'))
    .toBe('transparent')
  expect(declarations(":global([data-windows-material='acrylic']) .frame:not([data-sidebar-drawer]) .sidebarCol")?.get('background'))
    .toBe('transparent')
})
