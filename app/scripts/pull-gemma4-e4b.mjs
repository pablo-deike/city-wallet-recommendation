#!/usr/bin/env node

import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, rename, stat, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const DEFAULT_MODEL_URL =
  'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.task'
const DEFAULT_OUTPUT_PATH = resolve(
  import.meta.dirname,
  '../public/models/gemma-4-E4B-it-web.task',
)

const modelSource =
  process.env.GEMMA4_E4B_MODEL_SOURCE ||
  process.env.GEMMA4_E4B_MODEL_URL ||
  DEFAULT_MODEL_URL
const outputPath = resolve(process.env.GEMMA4_E4B_OUTPUT || DEFAULT_OUTPUT_PATH)
const partialPath = `${outputPath}.partial`

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'unknown size'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function buildHeaders() {
  const headers = new Headers()

  if (process.env.HF_TOKEN) {
    headers.set('Authorization', `Bearer ${process.env.HF_TOKEN}`)
  }

  return headers
}

function parseRemoteUrl(source) {
  try {
    const url = new URL(source)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function resolveLocalSource(source) {
  try {
    const url = new URL(source)

    if (url.protocol === 'file:') {
      return fileURLToPath(url)
    }
  } catch {
    return resolve(source)
  }

  return resolve(source)
}

function formatFetchFailure(error, url) {
  const cause = error?.cause
  const lines = [`Download failed while contacting ${url.hostname}.`]

  if (cause?.code) {
    lines.push(`Network cause: ${cause.code}`)
  }

  if (cause?.message) {
    lines.push(cause.message)
  }

  if (cause?.code === 'EAI_AGAIN' || cause?.code === 'ENOTFOUND') {
    lines.push(
      'The host could not be resolved from this machine. Check DNS/outbound network access, or set GEMMA4_E4B_MODEL_SOURCE to a local file or reachable mirror.',
    )
  } else if (cause?.code === 'ECONNRESET' || cause?.code === 'ETIMEDOUT') {
    lines.push('The connection dropped or timed out. Retry once network access is available.')
  }

  return lines.join('\n')
}

async function removePartialFile() {
  try {
    await unlink(partialPath)
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }
}

async function pullRemoteModel(url) {
  console.log(`Downloading Gemma 4 E4B web model from ${url.href}`)

  let response

  try {
    response = await fetch(url, {
      headers: buildHeaders(),
      redirect: 'follow',
    })
  } catch (error) {
    throw new Error(formatFetchFailure(error, url))
  }

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '')
    throw new Error(
      [
        `Download failed with HTTP ${response.status} ${response.statusText}`.trim(),
        'If this model is gated, accept the model terms in Hugging Face and set HF_TOKEN.',
        body.slice(0, 500),
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  const contentLength = Number(response.headers.get('content-length'))
  console.log(`Expected download size: ${formatBytes(contentLength)}`)

  await pipeline(response.body, createWriteStream(partialPath))
}

async function pullLocalModel(source) {
  const sourcePath = resolveLocalSource(source)
  const sourceFile = await stat(sourcePath)

  if (!sourceFile.isFile()) {
    throw new Error(`Local model source is not a file: ${sourcePath}`)
  }

  console.log(`Copying Gemma 4 E4B web model from ${sourcePath}`)
  console.log(`Expected copy size: ${formatBytes(sourceFile.size)}`)
  await copyFile(sourcePath, partialPath)
}

async function main() {
  await mkdir(dirname(outputPath), { recursive: true })
  await removePartialFile()

  console.log(`Writing to ${outputPath}`)

  const remoteUrl = parseRemoteUrl(modelSource)

  if (remoteUrl) {
    await pullRemoteModel(remoteUrl)
  } else {
    await pullLocalModel(modelSource)
  }

  await rename(partialPath, outputPath)

  const file = await stat(outputPath)
  console.log(`Installed ${formatBytes(file.size)} to ${outputPath}`)
}

main().catch(async (error) => {
  await removePartialFile().catch(() => {})
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
