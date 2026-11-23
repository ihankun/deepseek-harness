/** Windows acrylic window backdrop shared by the main process and the application preload. */

/** Document root attribute whose value selects the native window material's client surfaces. */
export const WINDOWS_MATERIAL_ATTRIBUTE = 'data-windows-material'

/** Material value for the acrylic backdrop (`backgroundMaterial: 'acrylic'`). */
export const WINDOWS_ACRYLIC_MATERIAL = 'acrylic'

/** Preload argument that mirrors the enabled backdrop into the page. */
export const WINDOWS_MATERIAL_ARGUMENT = '--dsh-windows-material=acrylic'

/**
 * Report whether Electron can draw the acrylic backdrop on this system.
 * `backgroundMaterial` requires Windows 11 22H2 (build 22621) or later; earlier
 * systems ignore it, so the window keeps its opaque fallback instead of
 * exposing the desktop through transparent surfaces.
 * @param platform - operating system hosting Electron.
 * @param release - `os.release()` value such as `10.0.22631`.
 * @returns whether the acrylic backdrop is available.
 */
export function windowsAcrylicAvailable(platform: NodeJS.Platform, release: string): boolean {
  if (platform !== 'win32') return false
  const build = Number(release.split('.')[2])
  return Number.isSafeInteger(build) && build >= 22621
}
