import { describe, expect, it } from 'vitest'

import { collectAppSourceFiles } from '../privacyBoundary'

const FORBIDDEN_HOST_PATTERNS = [
  /(generativelanguage|gemini\.googleapis|googleapis\.com|api\.openai\.com|api\.anthropic\.com|cloudfunctions\.net|aiplatform)/i,
]
const FORBIDDEN_KEY_PATTERNS = [
  /AIza[0-9A-Za-z_-]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
]
const NETWORK_EGRESS_PATTERNS = [/fetch\(/, /new XMLHttpRequest/]
const LOCAL_BASE_PATTERN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/

function toGlobalRegex(pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  return new RegExp(pattern.source, flags)
}

function collectPatternViolations(files, patterns) {
  return files.flatMap(({ relPath, contents }) =>
    patterns.flatMap((pattern) =>
      Array.from(contents.matchAll(toGlobalRegex(pattern)), ([match]) => ({ relPath, match })),
    ),
  )
}

function collectEgressViolations(files) {
  return files.flatMap(({ relPath, contents }) =>
    NETWORK_EGRESS_PATTERNS.flatMap((pattern) =>
      relPath === 'api.js'
        ? []
        : Array.from(contents.matchAll(toGlobalRegex(pattern)), ([match]) => ({ relPath, match })),
    ),
  )
}

function formatViolations(violations) {
  return violations.map(({ relPath, match }) => `${relPath} :: ${JSON.stringify(match)}`).join('\n')
}

function assertNoViolations(label, violations) {
  if (violations.length > 0) {
    throw new Error(`${label}\n${formatViolations(violations)}`)
  }
}

function extractApiBase(files) {
  const apiFile = files.find((file) => file.relPath === 'api.js')

  if (!apiFile) {
    throw new Error('api.js :: missing source file for BASE guard')
  }

  const baseMatch = apiFile.contents.match(/const\s+BASE\s*=\s*(['"`])([^'"`]+)\1/)

  if (!baseMatch?.[2]) {
    throw new Error('api.js :: missing BASE constant literal')
  }

  return baseMatch[2]
}

describe('app privacy boundary guard', () => {
  it('rejects cloud AI hosts and API key literals anywhere under app source', () => {
    const files = collectAppSourceFiles()

    assertNoViolations(
      'Forbidden host literal detected in app source:',
      collectPatternViolations(files, FORBIDDEN_HOST_PATTERNS),
    )
    assertNoViolations(
      'Forbidden credential literal detected in app source:',
      collectPatternViolations(files, FORBIDDEN_KEY_PATTERNS),
    )
  })

  it('allows fetch and XMLHttpRequest only inside api.js', () => {
    const files = collectAppSourceFiles()

    assertNoViolations(
      'Network egress site detected outside api.js:',
      collectEgressViolations(files),
    )
  })

  it('pins api.js BASE to localhost-only http URLs', () => {
    const files = collectAppSourceFiles()
    const apiBase = extractApiBase(files)

    expect(apiBase).toMatch(LOCAL_BASE_PATTERN)
  })

  it('positive control: flags a synthetic cloud AI host leak', () => {
    const violations = collectPatternViolations(
      [
        {
          relPath: 'components/user/FutureLeak.jsx',
          contents: "const leak = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro'",
        },
      ],
      FORBIDDEN_HOST_PATTERNS,
    )

    expect(() => {
      assertNoViolations('Forbidden host literal detected in app source:', violations)
    }).toThrowError(/components\/user\/FutureLeak\.jsx :: "generativelanguage"/)
  })
})
