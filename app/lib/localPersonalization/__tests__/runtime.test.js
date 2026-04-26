import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { probeLocalRuntime } from '../runtime'

describe('probeLocalRuntime', () => {
  beforeEach(() => {
    delete globalThis.ai
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete globalThis.ai
  })

  it('returns no-local-runtime when no capability is present', () => {
    expect(probeLocalRuntime()).toEqual({
      available: false,
      runtime: null,
      reason: 'no-local-runtime',
    })
  })

  it('prefers the window ai runtime when available', () => {
    globalThis.ai = { run: vi.fn() }

    expect(probeLocalRuntime()).toEqual({
      available: true,
      runtime: 'window-ai',
      reason: null,
    })
  })

  it('accepts a configured localhost runtime without probing the network', () => {
    vi.stubGlobal('fetch', vi.fn())
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    expect(
      probeLocalRuntime({ runtimeUrl: 'http://localhost:11434' }),
    ).toEqual({
      available: true,
      runtime: 'localhost',
      reason: null,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not treat blank runtime URLs as capability', () => {
    expect(probeLocalRuntime({ runtimeUrl: '   ' })).toEqual({
      available: false,
      runtime: null,
      reason: 'no-local-runtime',
    })
  })
})
