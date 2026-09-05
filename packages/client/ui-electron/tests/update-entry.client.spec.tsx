// @vitest-environment jsdom
// UpdateEntry: clicking the question-mark button opens the panel, clicking the
// close button dismisses it, and the state-driven verbs render per updater
// status. The store is driven by a fake preload bridge.
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach } from 'vitest'
import { UpdateEntry } from '../src/client/UpdateEntry.tsx'
import { UpdateStore } from '../src/client/update-store.ts'
import { en } from '../src/client/locales.ts'
import type { UpdaterState } from '../src/client/platform-service.ts'

afterEach(cleanup)

const t = (key: string): string => (en as Record<string, string>)[key] ?? key

function makeBridge(initial: UpdaterState | null = null) {
  let state: UpdaterState | null = initial
  const listeners = new Set<(s: UpdaterState) => void>()
  const api = {
    platform: 'darwin',
    minimize: () => {},
    toggleMaximize: () => {},
    close: () => {},
    updaterState: () => Promise.resolve(state),
    updaterCheck: vi.fn(() => Promise.resolve(true)),
    updaterDownload: vi.fn(() => Promise.resolve(true)),
    updaterInstall: vi.fn(() => Promise.resolve(true)),
    onUpdaterStateChange: (fn: (s: UpdaterState) => void) => { listeners.add(fn) },
  }
  return {
    api,
    push: (next: UpdaterState) => { state = next; for (const fn of listeners) fn(next) },
  }
}

const IDLE: UpdaterState = {
  supported: true,
  status: 'idle',
  version: null,
  releaseName: null,
  releaseNotes: null,
  progress: null,
  error: null,
}

function renderEntry(store: UpdateStore, wide = true) {
  return render(
    <UpdateEntry
      wide={wide}
      t={t as never}
      store={store}
      useSessions={undefined as never}
      useWorkspaces={undefined as never}
      useSessionPendingInteraction={undefined as never}
    />,
  )
}

/** Let the store's async initial snapshot resolve before asserting. */
async function settle(): Promise<void> {
  await new Promise((resolve) => { setTimeout(resolve, 0) })
}

describe('UpdateEntry', () => {
  it('opens the panel on click and closes it on the close button', async () => {
    const bridge = makeBridge(IDLE)
    const store = new UpdateStore(bridge.api as never)
    renderEntry(store)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: t('update.title') }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.style.bottom).toBe(`${window.innerHeight + 8}px`)
    expect(dialog.style.left).toBe('12px')
    expect(dialog.style.top).toBe('')

    // The close button carries the same aria-label; query the panel's own.
    fireEvent.click(dialog.querySelector('button') as HTMLElement)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the panel when focus or a pointer moves outside it', async () => {
    const bridge = makeBridge(IDLE)
    const store = new UpdateStore(bridge.api as never)
    renderEntry(store)
    fireEvent.click(screen.getByRole('button', { name: t('update.title') }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: t('update.title') }))
    fireEvent.focusIn(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the download button when an update is available and forwards it', async () => {
    const bridge = makeBridge({ ...IDLE, status: 'available', version: '9.9.9' })
    const store = new UpdateStore(bridge.api as never)
    await settle()
    renderEntry(store)
    fireEvent.click(screen.getByRole('button', { name: t('update.title') }))
    fireEvent.click(screen.getByRole('button', { name: t('update.download') }))
    expect(bridge.api.updaterDownload).toHaveBeenCalled()
  })

  it('shows install when downloaded and forwards it', async () => {
    const bridge = makeBridge({ ...IDLE, status: 'downloaded', version: '9.9.9' })
    const store = new UpdateStore(bridge.api as never)
    await settle()
    renderEntry(store)
    fireEvent.click(screen.getByRole('button', { name: t('update.title') }))
    fireEvent.click(screen.getByRole('button', { name: t('update.restartAndInstall') }))
    expect(bridge.api.updaterInstall).toHaveBeenCalled()
  })

  it('shows the checking spinner state', async () => {
    const bridge = makeBridge({ ...IDLE, status: 'checking' })
    const store = new UpdateStore(bridge.api as never)
    await settle()
    renderEntry(store)
    fireEvent.click(screen.getByRole('button', { name: t('update.title') }))
    expect(screen.getByText(t('update.checking'))).toBeTruthy()
  })
})
