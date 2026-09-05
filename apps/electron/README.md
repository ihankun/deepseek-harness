# `@deepseek-ai/dsh-electron-app`

English | [中文](README.zh.md)

The desktop app: an Electron shell that runs the dsh web surface in a window with a tray icon instead of a browser tab. It is fully self-contained — the main process ([`src/main.ts`](src/main.ts)) starts its own dsh web server (`dsh web` semantics, OS-assigned port) and loads the URL from the readiness line, so the app depends on nothing but its own directory and the dsh environment.

## How it works

The main process starts the server as a child:

- **Packaged app**: the Electron binary in `ELECTRON_RUN_AS_NODE` mode running the bundled CLI (`node_modules/@deepseek-ai/dsh/lib/bin.js web --port 0`), materialized once from the asar into `~/Library/Application Support/DeepSeek/runtime/<version>/` — dsh's profile fallback heals symlinks that must point at real filesystem paths, which asar-internal targets cannot be. electron-builder rebuilds native modules (fs-ext) for Electron's Node ABI at package time.
- **Dev launch** (`pnpm run electron:dev`): the system `node` running the checkout's built CLI (`apps/cli/lib/bin.js web --port 0`). Node-gyp native modules compile for the system Node during install; spawning the server under that runtime keeps their ABI aligned, where Electron's embedded Node carries a different one.

The server's stderr forwards to the app's, and the URL comes from the `dsh web: http://127.0.0.1:<port>` readiness line. The main process probes the URL until it answers, opens the window, sets the dock icon, and shows the `deepseek-tray` tray icon with show/exit actions. Closing the window quits the app on every platform; quitting kills the server child and the server's own exit quits the app. An optional `DSH_WEB_URL` environment value skips the embedded server (external-harness launch).

## Window chrome

The system title bar is hidden for an immersive look: macOS keeps the traffic lights over the content (`titleBarStyle: 'hidden'`), while win/linux run frameless and the main process injects a title bar into the page — a 36px in-flow strip (drag region plus minimize/maximize/restore/close SVG buttons) that takes the sidebar's fill token, so it reads as a continuation of the sidebar and follows light/dark switches. The buttons talk to the main process through the `dshWindow` preload bridge (`src/preload.mts`). The web layout reserves the macOS traffic-light band when the preload bridge reports `darwin`. Window geometry persists to `window-state.json` under the app's userData: the main process writes it on move/resize (debounced) and on quit, and the `dsh-client-ui-electron` plugin restores it at boot, so each launch reopens the window where it was left.

## Icon assets

`assets/` carries the icon resources. The tray uses `deepseek-tray.png` — a black shape on transparency, resized to the 24pt menu-bar size (48px @2x) and marked as a macOS template image, so the menu bar renders it in the current light/dark color automatically. The dock icon is `icon2.png`, matched to the DeepSeek desktop client icon: a rounded rect inset 9% per side (the Apple icon-template proportion) with the macOS standard corner radius (22.5%). The window icon is `icon2-win.png` (win/linux) plus `icon2-win.ico` (Windows taskbar/Alt-Tab, multi-resolution 16–256): the same icon2 mark with the macOS inset cropped away and stretched to nearly fill the tile, so the taskbar button reads at full size. All icons regenerate through `pnpm --filter @deepseek-ai/dsh-electron-app run gen:icons` (script at `scripts/gen-electron-icons.ts`, needs the `sharp` devDependency): the macOS dock icon and the white-background win tile derive from `icon-white.png`, while `icon2-win.*` derives from `icon2.png`. Swap the source file in place and re-run the generator to rebrand.

## Build and run

```sh
pnpm install                       # installs the electron runtime
pnpm run build                     # builds lib/ entries (dsh server + shell)
pnpm run electron:dev              # boot the desktop shell (web server + window)
```

`electron:dev` rebuilds the dsh server libs first, then launches the shell. The server reads the machine's dsh environment (`DEEPSEEK_API_KEY`, `.env`, `$DSH_HOME`), so set those before launching.

## Packaging

```sh
pnpm run electron:build:mac        # macOS: release/DeepSeek.Harness-<ver>-{arm64,x64}.{dmg,zip}
pnpm run electron:build:win        # Windows: release/DeepSeek.Harness-Setup-<ver>.exe
```

Packaging needs the built `lib/` entries (`pnpm run build` first), the `electron-builder` devDependency (`pnpm install`), and network access to download the Electron dist. The Windows build runs on any host that can run electron-builder; on macOS it additionally needs Wine. The macOS icon is generated from `assets/icon2.png` by electron-builder; the Windows installer embeds `assets/icon2-win.ico`. The NSIS installer is assisted (`oneClick: false`) and lets the user choose the install directory. The packaged app bundles the `@deepseek-ai/dsh` dependency tree (electron-builder collects it from the declared dependencies), so the asar contains everything the embedded server needs.
