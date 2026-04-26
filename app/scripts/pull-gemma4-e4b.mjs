#!/usr/bin/env node

import { createWriteStream } from 'node:fs'
import { mkdir, rename, stat, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'

const DEFAULT_MODEL_URL =
  'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.task'
const DEFAULT_OUTPUT_PATH = resolve(
  import.meta.dirname,
  '../public/models/gemma-4-E4B-it-web.task',
)

const modelUrl = process.env.GEMMA4_E4B_MODEL_URL || DEFAULT_MODEL_URL
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

function formatFetchFailure(error, url) {
  const host = new URL(url).hostname
  const cause = error?.cause
  const lines = [`Download failed while contacting ${host}.`]

  if (cause?.code) {
    lines.push(`Network cause: ${cause.code}`)
  }

  if (cause?.message) {
    lines.push(cause.message)
  }

  if (cause?.code === 'EAI_AGAIN' || cause?.code === 'ENOTFOUND') {
    lines.push(
      'The host could not be resolved from this machine. Check DNS/outbound network access, or set GEMMA4_E4B_MODEL_URL to a reachable mirror.',
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

async function main() {
  await mkdir(dirname(outputPath), { recursive: true })
  await removePartialFile()

  console.log(`Downloading Gemma 4 E4B web model from ${modelUrl}`)
  console.log(`Writing to ${outputPath}`)

  const response = await fetch(modelUrl, {
    headers: buildHeaders(),
    redirect: 'follow',
  })

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
  await rename(partialPath, outputPath)

  const file = await stat(outputPath)
  console.log(`Downloaded ${formatBytes(file.size)} to ${outputPath}`)
}

main().catch(async (error) => {
  await removePartialFile().catch(() => {})
  if (error instanceof Error && error.message === 'fetch failed') {
    console.error(formatFetchFailure(error, modelUrl))
  } else {
    console.error(error instanceof Error ? error.message : error)
  }
  process.exit(1)
})
