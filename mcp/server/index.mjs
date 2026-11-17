#!/usr/bin/env node
// Shipcast MCP server for Claude Desktop — zero dependencies, stdio JSON-RPC.
// Wraps the Shipcast toolkit (toolkit/scripts/shipcast.mjs) and adds the file access Claude Code has built in:
// reading the product (read-only, secrets blocked) and writing posts (only inside the Shipcast output folder).

import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { basename, delimiter, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const TOOLKIT = join(HERE, 'toolkit', 'scripts', 'shipcast.mjs')
const REFS = join(HERE, 'toolkit', 'references')
const VERSION = JSON.parse(readFileSync(join(HERE, '..', 'manifest.json'), 'utf8')).version
const HOME = homedir()
// Optional settings left blank in Claude Desktop can arrive empty or as an unfilled "${user_config.…}" placeholder.
const setting = (k) => { const v = process.env[k]?.trim(); return v && !v.includes('${') ? v : undefined }
const OUT_ROOT = resolve(expand(setting('SHIPCAST_OUTPUT') || join(HOME, 'Documents', 'Shipcast')))

function expand(p) { return String(p).replace(/^~(?=$|\/|\\)/, HOME) }

// Apps launched from the Dock get a short PATH; add the usual install locations so Chrome, ffmpeg and node are found.
const PATH = [process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', join(HOME, '.volta', 'bin'), join(HOME, '.local', 'bin')].filter(Boolean).join(delimiter)
const ENV = { ...process.env, PATH, NODE_OPTIONS: '' }
delete ENV.SHIPCAST_CHROME; delete ENV.SHIPCAST_FFMPEG
if (setting('SHIPCAST_CHROME_PATH')) ENV.SHIPCAST_CHROME = setting('SHIPCAST_CHROME_PATH')
if (setting('SHIPCAST_FFMPEG_PATH')) ENV.SHIPCAST_FFMPEG = setting('SHIPCAST_FFMPEG_PATH')

// The toolkit needs Node 22+ (built-in WebSocket). Use this runtime if it qualifies, else a system node.
// Inside Claude Desktop's built-in runtime, process.execPath is the Claude app itself, which may not be launched.
function nodeBinary() {
  if (!process.versions.electron && Number(process.versions.node.split('.')[0]) >= 22) return process.execPath
  const r = spawnSync(platform() === 'win32' ? 'where' : 'which', ['node'], { env: ENV, encoding: 'utf8' })
  for (const p of (r.stdout || '').split(/\r?\n/).filter(Boolean)) {
    const v = spawnSync(p, ['-p', 'process.versions.node'], { encoding: 'utf8' }).stdout?.trim()
    if (v && Number(v.split('.')[0]) >= 22) return p
  }
  return null
}
const NODE = nodeBinary()

function toolkit(args, timeoutMs = 10 * 60_000) {
  if (!NODE) return Promise.resolve({ ok: false, out: '', err: 'Shipcast needs Node.js 22 or newer installed on this computer (Claude Desktop’s built-in runtime can’t run the renderer). Install it from https://nodejs.org, then restart Claude.' })
  return new Promise((done) => {
    const p = spawn(NODE, [TOOLKIT, ...args], { env: ENV })
    let out = '', err = ''
    const t = setTimeout(() => p.kill(), timeoutMs)
    p.on('error', (e) => { clearTimeout(t); done({ ok: false, out: '', err: `could not start the Shipcast toolkit: ${e.message}` }) })
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => { clearTimeout(t); done({ ok: code === 0 || code === 2, code, out: out.trim(), err: err.trim() }) })
  })
}

// ── file access rules ───────────────────────────────────────────────────────
const SECRET = /(^|[\/\\])(\.env(\.[^\/\\]*)?|\.npmrc|\.netrc|\.pgpass|id_(rsa|dsa|ecdsa|ed25519)[^\/\\]*|[^\/\\]*\.(pem|key|p12|pfx|keystore|jks|mobileprovision|p8)|credentials[^\/\\]*|secrets?\.[a-z]+|\.dev\.vars|\.prod\.vars|[^\/\\]*\.cloudflare\.env)$/i
const SECRET_DIRS = ['.ssh', '.aws', '.gnupg', '.config/gh', '.docker', '.kube', 'Library/Keychains', 'Library/Cookies'].map((d) => join(HOME, d))
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.expo', 'Pods', 'vendor', 'coverage', '.turbo', '.wrangler', '.cache', 'DerivedData', '__pycache__', '.venv', 'venv', '.dart_tool', '.gradle', '.idea', '.vscode', '.svelte-kit', 'target'])
const IMG = /\.(png|jpe?g|webp|gif|svg)$/i

function readable(p) {
  const abs = resolve(expand(p))
  if (SECRET.test(abs) || SECRET_DIRS.some((d) => abs === d || abs.startsWith(d + sep))) throw new Error(`${p} looks like a secret or credentials file — Shipcast doesn't read those.`)
  if (!existsSync(abs)) throw new Error(`no such file or folder: ${abs}`)
  return abs
}
function writable(p) {
  const abs = resolve(OUT_ROOT, expand(p))
  if (abs !== OUT_ROOT && !abs.startsWith(OUT_ROOT + sep)) throw new Error(`Shipcast only writes inside its output folder (${OUT_ROOT}). Use a path inside the project folder from start_project.`)
  return abs
}
const inOut = (p) => { const abs = resolve(OUT_ROOT, expand(p)); return abs === OUT_ROOT || abs.startsWith(OUT_ROOT + sep) ? abs : readable(p) }
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'product'

// ── results ─────────────────────────────────────────────────────────────────
const text = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] })
const fail = (t) => ({ isError: true, content: [{ type: 'text', text: t }] })
const image = (file, note) => ({ content: [{ type: 'text', text: note }, { type: 'image', data: readFileSync(file).toString('base64'), mimeType: 'image/jpeg' }] })
const runText = (r) => (r.ok ? text(r.out || r.err) : fail(r.err || r.out || 'the toolkit failed'))
const previewPath = (png) => join(dirname(png), '.previews', `${basename(png, extname(png))}.jpg`)

