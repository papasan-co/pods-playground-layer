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
 *
 * Tokens come from one of two places, in precedence order:
 * - an explicit source the host provides (`provideDesignTokens`) — the brand
 *   of whatever is being edited, stated by the application that knows it
 * - the CSS variables on the document, which is the playground's own world
 *
 * The DOM sniff was originally the only source, and inside a host CMS it
 * reads the host's chrome: a "Brand Colors" swatch row that shows the
 * editor's palette instead of the customer's. The explicit source exists so
 * a host can say whose brand the tokens are; when it says nothing, behaviour
 * is exactly as before.
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

/**
 * The host-stated token source. Shared app-wide: whoever is being edited has
 * exactly one brand at a time, and every picker on screen should agree on it.
 */
function explicitTokenSource() {
  return useState<ColorTokenMap | null>('pods-player.token-source', () => null)
}

/**
 * State whose brand the design tokens are.
 *
 * Call with the brand's color token map (`{"primary-500": "#213D71", ...}`)
 * when entering a surface that edits someone's content, and with `null` when
 * leaving it — a stale source would dress the next surface in the previous
 * customer's colours, which is worse than the DOM fallback ever was.
 */
export function provideDesignTokens(colorTokens: ColorTokenMap | null): void {
  const source = explicitTokenSource()
  source.value = colorTokens && Object.keys(colorTokens).length > 0 ? { ...colorTokens } : null

  // Consumers already mounted re-read immediately rather than on their next
  // refresh, so the swatches never show one brand while editing another.
  const tokens = useState<{ color: ColorTokenMap }>('pods-player.tokens', () => ({ color: {} }))
  if (source.value) {
    tokens.value.color = { ...source.value }
  } else if (typeof window !== 'undefined') {
    tokens.value.color = buildColorTokensFromCssVars(document.documentElement)
  }
}

export function useDesignTokens(target?: Ref<HTMLElement | null>) {
  const tokens = useState<{ color: ColorTokenMap }>('pods-player.tokens', () => ({ color: {} }))
  const source = explicitTokenSource()

  function refresh() {
    if (source.value) {
      tokens.value.color = { ...source.value }
      return
    }
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

