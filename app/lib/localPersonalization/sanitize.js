function clampText(value, maxChars) {
  return Array.from(value).slice(0, maxChars).join('')
}

function stripAngleBrackets(value) {
  return value.replace(/[<>]/g, '')
}

function collapseInlineWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim()
}

export function safeString(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : fallback
}

export function boundHeadline(value) {
  const sanitized = stripAngleBrackets(safeString(value, '')).replace(/\r\n?/g, '\n')
  const lines = sanitized
    .split(/\n+/)
    .map((line) => collapseInlineWhitespace(line))
    .filter(Boolean)

  if (lines.length === 0) {
    return ''
  }

  const collapsed =
    lines.length === 1 ? lines[0] : `${lines[0]}\n${lines.slice(1).join(' ')}`.trim()

  return clampText(collapsed, 80)
}

export function boundReason(value) {
  const sanitized = stripAngleBrackets(safeString(value, '')).replace(/\r\n?/g, ' ')
  return clampText(collapseInlineWhitespace(sanitized), 140)
}

export function boundEmoji(value) {
  const [first = ''] = Array.from(stripAngleBrackets(safeString(value, '')))
  return first
}
