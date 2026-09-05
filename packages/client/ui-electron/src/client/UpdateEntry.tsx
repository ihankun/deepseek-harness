/**
 * Update entry and panel for the desktop shell's sidebar foot.
 *
 * The entry registers into the `sidebar.footer.action` seat (a list slot the
 * sidebar shell renders beside Settings in the foot row). Clicking it opens a
 * panel showing the mirrored main-process updater state: checking, available
 * (with download), downloading (with progress), downloaded (with install),
 * error (with retry), and up-to-date. The panel renders through a portal into
 * document.body and positions itself fixed from the entry's rect, escaping the
 * sidebar column's `overflow: hidden` and stacking context entirely.
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { IconDownloadOutline16, IconLoadingOutline16, IconQuestionOutline14, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { hasActionableUpdate, readyToInstall, useUpdaterStore, type UpdateEntryInjected } from './update-store.ts'
import type { ElectronKey } from './locales.ts'
import css from './UpdateEntry.module.css'

/** The release page users can reach when the panel cannot drive the updater. */
const RELEASES_PAGE_URL = 'https://github.com/ihankun/deepseek-harness/releases/latest'
const PANEL_WIDTH = 320
const VIEWPORT_MARGIN = 12

/** Full props: the footer-action owner share, the injected updater, and the standard locale seat. */
export type UpdateEntryProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'electron'>
  & UpdateEntryInjected

/**
 * Render the update entry button and its panel.
 * @param props - composed slot props (owner share + injected updater + locale seat).
 * @returns the update entry tree.
 */
export function UpdateEntry({ wide, t, store }: UpdateEntryProps) {
  const state = useUpdaterStore(store)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ bottom: number; left: number } | null>(null)
  const entryRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: Event): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (entryRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('focusin', closeOnOutside)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('focusin', closeOnOutside)
    }
  }, [open])

  const actionable = hasActionableUpdate(state)
  const installed = readyToInstall(state)
  const titleKey: ElectronKey = state.status === 'error'
    ? 'update.error'
    : state.status === 'checking'
      ? 'update.checking'
      : state.status === 'not-available'
        ? 'update.upToDate'
        : 'update.title'
  const title = state.status === 'error' && state.error
    ? t('update.error', { error: state.error })
    : t(titleKey)

  const toggle = (): void => {
    const el = entryRef.current
    if (el === null) return
    const rect = el.getBoundingClientRect()
    // Keep the panel to the button's left; when that would cross the viewport
    // edge, clamp it to the margin and let it extend to the right instead.
    const preferredLeft = rect.left - PANEL_WIDTH - 8
    setAnchor({
      bottom: window.innerHeight - rect.top + 8,
      left: Math.max(VIEWPORT_MARGIN, preferredLeft),
    })
    setOpen(v => !v)
  }

  return (
    <div ref={entryRef} className={css.entry}>
      <Tooltip label={title} delayMs={500} disabled={wide}>
        <button
          type="button"
          className={clsx(css.button, actionable && css.active)}
          aria-label={t('update.title')}
          aria-expanded={open}
          onClick={toggle}
        >
          {state.status === 'checking'
            ? <IconLoadingOutline16 className={css.spin} size={16} />
            : <IconQuestionOutline14 size={16} />}
          {actionable && !installed && <span className={css.badge} />}
          {installed && <span className={clsx(css.badge, css.installed)} />}
        </button>
      </Tooltip>
      {open && anchor !== null && (
        <UpdatePanel
          anchor={anchor}
          panelRef={panelRef}
          store={store}
          onClose={() => { setOpen(false) }}
          t={t}
        />
      )}
    </div>
  )
}

/** Panel props: the anchor rect, the store, and the locale seat. */
interface UpdatePanelProps {
  /** The entry's top edge and left offset, for fixed positioning. */
  anchor: { bottom: number; left: number }
  panelRef: RefObject<HTMLDivElement>
  store: UpdateEntryInjected['store']
  onClose: () => void
  t: (key: ElectronKey, params?: Record<string, unknown>) => string
}

/**
 * Render the update status panel: version, notes, progress, and the
 * state-appropriate action buttons. Positioned fixed from the entry's rect so
 * the sidebar column cannot clip it.
 * @param props - the anchor, store, and locale seat.
 * @returns the panel tree.
 */
function UpdatePanel({ anchor, panelRef, store, onClose, t }: UpdatePanelProps) {
  const state = useUpdaterStore(store)
  const percent = state.progress?.percent
  const version = state.version

  const notes = state.releaseNotes

  const actionRow: ReactNode[] = []
  if (state.status === 'available' && version !== null) {
    actionRow.push(
      <button key="download" type="button" className={css.primary} onClick={() => { store.download() }}>
        <IconDownloadOutline16 size={12} />
        {t('update.download')}
      </button>,
    )
  }
  if (state.status === 'downloaded') {
    actionRow.push(
      <button key="install" type="button" className={css.primary} onClick={() => { store.install() }}>
        {t('update.restartAndInstall')}
      </button>,
    )
  }
  if (state.status === 'error') {
    actionRow.push(
      <button key="retry" type="button" className={css.ghost} onClick={() => { store.check() }}>
        {t('update.retry')}
      </button>,
    )
  }

  return createPortal(
    <div ref={panelRef} className={css.panel} role="dialog" aria-label={t('update.title')} style={{ bottom: anchor.bottom, left: anchor.left }}>
      <div className={css.panelHeader}>
        <IconDownloadOutline16 size={14} />
        <span className={css.panelTitle}>{t('update.title')}</span>
        <button type="button" className={css.close} aria-label={t('update.title')} onClick={onClose}>×</button>
      </div>
      <div className={css.panelBody}>
        {!state.supported && <div className={css.muted}>{t('update.unsupported')}</div>}

        {state.status === 'checking' && (
          <div className={css.row}>
            <IconLoadingOutline16 className={css.spin} size={14} />
            {t('update.checking')}
          </div>
        )}

        {state.status === 'not-available' && <div className={css.row}>{t('update.upToDate')}</div>}

        {state.status === 'idle' && state.supported && (
          <div className={css.row}>
            {t('update.upToDate')}
          </div>
        )}

        {version !== null && (state.status === 'available' || state.status === 'downloading' || state.status === 'downloaded') && (
          <div className={css.versionRow}>
            <span className={css.versionLabel}>{t('update.available')}</span>
            <span className={css.versionValue}>{t('update.version', { version })}</span>
          </div>
        )}

        {state.status === 'downloading' && (
          <div className={css.progressWrap}>
            <div className={css.progressTrack}>
              <div className={css.progressFill} style={{ width: `${Math.max(0, Math.min(100, percent ?? 0))}%` }} />
            </div>
            <div className={css.muted}>{t('update.downloading', { percent: Math.round(percent ?? 0) })}</div>
          </div>
        )}

        {state.status === 'downloaded' && <div className={css.row}>{t('update.downloaded')}</div>}

        {state.status === 'error' && state.error !== null && (
          <div className={css.error}>{t('update.error', { error: state.error })}</div>
        )}

        {notes !== null && notes.length > 0 && (
          <div className={css.notes}>
            <div className={css.notesTitle}>{t('update.releaseNotes')}</div>
            <div className={css.notesBody}>{notes}</div>
          </div>
        )}

        <div className={css.footerRow}>
          <div className={css.actions}>{actionRow}</div>
          <a className={css.releaseLink} href={RELEASES_PAGE_URL} target="_blank" rel="noreferrer">
            {t('update.openReleasePage')}
          </a>
        </div>
      </div>
    </div>,
    document.body,
  )
}
