import type { Ref } from 'vue'

/**
 * pods-playground-layer.app.composables.pods-player.useDesignTokens
 *
 * A minimal “design tokens” bridge used by shared playground UI components.
 *
 * This intentionally focuses on color tokens because the playground’s YAML-driven
 * form fields (e.g., `color-select`, `brand-color-picker`) expect tokenized
 * colors to exist as CSS variables.
 *
 * The contract is intentionally tiny:
 * - `tokens.value.color["primary-500"] = "#RRGGBB"`
 * - `applyToDOM()` writes `--color-primary-500` vars to a target element
 */

type ColorTokenMap = Record<string, string>

const DEFAULT_GROUPS = ['primary', 'secondary', 'tertiary', 'quaternary', 'neutral'] as const
const DEFAULT_SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const

function readCssVar(el: HTMLElement, name: string): string | null {
  const v = getComputedStyle(el).getPropertyValue(name).trim()
  return v ? v : null
}

function buildColorTokensFromCssVars(el: HTMLElement): ColorTokenMap {
  const map: ColorTokenMap = {}
  for (const group of DEFAULT_GROUPS) {
    for (const shade of DEFAULT_SHADES) {
      const key = `${group}-${shade}`
      const cssVar = `--color-${key}`
      const value = readCssVar(el, cssVar)
      if (value) map[key] = value
    }
  }
  return map
}

export function useDesignTokens(target?: Ref<HTMLElement | null>) {
  const tokens = useState<{ color: ColorTokenMap }>('pods-player.tokens', () => ({ color: {} }))

  function refresh() {
    if (typeof window === 'undefined') return
    const el = target?.value ?? document.documentElement
    tokens.value.color = buildColorTokensFromCssVars(el)
  }

  function applyToDOM(colorTokens: ColorTokenMap, el?: HTMLElement | null) {
    if (typeof window === 'undefined') return
    const targetEl = el ?? target?.value ?? document.documentElement
    for (const [key, value] of Object.entries(colorTokens)) {
      targetEl.style.setProperty(`--color-${key}`, value)
    }
  }

  // Keep tokens hydrated for components that mount on the client.
  onMounted(refresh)

  return {
    tokens,
    refresh,
    applyToDOM,
  }
}

