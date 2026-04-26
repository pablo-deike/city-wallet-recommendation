import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import ContextBar from '../ContextBar'
import { WALLET_INTENT_MAX } from '../../../lib/walletPreferences'

const mountedTrees = []

function click(element) {
  act(() => {
    element.click()
  })
}

function typeInto(input, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

  act(() => {
    valueSetter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function mountContextBar(overrideProps = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const root = createRoot(container)
  let props = {
    mode: 'ai',
    onModeChange: () => {},
    typedIntent: '',
    onTypedIntentChange: () => {},
    status: 'ai',
    fallbackReason: null,
    onReset: () => {},
    voiceState: 'supported-idle',
    onToggleListening: () => {},
    restrictedCategory: null,
    ...overrideProps,
  }

  function render(nextProps = {}) {
    props = { ...props, ...nextProps }

    act(() => {
      root.render(<ContextBar {...props} />)
    })
  }

  render()
  mountedTrees.push({ container, root })

  return {
    container,
    rerender: render,
  }
}

function queryVoiceButton(container, label) {
  return container.querySelector(`button[aria-label="${label}"]`)
}

afterEach(() => {
  while (mountedTrees.length > 0) {
    const { container, root } = mountedTrees.pop()

    act(() => {
      root.unmount()
    })

    container.remove()
  }
})

describe('ContextBar', () => {
  it('keeps the demo chips visible and renders the AI controls', () => {
    const { container } = mountContextBar()

    expect(container.textContent).toContain('🌧️ 11°C · Overcast')
    expect(container.textContent).toContain('📍 Stuttgart Altstadt')
    expect(container.textContent).toContain('🕐 12:43 · Tuesday')

    const input = container.querySelector('#wallet-typed-intent')
    const toggle = container.querySelector('button[aria-label="Toggle personalization mode"]')
    const status = container.querySelector('[role="status"]')
    const reset = container.querySelector('button[aria-label="Reset personalization controls"]')

    expect(input).not.toBeNull()
    expect(input.getAttribute('placeholder')).toBe('What are you up to?')
    expect(input.maxLength).toBe(WALLET_INTENT_MAX)
    expect(toggle.textContent).toBe('AI mode')
    expect(status.textContent).toBe('AI')
    expect(reset).toBeNull()
  })

  it('emits typed intent changes through the controlled input callback', () => {
    const onTypedIntentChange = vi.fn()
    const { container } = mountContextBar({ onTypedIntentChange })

    const input = container.querySelector('#wallet-typed-intent')
    typeInto(input, 'Quiet patio coffee')

    expect(onTypedIntentChange).toHaveBeenCalledWith('Quiet patio coffee')
  })

  it('toggles between AI and off mode through the callback', () => {
    const onModeChange = vi.fn()
    const { container, rerender } = mountContextBar({ mode: 'ai', onModeChange })

    click(container.querySelector('button[aria-label="Toggle personalization mode"]'))
    expect(onModeChange).toHaveBeenLastCalledWith('off')

    rerender({ mode: 'off' })

    click(container.querySelector('button[aria-label="Toggle personalization mode"]'))
    expect(onModeChange).toHaveBeenLastCalledWith('ai')
  })

  it('renders distinct status pill copy for ai, fallback, and off states', () => {
    const { container, rerender } = mountContextBar({ status: 'ai' })

    expect(container.querySelector('[role="status"]').textContent).toBe('AI')

    rerender({ status: 'fallback', fallbackReason: 'runtime-unavailable' })
    expect(container.querySelector('[role="status"]').textContent).toBe('Local fallback · runtime unavailable')

    rerender({ status: 'off', fallbackReason: null })
    expect(container.querySelector('[role="status"]').textContent).toBe('Off')
  })

  it('renders voice controls with supported, listening, and unsupported labels', () => {
    const { container, rerender } = mountContextBar({ voiceState: 'supported-idle' })

    const idleButton = queryVoiceButton(container, 'Toggle voice intent')
    expect(idleButton).not.toBeNull()
    expect(idleButton.disabled).toBe(false)

    rerender({ voiceState: 'listening' })

    const listeningButton = queryVoiceButton(container, 'Stop voice intent')
    expect(listeningButton).not.toBeNull()
    expect(listeningButton.getAttribute('aria-pressed')).toBe('true')

    rerender({ voiceState: 'unsupported' })

    const unsupportedButton = queryVoiceButton(container, 'Voice intent unsupported')
    expect(unsupportedButton).not.toBeNull()
    expect(unsupportedButton.disabled).toBe(true)
    expect(unsupportedButton.getAttribute('aria-disabled')).toBe('true')
  })

  it('calls onToggleListening when the mic button is clicked', () => {
    const onToggleListening = vi.fn()
    const { container } = mountContextBar({ onToggleListening, voiceState: 'supported-idle' })

    click(queryVoiceButton(container, 'Toggle voice intent'))

    expect(onToggleListening).toHaveBeenCalledTimes(1)
  })

  it('renders the guardrail note only for restricted alcohol intents', () => {
    const { container, rerender } = mountContextBar({
      restrictedCategory: { category: 'alcohol', matchedTerm: 'spritz' },
    })

    const guardrail = container.querySelector('[data-testid="intent-guardrail"]')
    expect(guardrail).not.toBeNull()
    expect(guardrail.textContent).toBe("Demo: please drink responsibly. We don't verify age.")

    rerender({ restrictedCategory: null })

    expect(container.querySelector('[data-testid="intent-guardrail"]')).toBeNull()
  })

  it('shows and triggers reset only when state differs from defaults', () => {
    const onReset = vi.fn()
    const { container, rerender } = mountContextBar({ onReset })

    expect(container.querySelector('button[aria-label="Reset personalization controls"]')).toBeNull()

    rerender({ typedIntent: 'After-work spritz' })

    const reset = container.querySelector('button[aria-label="Reset personalization controls"]')
    expect(reset).not.toBeNull()

    click(reset)
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
