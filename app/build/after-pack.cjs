// Ad-hoc sign the packed .app before the DMG is assembled. Apple Silicon refuses
// to run fully-unsigned binaries, and electron-builder skips signing when
// mac.identity is null — so we sign here (afterPack runs before dmg build).
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  // execFile (no shell) — appPath is passed as a single arg, not interpolated.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
