#!/usr/bin/env node

import { spawn } from 'node:child_process'

function normalizeFilterArg(arg) {
  if (typeof arg !== 'string') {
    return arg
  }

  return arg.startsWith('app/') ? arg.slice('app/'.length) : arg
}

const args = process.argv.slice(2).map(normalizeFilterArg)
const vitestBin = new URL('../node_modules/vitest/vitest.mjs', import.meta.url)

const child = spawn(process.execPath, [vitestBin.pathname, ...args], {
  cwd: new URL('..', import.meta.url),
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
