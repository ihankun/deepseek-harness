# `@deepseek-ai/dsh-electron-app`

[English](README.md) | 中文

桌面应用:以带托盘图标的窗口承载 dsh web 表面,而非浏览器标签页。完全自包含——主进程([`src/main.ts`](src/main.ts))自行启动 dsh web server(`dsh web` 语义,OS 分配端口)并从就绪行解析 URL,除自身目录与 dsh 环境外不依赖任何东西。

## 工作原理

主进程以子进程启动服务器:

- **打包应用**:以 `ELECTRON_RUN_AS_NODE` 模式复用 Electron 二进制运行内置 CLI(`node_modules/@deepseek-ai/dsh/lib/bin.js web --port 0`),首次启动时从 asar 解包到 `~/Library/Application Support/DeepSeek/runtime/<version>/`——dsh 的 profile 回退机制会修复指向安装目录的符号链接,而 asar 内部的目标不是真实文件系统路径,因此服务器必须从磁盘副本运行。electron-builder 在打包时会把原生模块(fs-ext)按 Electron 的 Node ABI 重新编译。
- **开发启动**(`pnpm run electron:dev`):用系统 `node` 运行检出目录的已构建 CLI(`apps/cli/lib/bin.js web --port 0`)。node-gyp 原生模块在安装时按系统 Node 编译,服务器跑在同一运行时下 ABI 才能对齐——Electron 内嵌 Node 的 ABI 不同,加载会失败。

服务器 stderr 转发到应用;URL 来自 `dsh web: http://127.0.0.1:<port>` 就绪行。主进程轮询 URL 直到有响应,然后打开窗口、设置 dock 图标,并显示带「显示/退出」菜单的 `deepseek-tray` 托盘图标。关闭窗口会在所有平台退出应用;退出会杀掉服务器子进程,服务器自身退出也会结束应用。可选的环境变量 `DSH_WEB_URL` 可跳过内嵌服务器(外部 harness 启动)。

## 窗口装饰

系统标题栏被隐藏以获得沉浸式观感:macOS 在内容上方保留红绿灯(`titleBarStyle: 'hidden'`),win/linux 使用无边框窗口,由主进程向页面注入 36px 参与文档流的标题栏(拖拽区加最小化/最大化/还原/关闭 SVG 按钮),并取用侧边栏的填充 token,使标题栏与侧边栏融为一体并随浅色/深色主题切换。按钮通过 `dshWindow` preload 桥(`src/preload.mts`)与主进程通信。当 preload 桥报告 `darwin` 时,web 布局会预留红绿灯区域。窗口几何(位置与大小)持久化到应用 userData 下的 `window-state.json`:主进程在移动/缩放(防抖)及退出时写入,`dsh-client-ui-electron` 插件在启动时恢复,每次打开都会回到上次的位置和大小。

## 图标资源

`assets/` 存放图标资源。托盘使用 `deepseek-tray.png`——透明底的黑色形状,缩放到菜单栏规范的 24pt(2x 为 48px)并标记为 macOS template image,菜单栏会自动按当前浅色/深色渲染。dock 图标为 `icon2.png`,对齐 DeepSeek 桌面客户端图标:四周内缩 9%(Apple 图标模板比例)、圆角为 macOS 标准 22.5% 的圆角矩形。窗口图标为 `icon2-win.png`(win/linux)及 `icon2-win.ico`(Windows 任务栏/Alt-Tab,多分辨率 16–256):同一 icon2 标记裁掉 macOS 内缩留白并拉伸至铺满瓷砖,使任务栏按钮按完整尺寸显示。全部图标通过 `pnpm --filter @deepseek-ai/dsh-electron-app run gen:icons` 重新生成(脚本在 `scripts/gen-electron-icons.ts`,需要 `sharp` devDependency):macOS dock 图标与白底 win/linux 图标由 `icon-white.png` 派生,`icon2-win.*` 则由 `icon2.png` 派生。原位替换源文件并重新运行生成器即可换肤。

## 构建与运行

```sh
pnpm install                       # installs the electron runtime
pnpm run build                     # builds lib/ entries (dsh server + shell)
pnpm run electron:dev              # boot the desktop shell (web server + window)
```

`electron:dev` 会先重建 dsh 服务器库,再启动壳。服务器读取机器上常规的 dsh 环境(`DEEPSEEK_API_KEY`、`.env`、`$DSH_HOME`),请在启动前配置。

## 打包

```sh
pnpm run electron:build:mac        # macOS: release/DeepSeek.Harness-<ver>-{arm64,x64}.{dmg,zip}
pnpm run electron:build:win        # Windows: release/DeepSeek.Harness-Setup-<ver>.exe
```

打包需要已构建的 `lib/` 产物(先 `pnpm run build`)、`electron-builder` devDependency(`pnpm install`),以及下载 Electron dist 的网络。Windows 构建可在任意能运行 electron-builder 的主机执行;在 macOS 上还需要 Wine。macOS 图标由 electron-builder 从 `assets/icon2.png` 生成;Windows 安装包嵌入 `assets/icon2-win.ico`。NSIS 安装器为引导式(`oneClick: false`),允许用户自选安装目录。打包应用携带 `@deepseek-ai/dsh` 依赖树(electron-builder 从声明的 dependencies 收集),asar 内即包含内嵌服务器所需的全部内容。

声明的 `dependencies` 即打包闭包:web profile 插件树导入的每个 workspace 包都必须列出——electron-builder 对 pnpm link 的遍历够不到只被已打包实现包导入的能力包。组合配置新增 loader 条目时要同步扩展清单;`scripts/asar-missing-deps.mjs` 可对构建出的 asar 做依赖审计。`npmRebuild` 保持开启:打包时会把原生模块(fs-ext、node-pty)按 Electron 的 Node ABI 重编译,`ELECTRON_RUN_AS_NODE` server 子进程依赖这一点。pnpm 不会自动装传递的平台可选二进制(ripgrep 各平台构建),它们声明在 `optionalDependencies` 里。