// ── tools ───────────────────────────────────────────────────────────────────
const fmt = { type: 'string', description: 'Format id from the formats tool, e.g. instagram-feed, instagram-carousel, instagram-reel, tiktok-video, tiktok-photo, linkedin-image, linkedin-square, linkedin-video' }
const TOOLS = [
  { name: 'guide', title: 'Shipcast guide', description: 'The Shipcast workflow and its reference guides. Call with topic "workflow" before making any posts and follow it; call the other topics when the workflow says so.', inputSchema: { type: 'object', properties: { topic: { type: 'string', enum: ['workflow', 'reading', 'brief', 'platforms', 'design', 'motion', 'review', 'real-app'] } }, required: ['topic'] }, annotations: { readOnlyHint: true } },
  { name: 'doctor', title: 'Check setup', description: 'Check that Node, a Chrome/Chromium/Edge browser and ffmpeg (for video) are available.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'formats', title: 'Platform formats', description: 'Sizes, safe areas, caption rules and hashtag limits for each platform format. Never use sizes from memory.', inputSchema: { type: 'object', properties: { id: fmt } }, annotations: { readOnlyHint: true } },
  { name: 'find_products', title: 'Find products on this computer', description: 'List product folders on this computer (code repos and doc folders), most recently worked on first, with name, stack, one-line description and last activity. Reads only folder names, manifests and README first lines.', inputSchema: { type: 'object', properties: { folders: { type: 'array', items: { type: 'string' }, description: 'Folders to search instead of the usual project folders' } } }, annotations: { readOnlyHint: true } },
  { name: 'inventory', title: 'Map a product folder', description: 'Map a product folder: stack, files to read first, design tokens (exact colours and fonts), copy files, screens, docs, pictures and videos.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, annotations: { readOnlyHint: true } },
  { name: 'list_files', title: 'List files', description: 'List files in a folder (skips node_modules, build output and similar).', inputSchema: { type: 'object', properties: { path: { type: 'string' }, depth: { type: 'number', description: 'How deep to go, default 2, max 6' } }, required: ['path'] }, annotations: { readOnlyHint: true } },
  { name: 'read_file', title: 'Read a file', description: 'Read a text file from the product (code, docs, design tokens, copy). Secret and credential files are refused.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, start_line: { type: 'number' }, max_lines: { type: 'number', description: 'Default 800' } }, required: ['path'] }, annotations: { readOnlyHint: true } },
  { name: 'search', title: 'Search files', description: 'Search text files under a folder for a regular expression; returns file:line matches.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, pattern: { type: 'string' }, file_pattern: { type: 'string', description: 'Optional regex on file paths, e.g. \\.(ts|tsx)$' } }, required: ['path', 'pattern'] }, annotations: { readOnlyHint: true } },
  { name: 'view_image', title: 'Look at a picture', description: "Look at one of the product's pictures (screenshot, illustration, logo, icon).", inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, annotations: { readOnlyHint: true } },
  { name: 'start_project', title: 'Start a project folder', description: 'Create the output folder for this set of posts and return its path. Everything you write goes there.', inputSchema: { type: 'object', properties: { product: { type: 'string' }, format: fmt }, required: ['product', 'format'] } },
  { name: 'write_file', title: 'Write a file', description: 'Write a file (brief.md, plan.md, post HTML, captions.md) inside the Shipcast output folder.', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Absolute path inside the project folder' }, content: { type: 'string' } }, required: ['path', 'content'] }, annotations: { destructiveHint: false } },
  { name: 'copy_asset', title: 'Copy a picture into the project', description: "Copy one of the product's pictures or videos into the project's assets folder so the HTML can use it.", inputSchema: { type: 'object', properties: { from: { type: 'string' }, project: { type: 'string', description: 'The project folder from start_project' }, name: { type: 'string', description: 'Optional new file name' } }, required: ['from', 'project'] } },
  { name: 'check', title: 'Check a post', description: 'Find layout problems a viewer would see: text cut off, off-frame, overlapping, or under the platform\'s buttons.', inputSchema: { type: 'object', properties: { html: { type: 'string' }, format: fmt }, required: ['html', 'format'] }, annotations: { readOnlyHint: true } },
  { name: 'render', title: 'Render a post', description: 'Render a post HTML to a full-size PNG next to it and show you a preview to review.', inputSchema: { type: 'object', properties: { html: { type: 'string' }, format: fmt, at: { type: 'number', description: 'For video formats: the second to capture' } }, required: ['html', 'format'] } },
  { name: 'frames', title: 'Review video moments', description: 'Capture key moments of a video post and show them as one contact sheet.', inputSchema: { type: 'object', properties: { html: { type: 'string' }, format: fmt, at: { type: 'array', items: { type: 'number' }, description: 'Seconds to capture; default spreads across the video' } }, required: ['html', 'format'] } },
  { name: 'video', title: 'Export a video', description: 'Export a video post to MP4 (frame-accurate; needs ffmpeg). Takes about a minute for 15 seconds.', inputSchema: { type: 'object', properties: { html: { type: 'string' }, format: fmt, duration: { type: 'number' }, fps: { type: 'number' } }, required: ['html', 'format'] } },
  { name: 'sheet', title: 'Contact sheet', description: 'Put several rendered PNGs on one contact sheet and show it, to review a set together.', inputSchema: { type: 'object', properties: { images: { type: 'array', items: { type: 'string' } }, out: { type: 'string', description: 'Where to save the sheet PNG (inside the project)' } }, required: ['images', 'out'] } },
  { name: 'open_folder', title: 'Open the results', description: 'Open a project folder in Finder / Explorer so the user can see the files.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
]

const HANDLERS = {
  async guide({ topic }) {
    if (topic === 'workflow') return text(readFileSync(join(HERE, 'WORKFLOW.md'), 'utf8'))
    const f = join(REFS, `${topic}.md`)
    if (!existsSync(f)) return fail(`no guide called ${topic}`)
    return text(`(In this guide, "<toolkit> <command>" means the Shipcast tool of that name.)\n\n${readFileSync(f, 'utf8')}`)
  },
  async doctor() {
    const r = await toolkit(['doctor'])
    return text(`${r.out}\n${r.err}\n\nOutput folder: ${OUT_ROOT}`.trim())
  },
  async formats({ id }) { return runText(await toolkit(id ? ['formats', id] : ['formats'])) },
  async find_products({ folders = [] }) { return runText(await toolkit(['find', ...folders.map(expand)])) },
  async inventory({ path }) { return runText(await toolkit(['inventory', readable(path)])) },
  async list_files({ path, depth = 2 }) {
    const root = readable(path)
    const max = Math.min(6, Math.max(1, depth)), lines = []
    const walk = (dir, d) => {
      let entries = []
      try { entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)) } catch { return }
      for (const e of entries) {
        if (lines.length >= 1500) return
        if (SKIP.has(e.name) || (e.name.startsWith('.') && e.name !== '.github')) continue
        const p = join(dir, e.name)
        if (e.isDirectory()) { lines.push(`${relative(root, p)}/`); if (d < max) walk(p, d + 1) }
        else { let size = 0; try { size = statSync(p).size } catch {} lines.push(`${relative(root, p)}  ${size < 1024 ? `${size}B` : `${Math.round(size / 1024)}KB`}`) }
      }
    }
    walk(root, 1)
    return text(`${root}\n${lines.join('\n')}${lines.length >= 1500 ? '\n… (truncated — list a subfolder)' : ''}`)
  },
  async read_file({ path, start_line = 1, max_lines = 800 }) {
    const f = inOut(path)
    if (statSync(f).isDirectory()) return fail(`${f} is a folder — use list_files`)
    if (IMG.test(f) && !f.endsWith('.svg')) return fail('that is a picture — use view_image')
    if (statSync(f).size > 2_000_000) return fail('file is over 2 MB — read a smaller file or use search')
    const all = readFileSync(f, 'utf8').split('\n')
    const from = Math.max(1, start_line), to = Math.min(all.length, from - 1 + Math.min(max_lines, 3000))
    const body = all.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(5)}  ${l}`).join('\n')
    return text(`${f} (lines ${from}–${to} of ${all.length})\n${body}`)
  },
  async search({ path, pattern, file_pattern }) {
    const root = readable(path)
    let re, fre
    try { re = new RegExp(pattern, 'i'); fre = file_pattern ? new RegExp(file_pattern, 'i') : null } catch (e) { return fail(`bad pattern: ${e.message}`) }
    const hits = []
    const walk = (dir) => {
      let entries = []
      try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        if (hits.length >= 200) return
        if (SKIP.has(e.name) || e.name.startsWith('.')) continue
        const p = join(dir, e.name)
        if (e.isDirectory()) { walk(p); continue }
        if (SECRET.test(p) || IMG.test(p) || (fre && !fre.test(p))) continue
        let st; try { st = statSync(p) } catch { continue }
        if (st.size > 1_000_000) continue
        let s; try { s = readFileSync(p, 'utf8') } catch { continue }
        if (s.includes('\u0000')) continue
        s.split('\n').forEach((l, i) => { if (hits.length < 200 && re.test(l)) hits.push(`${relative(root, p)}:${i + 1}: ${l.trim().slice(0, 200)}`) })
      }
    }
    statSync(root).isDirectory() ? walk(root) : walk(dirname(root))
    return text(hits.length ? hits.join('\n') + (hits.length >= 200 ? '\n… (first 200 matches)' : '') : 'no matches')
  },
  async view_image({ path }) {
    const f = inOut(path)
    if (!IMG.test(f)) return fail('not a picture (png, jpg, webp, gif, svg)')
    const tmp = join(OUT_ROOT, '.previews', `view-${Date.now()}`)
    const r = await toolkit(['sheet', f, '--out', `${tmp}.png`, '--cols', '1', '--preview', `${tmp}.jpg`])
    if (!r.ok || !existsSync(`${tmp}.jpg`)) return fail(r.err || 'could not open the picture')
    return image(`${tmp}.jpg`, f)
  },
  async start_project({ product, format: f }) {
    const day = new Date().toISOString().slice(0, 10)
    const dir = join(OUT_ROOT, `${day}-${slug(product)}-${slug(f)}`)
    mkdirSync(join(dir, 'assets'), { recursive: true })
    return text({ project: dir, assets: join(dir, 'assets') })
  },
  async write_file({ path, content }) {
    const f = writable(path)
    mkdirSync(dirname(f), { recursive: true })
    writeFileSync(f, content)
    return text(`saved ${f}`)
  },
  async copy_asset({ from, project, name }) {
    const src = readable(from)
    const dir = writable(join(project, 'assets'))
    mkdirSync(dir, { recursive: true })
    const dest = join(dir, name ? basename(name) : basename(src))
    copyFileSync(src, dest)
    return text({ copied: dest, use_in_html: `assets/${basename(dest)}` })
  },
  async check({ html, format: f }) { return runText(await toolkit(['check', inOut(html), '--format', f])) },
  async render({ html, format: f, at }) {
    const src = writable(html)
    const png = join(dirname(src), `${basename(src, extname(src))}.png`)
    const args = ['render', src, '--format', f, '--out', png, '--preview', previewPath(png)]
    if (at !== undefined) args.push('--at', String(at))
    const r = await toolkit(args)
    if (!r.ok) return fail(r.err || r.out)
    return image(previewPath(png), `Rendered ${png} — look at this preview and judge it against the review checklist.`)
  },
  async frames({ html, format: f, at }) {
    const src = writable(html)
    const dir = join(dirname(src), '.frames', basename(src, extname(src)))
    const args = ['frames', src, '--format', f, '--out-dir', dir]
    if (at?.length) args.push('--at', at.join(','))
    const r = await toolkit(args)
    if (!r.ok) return fail(r.err || r.out)
    const pngs = r.out.split('\n').filter(Boolean)
    const sheet = join(dir, 'sheet.png')
    const s = await toolkit(['sheet', ...pngs, '--out', sheet, '--cols', String(Math.min(5, pngs.length)), '--preview', previewPath(sheet)])
    if (!s.ok) return fail(s.err)
    return image(previewPath(sheet), `Frames: ${pngs.map((p) => basename(p)).join(', ')}`)
  },
  async video({ html, format: f, duration, fps }) {
    const src = writable(html)
    const mp4 = join(dirname(src), `${basename(src, extname(src))}.mp4`)
    const args = ['video', src, '--format', f, '--out', mp4]
    if (duration) args.push('--duration', String(duration))
    if (fps) args.push('--fps', String(fps))
    const r = await toolkit(args, 20 * 60_000)
    return r.ok ? text(`Saved ${mp4}\n${r.err.split('\n').pop()}`) : fail(r.err || r.out)
  },
  async sheet({ images, out }) {
    const dest = writable(out)
    const r = await toolkit(['sheet', ...images.map(inOut), '--out', dest, '--preview', previewPath(dest)])
    if (!r.ok) return fail(r.err || r.out)
    return image(previewPath(dest), `Contact sheet saved: ${dest}`)
  },
  async open_folder({ path }) {
    const p = inOut(path)
    const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'explorer' : 'xdg-open'
    spawn(cmd, [p], { detached: true, stdio: 'ignore' }).unref()
    return text(`opened ${p}`)
  },
}

const PROMPTS = [
  { name: 'create', title: 'Make social posts', description: 'Make Instagram, TikTok or LinkedIn posts about a product — images, carousels or videos.', arguments: [{ name: 'request', description: 'What to make, e.g. "3 Instagram posts about my app" or "a TikTok for our launch"', required: false }] },
]
const INSTRUCTIONS = 'Shipcast makes on-brand Instagram, TikTok and LinkedIn posts (images, carousels, videos) about a software product, from its own code, docs or notes. Before making any posts, call the guide tool with topic "workflow" and follow it step by step — it decides what to ask, what to read, and how every post is rendered, checked and reviewed.'

// ── JSON-RPC over stdio ─────────────────────────────────────────────────────
const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05']
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n')

async function handle(m) {
  const { id, method, params = {} } = m
  if (id === undefined) return // notifications
  try {
    if (method === 'initialize') {
      return send({ jsonrpc: '2.0', id, result: { protocolVersion: SUPPORTED.includes(params.protocolVersion) ? params.protocolVersion : SUPPORTED[0], capabilities: { tools: {}, prompts: {} }, serverInfo: { name: 'shipcast', title: 'Shipcast', version: VERSION }, instructions: INSTRUCTIONS } })
    }
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} })
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
    if (method === 'prompts/list') return send({ jsonrpc: '2.0', id, result: { prompts: PROMPTS } })
    if (method === 'prompts/get') {
      if (params.name !== 'create') throw Object.assign(new Error(`unknown prompt ${params.name}`), { code: -32602 })
      const req = params.arguments?.request?.trim()
      return send({ jsonrpc: '2.0', id, result: { description: PROMPTS[0].description, messages: [{ role: 'user', content: { type: 'text', text: `Use Shipcast to make social posts${req ? `: ${req}` : ' about my product'}. Start by calling the guide tool with topic "workflow" and follow it step by step.` } }] } })
    }
    if (method === 'tools/call') {
      const fn = HANDLERS[params.name]
      if (!fn) throw Object.assign(new Error(`unknown tool ${params.name}`), { code: -32602 })
      let result
      try { result = await fn(params.arguments || {}) } catch (e) { result = fail(e.message) }
      return send({ jsonrpc: '2.0', id, result })
    }
    throw Object.assign(new Error(`method not found: ${method}`), { code: -32601 })
  } catch (e) {
    send({ jsonrpc: '2.0', id, error: { code: e.code || -32603, message: e.message } })
  }
}

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (d) => {
  buf += d
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let m
    try { m = JSON.parse(line) } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); continue }
    handle(m)
  }
})
process.stdin.on('end', () => process.exit(0))
