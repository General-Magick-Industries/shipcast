#!/usr/bin/env node
// Build the Claude Desktop extension: copy the toolkit + guides from the plugin, then pack dist/shipcast.mcpb.
// Usage: node mcp/build.mjs   (needs npx; uses @anthropic-ai/mcpb)
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL = join(HERE, '..', 'skills', 'create')
const KIT = join(HERE, 'server', 'toolkit')

// One version for plugin and extension.
const version = JSON.parse(readFileSync(join(HERE, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version
const manifest = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'))
if (manifest.version !== version) { manifest.version = version; writeFileSync(join(HERE, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n') }

rmSync(KIT, { recursive: true, force: true })
mkdirSync(KIT, { recursive: true })
cpSync(join(SKILL, 'scripts'), join(KIT, 'scripts'), { recursive: true })
cpSync(join(SKILL, 'references'), join(KIT, 'references'), { recursive: true })

const env = { ...process.env, NODE_OPTIONS: '' }
const run = (args) => { const r = spawnSync('npx', ['-y', '@anthropic-ai/mcpb', ...args], { stdio: 'inherit', env }); if (r.status) process.exit(r.status) }
run(['validate', join(HERE, 'manifest.json')])
mkdirSync(join(HERE, 'dist'), { recursive: true })
run(['pack', HERE, join(HERE, 'dist', 'shipcast.mcpb')])
