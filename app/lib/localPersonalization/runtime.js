export function probeLocalRuntime(options = {}) {
  if (globalThis.ai) {
    return {
      available: true,
      runtime: 'window-ai',
      reason: null,
    }
  }

  const runtimeUrl = typeof options.runtimeUrl === 'string' ? options.runtimeUrl.trim() : ''

  if (runtimeUrl) {
    return {
      available: true,
      runtime: 'localhost',
      reason: null,
    }
  }

  return {
    available: false,
    runtime: null,
    reason: 'no-local-runtime',
  }
}
