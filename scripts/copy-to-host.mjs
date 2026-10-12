import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const version = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version
// Target is the chat platform app's public widget directory, e.g. `npm run build:hosted -- ../app/public/omnichannel-widget`.
const root = process.argv[2] || process.env.CHATWIDGET_HOST_PUBLIC_DIR
if (!root) {
  console.error('Missing target: pass the public widget directory as an argument or set CHATWIDGET_HOST_PUBLIC_DIR.')
  process.exit(1)
}
const target = resolve(root, `v${version}`)
mkdirSync(target, { recursive: true })
copyFileSync(resolve('dist', 'omnichannel.js'), resolve(target, 'omnichannel.js'))
copyFileSync(resolve('dist', 'omnichannel.css'), resolve(target, 'omnichannel.css'))
console.log(`Copied omnichannel.js and omnichannel.css to ${target}`)
