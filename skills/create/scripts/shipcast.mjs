#!/usr/bin/env node
// Shipcast toolkit — zero dependencies. Node 22+, a local Chrome/Chromium/Edge, ffmpeg for video.
//
//   doctor                                   check Node, browser and ffmpeg
//   formats [id]                             platform formats (sizes, safe areas, caption rules)
//   find [dir...] [--depth 4] [--limit 25]   list product folders on this computer, most recently worked on first
//   inventory <dir>                          map a product folder: stack, docs, design tokens, copy, pictures
//   check  <html> --format <id>              layout problems a viewer would see (JSON)
//   render <html> --format <id> --out <png> [--at <seconds>] [--preview <jpg>]   (or --size WxH for any canvas)
//   frames <html> --format <id> --out-dir <dir> [--at 1,5,9.5]
//   video  <html> --format <id> --out <mp4> [--duration s] [--fps 30] [--audio file]
//   sheet  <png...> --out <png> [--cols 3] [--preview <jpg>]   one contact sheet to review several renders at once
//   open   <dir>                             open a folder in Finder / Explorer / the file manager

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs'
import { tmpdir, platform, homedir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FORMATS = JSON.parse(readFileSync(join(HERE, 'formats.json'), 'utf8')).formats

// ── args ────────────────────────────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2)
const pos = []
const opt = {}
for (let i = 0; i < rest.length; i++) {
  const a = rest[i]
  if (a.startsWith('--')) {
    const k = a.slice(2)
    const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true
    opt[k] = v
  } else pos.push(a)
}
const die = (msg) => { console.error(`shipcast: ${msg}`); process.exit(1) }
const log = (msg) => process.stderr.write(`${msg}\n`)
function format(id) {
  // --size WxH renders any canvas (icons, link previews) without a platform's safe areas.
  if (opt.size) {
    const [w, h] = String(opt.size).split('x').map(Number)
    if (!w || !h) die('--size must look like 1200x630')
    return { id: `custom-${w}x${h}`, kind: 'image', width: w, height: h, safe: { top: 0, right: 0, bottom: 0, left: 0 } }
  }
  if (!id) die('--format <id> (or --size WxH) is required. Run: formats')
  const f = FORMATS.find((x) => x.id === id)
  if (!f) die(`unknown format "${id}". Run: formats`)
  return f
}

// ── tools ───────────────────────────────────────────────────────────────────
function which(bin) {
  const r = spawnSync(platform() === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null
}

function findBrowser() {
  if (process.env.SHIPCAST_CHROME) return process.env.SHIPCAST_CHROME
  const mac = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ]
  const win = [
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ]
  for (const p of platform() === 'darwin' ? mac : platform() === 'win32' ? win : []) if (p && existsSync(p)) return p
  for (const b of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    const p = which(b)
    if (p) return p
  }
  return null
}

const ffmpegPath = () => process.env.SHIPCAST_FFMPEG || which('ffmpeg')

// ── a minimal Chrome DevTools Protocol client ───────────────────────────────
class Browser {
  static async launch() {
    const exe = findBrowser()
    if (!exe) die('no Chrome, Chromium or Edge found. Install Google Chrome or set SHIPCAST_CHROME to its path.')
    const profile = mkdtempSync(join(tmpdir(), 'shipcast-chrome-'))
    const proc = spawn(exe, [
      '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
      '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
      '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required',
      '--force-color-profile=srgb', '--font-render-hinting=none', 'about:blank',
    ], { stdio: 'ignore' })
    const portFile = join(profile, 'DevToolsActivePort')
    for (let i = 0; i < 200 && !existsSync(portFile); i++) await sleep(50)
    if (!existsSync(portFile)) { proc.kill(); die('the browser did not start.') }
    const port = readFileSync(portFile, 'utf8').split('\n')[0].trim()
    const b = new Browser(proc, profile, port)
    return b
  }

  constructor(proc, profile, port) { this.proc = proc; this.profile = profile; this.port = port }

  async page(width, height) {
    const target = await (await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, { method: 'PUT' })).json()
    const p = new Page(target.webSocketDebuggerUrl)
    await p.open()
    await p.send('Page.enable')
    await p.send('Runtime.enable')
    await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    return p
  }

  close() {
    try { this.proc.kill() } catch {}
    setTimeout(() => { try { rmSync(this.profile, { recursive: true, force: true }) } catch {} }, 300)
  }
}

