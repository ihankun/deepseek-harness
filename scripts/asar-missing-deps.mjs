import asar from '../node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar/lib/asar.js'

const asarPath = 'apps/electron/release/mac-arm64/DeepSeek Harness.app/Contents/Resources/app.asar'
const files = new Set(asar.listPackage(asarPath))
const header = asar.getRawHeader(asarPath).header

const pkgJsonPaths = []
function walk(node, path) {
  for (const [name, child] of Object.entries(node)) {
    const p = path + '/' + name
    if (child.files) walk(child.files, p)
    else if (p.endsWith('/package.json')) pkgJsonPaths.push(p.slice(1))
  }
}
walk(header.files, '')

const missing = new Map()
for (const p of pkgJsonPaths) {
  if (!p.startsWith('node_modules/')) continue
  const buf = asar.extractFile(asarPath, p)
  if (buf === undefined) continue
  let json
  try { json = JSON.parse(buf.toString()) } catch { continue }
  for (const dep of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(json[dep] ?? {})) {
      if (!files.has(`/node_modules/${name}`)) {
        missing.set(name, (missing.get(name) ?? 0) + 1)
      }
    }
  }
}
console.log('missing deps:')
for (const [name, count] of [...missing.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(String(count).padStart(3), name)
}
