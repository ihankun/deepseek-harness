// @vitest-environment jsdom
/**
 * VersionBadge spec: the hover overlay attaches to the brand wordmark, is
 * hidden until the brand is hovered, carries the app version from the shell
 * bridge, tracks the badge plate geometry on resize, and detaches (listeners
 * and inline styles) on dispose. Element discovery follows the shell nesting
 * (#root > frame > sidebar column > sidebar root > logo row).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startVersionBadge } from '../src/client/version-badge.ts'

/** Captures the ResizeObserver callback so tests can fire resizes manually. */
let fireResize: (() => void) | null = null
class ResizeObserverStub {
  cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) { this.cb = cb }
  observe(): void { fireResize = () => { this.cb([], this) } }
  unobserve(): void {}
  disconnect(): void { fireResize = null }
}

function shellHtml(): string {
  return [
    '<div id="root">',
    '  <div data-slot="root">',
    '    <div class="frame">',
    '      <div class="sidebar-col">',
    '        <div data-slot="sidebar">',
    '          <div class="sidebar-root">',
    '            <div class="logo-row">',
    '              <button class="brand" data-brand="wordmark"><svg data-name="wordmark"></svg></button>',
    '              <button class="toggle"><svg data-name="panel"></svg></button>',
    '            </div>',
    '          </div>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>',
  ].join('')
}

/** Give the wordmark svg a measurable box for geometry math. */
function sizeWordmark(width = 182, height = 24): void {
  const svg = document.querySelector('svg[data-name="wordmark"]')
  if (svg === null) throw new Error('wordmark svg missing from shell html')
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    width, height, left: 0, top: 0, right: width, bottom: height, x: 0, y: 0,
    toJSON: () => ({}),
  })
}

function label(): HTMLElement | null {
  return document.getElementById('dsh-version-badge-label')
}

function brand(): HTMLElement {
  return document.querySelector('button.brand') as HTMLElement
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  window.dshWindow = {
    platform: 'darwin',
    minimize: () => {},
    toggleMaximize: () => {},
    close: () => {},
    updaterState: () => Promise.resolve(null),
    updaterCheck: () => Promise.resolve(true),
    updaterDownload: () => Promise.resolve(true),
    updaterInstall: () => Promise.resolve(true),
    onUpdaterStateChange: () => {},
    version: () => Promise.resolve('0.1.1'),
  }
})

afterEach(() => {
  document.body.innerHTML = ''
  delete window.dshWindow
  fireResize = null
  vi.unstubAllGlobals()
})

describe('version badge', () => {
  it('attaches a hidden overlay over the badge plate carrying the app version', async () => {
    document.body.innerHTML = shellHtml()
    sizeWordmark()
    const dispose = startVersionBadge()
    await new Promise((resolve) => { setTimeout(resolve, 0) })

    const el = label()
    expect(el).not.toBeNull()
    expect(el!.textContent).toBe('V0.1.1')
    // Default-hidden comes from the injected stylesheet, not inline style, so
    // the :hover rule can override it.
    expect(el!.style.opacity).toBe('')
    expect(el!.style.position).toBe('absolute')
    // Sanity: the geometry source is live before asserting derived pixels.
    const svg = document.querySelector('svg[data-name="wordmark"]') as SVGSVGElement
    expect(svg.getBoundingClientRect().width).toBe(182)
    // Badge plate box: x=129.348/182, y=5.5/24, w=52/182, h=14/24 at 182x24.
    expect(Number.parseFloat(el!.style.left)).toBeCloseTo(129.348)
    expect(Number.parseFloat(el!.style.top)).toBeCloseTo(5.5)
    expect(Number.parseFloat(el!.style.width)).toBeCloseTo(52)
    expect(Number.parseFloat(el!.style.height)).toBeCloseTo(14)
    expect(brand().style.position).toBe('relative')

    dispose()
  })

  it('reveals the version label when the brand is hovered', async () => {
    document.body.innerHTML = shellHtml()
    sizeWordmark()
    const dispose = startVersionBadge()
    await new Promise((resolve) => { setTimeout(resolve, 0) })

    const styles = document.getElementById('dsh-version-badge-styles')
    expect(styles?.textContent).toContain(':hover')
    expect(styles?.textContent).toContain('opacity: 1')

    dispose()
  })

  it('re-anchors the overlay geometry on resize', async () => {
    document.body.innerHTML = shellHtml()
    sizeWordmark()
    const dispose = startVersionBadge()
    await new Promise((resolve) => { setTimeout(resolve, 0) })

    const svg = document.querySelector('svg[data-name="wordmark"]')
    if (svg === null) throw new Error('wordmark svg missing from shell html')
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      width: 91, height: 12, left: 0, top: 0, right: 91, bottom: 12, x: 0, y: 0,
      toJSON: () => ({}),
    })
    fireResize?.()

    const el = label()!
    expect(Number.parseFloat(el.style.left)).toBeCloseTo(129.348 / 2)
    expect(Number.parseFloat(el.style.width)).toBeCloseTo(52 / 2)

    dispose()
  })

  it('detaches the overlay and restores the brand on dispose', async () => {
    document.body.innerHTML = shellHtml()
    sizeWordmark()
    const dispose = startVersionBadge()
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(label()).not.toBeNull()

    dispose()
    expect(label()).toBeNull()
    expect(brand().style.position).toBe('')
    expect(fireResize).toBeNull()
  })
})