class Page {
  constructor(url) { this.url = url; this.id = 0; this.wait = new Map(); this.listeners = [] }
  open() {
    return new Promise((ok, fail) => {
      this.ws = new WebSocket(this.url)
      this.ws.onopen = () => ok()
      this.ws.onerror = (e) => fail(e)
      this.ws.onmessage = (e) => {
        const m = JSON.parse(e.data)
        if (m.id && this.wait.has(m.id)) {
          const { res, rej } = this.wait.get(m.id)
          this.wait.delete(m.id)
          m.error ? rej(new Error(m.error.message)) : res(m.result)
        } else if (m.method) for (const l of this.listeners) l(m)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((res, rej) => this.wait.set(id, { res, rej }))
  }
  once(method, timeout = 30000) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`timed out waiting for ${method}`)), timeout)
      const l = (m) => { if (m.method === method) { clearTimeout(t); this.listeners = this.listeners.filter((x) => x !== l); res(m.params) } }
      this.listeners.push(l)
    })
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  async load(file) {
    const loaded = this.once('Page.loadEventFired', 60000)
    await this.send('Page.navigate', { url: pathToFileURL(resolve(file)).href })
    await loaded
    await this.eval(`(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r })));
      await Promise.all([...document.querySelectorAll('video')].map((v) => v.readyState >= 2 ? 0 : new Promise((r) => {
        v.muted = true; v.preload = 'auto'; v.onloadeddata = v.onerror = r; setTimeout(r, 15000); v.load()
      })));
      return true })()`)
  }
  /** Freeze the whole page at t seconds: CSS/Web animations and <video> elements (data-start = offset). */
  freeze(t) {
    return this.eval(`(async (t) => {
      for (const a of document.getAnimations()) { a.pause(); a.currentTime = t * 1000 }
      for (const v of document.querySelectorAll('video')) {
        v.pause()
        const d = v.duration || 0
        let at = Math.max(0, t - Number(v.dataset.start || 0))
        if (d) at = v.loop ? at % d : Math.min(at, d - 0.04)
        if (Math.abs(v.currentTime - at) > 0.001) { v.currentTime = at; await new Promise((r) => { v.addEventListener('seeked', r, { once: true }); setTimeout(r, 3000) }) }
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return true })(${t})`)
  }
  /** Still images: every animation at its end state. */
  settle() {
    return this.eval(`(async () => {
      for (const a of document.getAnimations()) { try { a.finish() } catch { a.pause(); a.currentTime = 1e7 } }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return true })()`)
  }
  async jpeg(w, h, scale = 0.5) {
    const r = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, fromSurface: true, captureBeyondViewport: false, clip: { x: 0, y: 0, width: w, height: h, scale } })
    return Buffer.from(r.data, 'base64')
  }
  async png(w, h) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } })
    return Buffer.from(r.data, 'base64')
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// --preview <file.jpg>: a small JPEG next to the full-size PNG, for showing a render inside a chat.
const previewScale = (w, h) => Math.min(1, 1000 / Math.max(w, h))
function writePreview(file, buf) { mkdirSync(dirname(resolve(file)), { recursive: true }); writeFileSync(file, buf) }

async function withPage(file, f, fn) {
  if (!existsSync(file)) die(`no such file: ${file}`)
  const b = await Browser.launch()
  try {
    const p = await b.page(f.width, f.height)
    await p.load(file)
    return await fn(p)
  } finally {
    b.close()
  }
}

// ── layout check ────────────────────────────────────────────────────────────
const CHECK_JS = (f, at) => `(() => {
  const W = ${f.width}, H = ${f.height}, S = ${JSON.stringify(f.safe)}, at = ${JSON.stringify(at)}
  const issues = [], warnings = []
  const canvas = document.getElementById('canvas')
  if (!canvas) { issues.push('No <div id="canvas"> root element.'); return { issues, warnings } }
  const cr = canvas.getBoundingClientRect()
  if (Math.round(cr.width) !== W || Math.round(cr.height) !== H || Math.round(cr.left) !== 0 || Math.round(cr.top) !== 0)
    issues.push('#canvas is ' + Math.round(cr.width) + '×' + Math.round(cr.height) + ' at (' + Math.round(cr.left) + ',' + Math.round(cr.top) + '); it must be exactly ' + W + '×' + H + ' at (0,0).')
  const visible = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e)
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.15) return false
    }
    return true
  }
  const label = (el) => '"' + (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 48) + '"'
  let readable = 0, words = 0
  for (const el of canvas.querySelectorAll('*')) {
    const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim().length > 1)
    if (!own || !visible(el)) continue
    readable++
    words += [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent.trim().split(/\\s+/).filter(Boolean).length).reduce((a, b) => a + b, 0)
    // Measure the words themselves, not the element's box (a full-screen flex card has centred text).
    const range = document.createRange()
    let r = null
    for (const c of el.childNodes) {
      if (c.nodeType !== 3 || !c.textContent.trim()) continue
      range.selectNodeContents(c)
      const b = range.getBoundingClientRect()
      r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom }
    }
    const cs = getComputedStyle(el)
    if (!r || r.right - r.left < 1 || r.bottom - r.top < 1) continue
    if (r.left < -2 || r.top < -2 || r.right > W + 2 || r.bottom > H + 2) issues.push('Text ' + label(el) + ' runs outside the ' + W + '×' + H + ' frame.')
    else if (r.top < S.top - 4 || r.bottom > H - S.bottom + 4 || r.left < S.left - 4 || r.right > W - S.right + 4)
      issues.push('Text ' + label(el) + ' sits in the area the platform covers. Keep text ' + S.top + 'px from the top, ' + S.right + 'px from the right, ' + S.bottom + 'px from the bottom, ' + S.left + 'px from the left.')
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'visible') issues.push('Text ' + label(el) + ' is cut off on the right inside its box.')
    if (el.scrollHeight > el.clientHeight + 4 && cs.overflowY !== 'visible') issues.push('Text ' + label(el) + ' is cut off at the bottom of its box.')
    const size = parseFloat(cs.fontSize)
    if (size < 22) warnings.push('Text ' + label(el) + ' is ' + Math.round(size) + 'px — too small to read on a phone (use at least 24px at this size).')
    const fam = cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')
    if (fam && !/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|-apple-system|BlinkMacSystemFont)$/i.test(fam) && !document.fonts.check('16px "' + fam + '"'))
      warnings.push('Font "' + fam + '" did not load for ' + label(el) + '; a fallback font is showing.')
  }
  for (const img of canvas.querySelectorAll('img')) if (visible(img) && (!img.complete || img.naturalWidth === 0)) issues.push('Picture did not load: ' + (img.getAttribute('src') || '').slice(0, 80))
  for (const v of canvas.querySelectorAll('video')) if (v.readyState < 2) issues.push('Video did not load: ' + (v.getAttribute('src') || '').slice(0, 80))
  if (at !== null && readable === 0) warnings.push('Nothing readable is on screen.')
  if (at === null && words > 40) warnings.push('About ' + words + ' words on the image — aim for 25 or fewer.')
  const dedupe = (a) => [...new Set(a)].slice(0, 15)
  return { issues: dedupe(issues), warnings: dedupe(warnings) }
})()`

async function check(file, f) {
  return withPage(file, f, async (p) => {
    const times = f.kind === 'video' ? sampleTimes(f) : [null]
    const out = { file, format: f.id, issues: [], warnings: [] }
    for (const t of times) {
      if (t === null) await p.settle()
      else await p.freeze(t)
      const r = await p.eval(CHECK_JS(f, t))
      const tag = (s) => (t === null ? s : `${s} (at ${t.toFixed(1)}s)`)
      out.issues.push(...r.issues.map(tag))
      out.warnings.push(...r.warnings.map(tag))
    }
    out.ok = out.issues.length === 0
    return out
  })
}

function sampleTimes(f) {
  const d = Number(opt.duration || f.duration || 15)
  return [0.6, d * 0.25, d * 0.5, d * 0.75, d - 0.15].map((t) => Math.max(0, Math.min(t, d - 0.05)))
}

// ── inventory ───────────────────────────────────────────────────────────────
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.expo', 'Pods', 'vendor', 'coverage', '.turbo', '.wrangler', '.cache', 'DerivedData', '__pycache__', '.venv', 'venv', '.dart_tool', '.gradle', '.idea', '.vscode', 'shipcast-output', '.svelte-kit', 'target', 'bin', 'obj'])
const TEXT_EXT = /\.(md|mdx|txt|rst|json|jsonc|ts|tsx|js|jsx|mjs|cjs|vue|svelte|astro|css|scss|less|html|swift|kt|kts|java|dart|py|rb|go|rs|php|cs|yml|yaml|toml|arb|xml|strings|xcstrings|plist|gradle)$/i
const IMG_EXT = /\.(png|jpe?g|webp|svg|gif)$/i
const VID_EXT = /\.(mp4|mov|webm|m4v)$/i
const DOC_EXT = /\.(md|mdx|txt|rst)$/i
const GENERATED = /(\.g\.dart|\.freezed\.dart|\.generated\.|\.min\.(js|css)|\.map|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|pubspec\.lock|Podfile\.lock|\.lock)$/i
const TESTS = /(^|\/)(test|tests|__tests__|e2e|fixtures|__snapshots__|androidTest|testFixtures)\/|(\.test|\.spec|_test)\.[a-z]+$/i
const PLATFORM_SCAFFOLD = /^(android\/(app\/src\/main\/res|gradle)|ios\/(Runner|Flutter)|macos|windows|linux|web\/icons)\//
const ANCHOR = /(^|\/)(readme|claude|agents|product|brief|overview|vision|pitch|roadmap|changelog)(\.[a-z]+)?$|(^|\/)(package\.json|pubspec\.yaml|app\.json|app\.config\.(ts|js)|manifest\.json|Package\.swift|build\.gradle(\.kts)?|Info\.plist|AndroidManifest\.xml|tailwind\.config\.[cm]?[jt]s)$/i
const TOKENS = /(theme|tokens?|colou?rs?|palette|brand|design[-_ ]?system|styles?|typography|variables)/i
const COPY = /(strings\.xml|Localizable\.strings|\.xcstrings|\.arb)$|(^|\/)(i18n|locales?|l10n|lang|translations?|messages)\/.+\.(json|ya?ml|ts|js)$|(^|\/)[^/]*(copy|strings?|texts?|content)\.(dart|ts|tsx|js|json|kt|swift)$/i
const SCREENS = /(^|\/)(screens?|pages?|views?|routes?|activities|fragments|ui|presentation|features?|scenes?|app)\//i

function walk(root) {
  const files = []
  const stack = ['']
  while (stack.length && files.length < 40000) {
    const rel = stack.pop()
    let entries
    try { entries = readdirSync(join(root, rel), { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) { if (!SKIP_DIR.has(e.name) && !e.name.startsWith('.')) stack.push(p) }
      else if (e.isFile()) { try { files.push({ path: p, size: statSync(join(root, p)).size }) } catch {} }
    }
  }
  return files
}

function imageSize(file) {
  try {
    const fd = openSync(file, 'r')
    const b = Buffer.alloc(65536)
    const n = readSync(fd, b, 0, b.length, 0)
    closeSync(fd)
    if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)]
    if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i < n - 9;) {
        if (b[i] !== 0xff) { i++; continue }
        const m = b[i + 1]
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]
        i += 2 + b.readUInt16BE(i + 2)
      }
    }
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
      const t = b.toString('ascii', 12, 16)
      if (t === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
      if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
      if (t === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)] }
    }
    if (/\.svg$/i.test(file)) {
      const s = b.toString('utf8', 0, n)
      const vb = s.match(/viewBox=["'][\d.\s-]*?\s([\d.]+)\s+([\d.]+)["']/)
      if (vb) return [Math.round(+vb[1]), Math.round(+vb[2])]
    }
  } catch {}
  return null
}

function inventory(root) {
  root = resolve(root)
  if (!existsSync(root)) die(`no such folder: ${root}`)
  const all = walk(root)
  const has = (re) => all.some((f) => re.test(f.path))
  const stack = []
  if (has(/(^|\/)pubspec\.yaml$/)) stack.push('Flutter/Dart')
  // Swift/Kotlin count as the product's stack only when they live outside a cross-platform app's
  // generated ios/ and android/ shells (Flutter, React Native, Expo all ship those).
  const nativeShell = /^(ios|android|macos)\//
  if (all.some((f) => /\.swift$/.test(f.path) && !nativeShell.test(f.path)) || has(/(^|\/)Package\.swift$/)) stack.push('Swift/iOS')
  if (all.some((f) => /\.kt$/.test(f.path) && !/^android\/app\/src\/main\/(kotlin|java)\/.+\/MainActivity\.kt$/.test(f.path) && !/^(ios|macos)\//.test(f.path)) && has(/(^|\/)build\.gradle(\.kts)?$/)) stack.push('Kotlin/Android')
  const pkg = all.find((f) => f.path === 'package.json')
  if (pkg) {
    try {
      const j = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
      const d = { ...j.dependencies, ...j.devDependencies }
      for (const [k, v] of [['expo', 'Expo/React Native'], ['react-native', 'React Native'], ['next', 'Next.js'], ['@remix-run/react', 'Remix'], ['nuxt', 'Nuxt'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['astro', 'Astro'], ['react', 'React'], ['electron', 'Electron'], ['tailwindcss', 'Tailwind'], ['nativewind', 'NativeWind']])
        if (d[k]) stack.push(v)
    } catch {}
  }
  if (has(/(^|\/)(requirements\.txt|pyproject\.toml)$/)) stack.push('Python')
  if (has(/(^|\/)go\.mod$/)) stack.push('Go')
  if (has(/(^|\/)Cargo\.toml$/)) stack.push('Rust')

  const usable = all.filter((f) => !GENERATED.test(f.path))
  const source = usable.filter((f) => TEXT_EXT.test(f.path) && !DOC_EXT.test(f.path) && !TESTS.test(f.path) && !PLATFORM_SCAFFOLD.test(f.path) && f.size < 400_000)
  const docs = usable.filter((f) => DOC_EXT.test(f.path) && f.size < 400_000).sort(byDepth)
  const images = usable.filter((f) => IMG_EXT.test(f.path) && f.size > 0 && f.size < 8_000_000 && !TESTS.test(f.path))
  const videos = usable.filter((f) => VID_EXT.test(f.path) && f.size < 300_000_000)
  const kind = source.length >= 5 ? 'codebase' : docs.length ? 'notes' : images.length ? 'assets' : 'empty'

  // Design tokens: colours and fonts, counted across source files.
  const colors = new Map()
  const fonts = new Map()
  const bump = (m, k, file) => { const e = m.get(k) ?? { n: 0, files: new Set() }; e.n++; if (e.files.size < 4) e.files.add(file); m.set(k, e) }
  const scanFiles = source.filter((f) => /\.(dart|kt|swift|xml|ts|tsx|js|jsx|mjs|css|scss|less|json|html|vue|svelte|astro|yaml|yml|plist|colorset)$/i.test(f.path) || f.path.endsWith('Contents.json')).sort((a, b) => Number(TOKENS.test(b.path)) - Number(TOKENS.test(a.path))).slice(0, 2500)
  const tokenFiles = []
  for (const f of scanFiles) {
    let s
    try { s = readFileSync(join(root, f.path), 'utf8') } catch { continue }
    let distinct = new Set()
    for (const m of s.matchAll(/(?<![\w&])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g)) {
      let h = m[1].toLowerCase()
      if (h.length === 3) h = h.split('').map((c) => c + c).join('')
      const hex = `#${h.slice(0, 6)}${h.length === 8 && h.slice(6) !== 'ff' ? h.slice(6) : ''}`
      distinct.add(hex); bump(colors, hex, f.path)
    }
    for (const m of s.matchAll(/0x([0-9a-fA-F]{2})([0-9a-fA-F]{6})\b/g)) {
      const hex = `#${m[2].toLowerCase()}${m[1].toLowerCase() !== 'ff' ? m[1].toLowerCase() : ''}`
      distinct.add(hex); bump(colors, hex, f.path)
    }
    for (const m of s.matchAll(/(?:font-family|fontFamily|FontFamily)\s*[:=(]\s*\(?\s*["'`]?([A-Z][\w\- ]{1,40}?)["'`,);]/g)) bump(fonts, m[1].trim(), f.path)
    for (const m of s.matchAll(/GoogleFonts\.([a-z][A-Za-z0-9]+)/g)) bump(fonts, m[1].replace(/TextTheme$/, ''), f.path)
    for (const m of s.matchAll(/\.custom\(\s*"([^"]+)"/g)) bump(fonts, m[1], f.path)
    for (const m of s.matchAll(/@expo-google-fonts\/([a-z0-9-]+)/g)) bump(fonts, m[1], f.path)
    for (const m of s.matchAll(/fonts\.googleapis\.com\/css2?\?family=([A-Za-z+]+)/g)) bump(fonts, m[1].replace(/\+/g, ' '), f.path)
    if (/^\s*family:\s*([A-Z][\w ]+)$/m.test(s) && /pubspec\.yaml$/.test(f.path)) for (const m of s.matchAll(/^\s*-?\s*family:\s*([A-Z][\w ]+)$/gm)) bump(fonts, m[1].trim(), f.path)
    if (distinct.size >= 5 && (TOKENS.test(f.path) || distinct.size >= 12)) tokenFiles.push({ path: f.path, colors: distinct.size })
  }
  const top = (m, k) => [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, k).map(([v, e]) => ({ value: v, uses: e.n, in: [...e.files] }))

  const featureDirs = new Map()
  for (const f of source) {
    const m = f.path.match(/(?:^|\/)(?:features?|screens?|pages?|modules?|scenes?)\/([^/]+)\//i) || f.path.match(/^app\/\(?([^/)]+)\)?\//)
    if (m) featureDirs.set(m[1], (featureDirs.get(m[1]) ?? 0) + 1)
  }

  const out = {
    root,
    kind,
    stack: [...new Set(stack)],
    counts: { files: all.length, source: source.length, docs: docs.length, images: images.length, videos: videos.length, sourceKB: Math.round(source.reduce((n, f) => n + f.size, 0) / 1024) },
    readFirst: usable.filter((f) => ANCHOR.test(f.path) && f.size < 400_000 && !/^(android|ios|macos|windows|linux|web)\//.test(f.path) && !/^assets\//.test(f.path)).sort(byDepth).slice(0, 25).map((f) => f.path),
    designTokenFiles: tokenFiles.sort((a, b) => b.colors - a.colors).slice(0, 12),
    colors: top(colors, 30),
    fonts: top(fonts, 12),
    copyFiles: source.filter((f) => COPY.test(f.path)).sort(byDepth).slice(0, 40).map((f) => `${f.path} (${kb(f.size)})`),
    features: [...featureDirs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => `${k} (${n} files)`),
    screens: source.filter((f) => SCREENS.test(f.path) && /\.(dart|kt|swift|tsx|jsx|vue|svelte|astro|html)$/i.test(f.path)).sort(byDepth).slice(0, 150).map((f) => f.path),
    docs: docs.slice(0, 80).map((f) => `${f.path} (${kb(f.size)})`),
    images: images.sort((a, b) => b.size - a.size).slice(0, 150).map((f) => {
      const d = imageSize(join(root, f.path))
      return `${f.path} ${d ? `${d[0]}×${d[1]}` : '?'} ${kb(f.size)}`
    }),
    videos: videos.slice(0, 30).map((f) => `${f.path} (${kb(f.size)})`),
  }
  return out
}
const byDepth = (a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path)
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`)

// ── find: product folders on this computer ──────────────────────────────────
// Only folder names, marker files and the first lines of a manifest or README are read. Nothing leaves the machine.
const FIND_ROOTS = ['Documents', 'Developer', 'Projects', 'projects', 'Code', 'code', 'dev', 'Dev', 'src', 'repos', 'Repos', 'workspace', 'Workspace', 'GitHub', 'github', 'git', 'Sites', 'Desktop', 'IdeaProjects', 'AndroidStudioProjects', 'StudioProjects', 'source/repos', 'Work', 'work']
const FIND_SKIP = new Set([...SKIP_DIR, 'Library', 'Applications', 'Pictures', 'Music', 'Movies', 'Downloads', 'Public', 'node_modules', 'Pods', 'Carthage', 'site-packages', 'android', 'ios', 'macos', 'windows', 'linux', 'web'])
const MARKERS = [
  [/^pubspec\.yaml$/, 'Flutter/Dart'], [/^Package\.swift$|\.xcodeproj$|\.xcworkspace$/, 'Swift/iOS'], [/^(settings|build)\.gradle(\.kts)?$/, 'Kotlin/Android'],
  [/^package\.json$/, 'JavaScript'], [/^Cargo\.toml$/, 'Rust'], [/^go\.mod$/, 'Go'], [/^(pyproject\.toml|requirements\.txt|setup\.py)$/, 'Python'],
  [/^composer\.json$/, 'PHP'], [/^Gemfile$/, 'Ruby'], [/\.(csproj|sln)$/, '.NET'], [/^(PRODUCT|BRIEF|PITCH|VISION)\.md$/i, 'Docs'],
]
function firstLine(text) {
  for (const raw of text.split('\n')) {
    const l = raw.replace(/<[^>]+>/g, '').replace(/[*_`>#]/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').trim()
    if (l.length > 25 && !/^(badge|build|license|npm|version|table of contents)/i.test(l) && !/^[-=|:\s]+$/.test(l)) return l.length > 140 ? `${l.slice(0, 137)}…` : l
  }
  return ''
}
function describeProject(dir, names) {
  const read = (n) => { try { return readFileSync(join(dir, n), 'utf8').slice(0, 20000) } catch { return '' } }
  const stack = [...new Set(MARKERS.filter(([re]) => names.some((n) => re.test(n))).map(([, v]) => v))]
  let name = basename(dir), description = ''
  if (names.includes('package.json')) {
    try {
      const j = JSON.parse(read('package.json'))
      const d = { ...j.dependencies, ...j.devDependencies }
      const fw = [['expo', 'Expo/React Native'], ['react-native', 'React Native'], ['next', 'Next.js'], ['nuxt', 'Nuxt'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['astro', 'Astro'], ['electron', 'Electron'], ['react', 'React']].find(([k]) => d?.[k])
      if (fw) stack.splice(stack.indexOf('JavaScript'), 1, fw[1])
      if (j.workspaces) stack.push('monorepo')
      if (j.name && !/^(root|monorepo|app|workspace)$/i.test(j.name)) name = j.name
      description = j.description || ''
    } catch {}
  }
  if (names.includes('pubspec.yaml')) {
    const y = read('pubspec.yaml')
    name = y.match(/^name:\s*(.+)$/m)?.[1].trim() || name
    description = y.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1] || description
  }
  if (!description) {
    const readme = names.find((n) => /^(readme|product|brief|pitch)\.(md|mdx|txt|rst)$/i.test(n))
    if (readme) description = firstLine(read(readme))
  }
  // Last worked on: the git ref log or index when there is one, else the newest top-level entry.
  let last = 0
  for (const g of ['.git/logs/HEAD', '.git/index', '.git/FETCH_HEAD']) try { last = Math.max(last, statSync(join(dir, g)).mtimeMs) } catch {}
  if (!last) for (const n of names) try { last = Math.max(last, statSync(join(dir, n)).mtimeMs) } catch {}
  let remote = ''
  try { remote = readFileSync(join(dir, '.git/config'), 'utf8').match(/url\s*=\s*(\S+)/)?.[1].replace(/^git@([^:]+):/, 'https://$1/').replace(/\/\/[^@/]+@/, '//').replace(/\.git$/, '') || '' } catch {}
  return { name, path: dir, stack: stack.length ? stack : ['git'], description, lastActive: last ? new Date(last).toISOString().slice(0, 10) : null, remote, _t: last }
}
function findProjects(roots, maxDepth, limit) {
  const home = homedir()
  const starts = roots.length ? roots.map((r) => resolve(r)) : [process.cwd(), ...FIND_ROOTS.map((r) => join(home, r))]
  const seen = new Set(), found = []
  let visited = 0
  const queue = starts.filter((r) => existsSync(r)).map((r) => [r, 0])
  while (queue.length && visited < 30000) {
    const [dir, depth] = queue.shift()
    if (seen.has(dir)) continue
    seen.add(dir); visited++
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { continue }
    const names = entries.map((e) => e.name)
    const isProject = names.includes('.git') || MARKERS.some(([re]) => names.some((n) => re.test(n)))
    if (isProject && dir !== home) { found.push(describeProject(dir, names)); continue } // a product's own subfolders belong to it
    if (depth >= maxDepth) continue
    for (const e of entries)
      if (e.isDirectory() && !e.name.startsWith('.') && !FIND_SKIP.has(e.name) && !/\.(app|photoslibrary|bundle|framework)$/.test(e.name)) queue.push([join(dir, e.name), depth + 1])
  }
  // A folder inside another found product (e.g. a cwd inside a repo) collapses into the outer one.
  const uniq = found.filter((p) => !found.some((q) => q !== p && p.path.startsWith(q.path + '/')))
  uniq.sort((a, b) => b._t - a._t)
  return { searched: starts.filter((r) => existsSync(r)), count: uniq.length, projects: uniq.slice(0, limit).map(({ _t, ...p }) => p) }
}

// ── commands ────────────────────────────────────────────────────────────────
async function main() {
  if (cmd === 'doctor') {
    const node = Number(process.versions.node.split('.')[0])
    const browser = findBrowser()
    const ff = ffmpegPath()
    console.log(JSON.stringify({ node: process.versions.node, nodeOk: node >= 22, browser, ffmpeg: ff, ready: node >= 22 && !!browser, videoReady: node >= 22 && !!browser && !!ff }, null, 2))
    if (node < 22) log('Node 22 or newer is required (built-in WebSocket).')
    if (!browser) log('Install Google Chrome (or Chromium/Edge), or set SHIPCAST_CHROME.')
    if (!ff) log('Video needs ffmpeg: macOS `brew install ffmpeg`, Windows `winget install ffmpeg`, Linux `sudo apt install ffmpeg`.')
    return
  }
  if (cmd === 'formats') {
    const list = pos[0] ? [format(pos[0])] : FORMATS
    console.log(JSON.stringify(list, null, 2))
    return
  }
  if (cmd === 'find') {
    console.log(JSON.stringify(findProjects(pos, Number(opt.depth ?? 4), Number(opt.limit ?? 25)), null, 2))
    return
  }
  if (cmd === 'inventory') {
    console.log(JSON.stringify(inventory(pos[0] || '.'), null, 2))
    return
  }
  if (cmd === 'check') {
    const f = format(opt.format)
    const r = await check(pos[0], f)
    console.log(JSON.stringify(r, null, 2))
    process.exitCode = r.ok ? 0 : 2
    return
  }
  if (cmd === 'render') {
    const f = format(opt.format)
    if (!opt.out) die('--out <file.png> is required')
    const png = await withPage(pos[0], f, async (p) => {
      if (opt.at !== undefined) await p.freeze(Number(opt.at))
      else await p.settle()
      if (opt.preview) writePreview(opt.preview, await p.jpeg(f.width, f.height, previewScale(f.width, f.height)))
      return p.png(f.width, f.height)
    })
    mkdirSync(dirname(resolve(opt.out)), { recursive: true })
    writeFileSync(opt.out, png)
    console.log(resolve(opt.out))
    return
  }
  if (cmd === 'frames') {
    const f = format(opt.format)
    const dir = opt['out-dir'] || die('--out-dir is required')
    mkdirSync(dir, { recursive: true })
    const times = opt.at ? String(opt.at).split(',').map(Number) : sampleTimes(f)
    const done = await withPage(pos[0], f, async (p) => {
      const out = []
      for (const t of times) {
        await p.freeze(t)
        const file = join(dir, `${basename(pos[0], extname(pos[0]))}-${t.toFixed(1)}s.png`)
        writeFileSync(file, await p.png(f.width, f.height))
        out.push(resolve(file))
      }
      return out
    })
    console.log(done.join('\n'))
    return
  }
  if (cmd === 'video') {
    const f = format(opt.format)
    if (!opt.out) die('--out <file.mp4> is required')
    const ff = ffmpegPath()
    if (!ff) die('ffmpeg is required for video: macOS `brew install ffmpeg`, Windows `winget install ffmpeg`, Linux `sudo apt install ffmpeg`.')
    const fps = Number(opt.fps || 30)
    const duration = Number(opt.duration || f.duration || 15)
    const total = Math.round(duration * fps)
    const tmp = mkdtempSync(join(tmpdir(), 'shipcast-frames-'))
    const started = Date.now()
    try {
      await withPage(pos[0], f, async (p) => {
        for (let i = 0; i < total; i++) {
          await p.freeze(i / fps)
          writeFileSync(join(tmp, `f${String(i).padStart(5, '0')}.png`), await p.png(f.width, f.height))
          if (i % fps === 0) process.stderr.write(`\rrecording ${Math.round((i / total) * 100)}%`)
        }
      })
      process.stderr.write('\rencoding…        \n')
      mkdirSync(dirname(resolve(opt.out)), { recursive: true })
      const args = ['-y', '-v', 'error', '-framerate', String(fps), '-i', join(tmp, 'f%05d.png')]
      if (opt.audio) args.push('-i', opt.audio, '-c:a', 'aac', '-b:a', '160k', '-shortest')
      args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', opt.out)
      const r = spawnSync(ff, args, { stdio: 'inherit' })
      if (r.status !== 0) die('ffmpeg failed to encode the video.')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
    log(`${total} frames in ${Math.round((Date.now() - started) / 1000)}s`)
    console.log(resolve(opt.out))
    return
  }
  if (cmd === 'sheet') {
    if (!opt.out || !pos.length) die('usage: sheet <png...> --out sheet.png [--cols 3]')
    const cols = Number(opt.cols || Math.min(pos.length, 3))
    const width = 1800
    const cell = Math.floor((width - 40 - (cols - 1) * 20) / cols)
    const dims = pos.map((p) => imageSize(resolve(p)) || [1080, 1350])
    const rows = Math.ceil(pos.length / cols)
    let height = 40
    for (let r = 0; r < rows; r++) height += Math.max(...dims.slice(r * cols, r * cols + cols).map(([w, h]) => (h / w) * cell)) + 56
    height = Math.ceil(height)
    const html = `<!doctype html><html><head><style>html,body{margin:0;background:#111;font:600 20px system-ui;color:#ddd}
#canvas{width:${width}px;height:${height}px;padding:20px;box-sizing:border-box;display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:20px;align-content:start}
figure{margin:0}img{width:${cell}px;display:block;border-radius:6px}figcaption{margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style></head>
<body><div id="canvas">${pos.map((p) => `<figure><img src="${pathToFileURL(resolve(p)).href}"><figcaption>${basename(p)}</figcaption></figure>`).join('')}</div></body></html>`
    const tmp = join(mkdtempSync(join(tmpdir(), 'shipcast-sheet-')), 'sheet.html')
    writeFileSync(tmp, html)
    const f = { id: 'sheet', width, height, safe: { top: 0, right: 0, bottom: 0, left: 0 } }
    const png = await withPage(tmp, f, async (p) => {
      if (opt.preview) writePreview(opt.preview, await p.jpeg(width, height, previewScale(width, height)))
      return p.png(width, height)
    })
    mkdirSync(dirname(resolve(opt.out)), { recursive: true })
    writeFileSync(opt.out, png)
    rmSync(dirname(tmp), { recursive: true, force: true })
    console.log(resolve(opt.out))
    return
  }
  if (cmd === 'open') {
    const dir = resolve(pos[0] || '.')
    if (!existsSync(dir)) die(`no such folder: ${dir}`)
    const app = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'explorer' : 'xdg-open'
    spawn(app, [dir], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref()
    console.log(dir)
    return
  }
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  if (cmd) process.exitCode = 1
}

main().catch((e) => die(e?.stack || String(e)))
