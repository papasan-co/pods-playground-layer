/**
 * Shared pod-frame fact collector for Slice 0
 * (`freeze-pod-render-conformance-baselines`).
 *
 * This module is evidence infrastructure. It is never imported by the player at
 * runtime: it exists so CMS and Story Pods harnesses read the SAME render
 * semantics instead of each host inventing its own idea of what a pod frame is.
 * Hosts own chrome; this owns pod-frame facts.
 *
 * `collectPodFrameFacts` is written as one self-contained function with no
 * module-scope references so a browser driver can serialize it into the frame.
 */

const COLLECTOR_BUILD_SENTINEL = 'pod-render-conformance-collector-test-only-v1'
const collectorLoadProbe = globalThis as typeof globalThis & {
  __POD_RENDER_CONFORMANCE_COLLECTOR_LOADS__?: string[]
}
if (Array.isArray(collectorLoadProbe.__POD_RENDER_CONFORMANCE_COLLECTOR_LOADS__)) {
  collectorLoadProbe.__POD_RENDER_CONFORMANCE_COLLECTOR_LOADS__.push(COLLECTOR_BUILD_SENTINEL)
}

export type PodFrameKey = {
  key: string
  selector: string
}

export type PodFrameCollectorOptions = {
  /** Required semantic keys and the selector that resolves each one. */
  keys: PodFrameKey[]
  /** Governed CSS properties, supplied from the versioned style policy registry. */
  styleProperties: string[]
  /** Font shorthands passed to `document.fonts.check()`, e.g. `16px Inter`. */
  requiredFonts: string[]
  /** Theme custom properties read off the pod root, e.g. `--au-accent`. */
  themeVariables: string[]
  /** Regex sources; any matching substring is replaced before the fact leaves the frame. */
  redactPatterns: string[]
  /** Selector for the pod root inside the frame. */
  rootSelector: string
}

export type PodFramePseudoFact = {
  content: string
  backgroundColor: string
  borderTopColor: string
  width: string
  height: string
} | null

export type PodFrameKeyedFact = {
  key: string
  tag: string
  role: string | null
  text: string
  bounds: { x: number; y: number; width: number; height: number }
  styles: Record<string, string>
  before: PodFramePseudoFact
  after: PodFramePseudoFact
}

export type PodFrameFacts = {
  root: {
    width: number
    height: number
    backgroundColor: string
    overflowX: string
    overflowY: string
    writingMode: string
    direction: string
    fontSize: string
  }
  keyed: PodFrameKeyedFact[]
  fonts: { declared: string[]; loaded: Record<string, boolean> }
  effectiveFields: Record<string, string> | null
  effectiveTheme: Record<string, string> | null
  ownedAssets: { owner: string; kind: string; url: string }[]
  diagnostics: string[]
  requestCounts: { total: number; byKind: Record<string, number> }
}

/**
 * The collector deliberately returns `effectiveFields: null`: field values are
 * host state, not frame state. The host adapter fills them in where its surface
 * exposes them, and the comparator reports `not_scored` where it does not.
 */
export function collectPodFrameFacts(options: PodFrameCollectorOptions): PodFrameFacts {
  const redactors = options.redactPatterns.map((pattern) => new RegExp(pattern, 'gi'))
  const redact = (value: string): string =>
    redactors.reduce((current, matcher) => current.replace(matcher, '[redacted]'), value)
  const normalizeText = (value: string): string => redact(value.replace(/\s+/g, ' ').trim())

  const root = document.querySelector(options.rootSelector) ?? document.body
  const rootStyle = getComputedStyle(root)
  const rootRect = root.getBoundingClientRect()

  const readPseudo = (element: Element, pseudo: '::before' | '::after'): PodFramePseudoFact => {
    const style = getComputedStyle(element, pseudo)
    if (style.content === 'none' || style.content === '') return null
    return {
      content: redact(style.content),
      backgroundColor: style.backgroundColor,
      borderTopColor: style.borderTopColor,
      width: style.width,
      height: style.height,
    }
  }

  const keyed: PodFrameKeyedFact[] = []
  for (const entry of options.keys) {
    const element = root.querySelector(entry.selector) ?? document.querySelector(entry.selector)
    if (!element) continue

    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const styles: Record<string, string> = {}
    for (const property of options.styleProperties) {
      const value = style.getPropertyValue(property)
      if (value !== '') styles[property] = value.trim()
    }

    keyed.push({
      key: entry.key,
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role'),
      text: normalizeText(element.textContent ?? ''),
      bounds: {
        x: round(rect.x - rootRect.x),
        y: round(rect.y - rootRect.y),
        width: round(rect.width),
        height: round(rect.height),
      },
      styles,
      before: readPseudo(element, '::before'),
      after: readPseudo(element, '::after'),
    })
  }

  const loaded: Record<string, boolean> = {}
  for (const font of options.requiredFonts) {
    try {
      loaded[font] = document.fonts ? document.fonts.check(font) : false
    } catch {
      loaded[font] = false
    }
  }

  const effectiveTheme: Record<string, string> = {}
  for (const variable of options.themeVariables) {
    const value = rootStyle.getPropertyValue(variable).trim()
    if (value !== '') effectiveTheme[variable] = value
  }

  const ownedAssets = [...document.querySelectorAll('[data-pods-runtime-owner]')].map((node) => ({
    owner: node.getAttribute('data-pods-runtime-owner') ?? '',
    kind: node.getAttribute('data-pods-runtime-asset') ?? '',
    url: node instanceof HTMLLinkElement ? node.href : (node as HTMLScriptElement).src,
  }))

  const byKind: Record<string, number> = {}
  let total = 0
  for (const entry of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
    const kind = entry.initiatorType || 'other'
    byKind[kind] = (byKind[kind] ?? 0) + 1
    total += 1
  }

  return {
    root: {
      width: round(rootRect.width),
      height: round(rootRect.height),
      backgroundColor: rootStyle.backgroundColor,
      overflowX: rootStyle.overflowX,
      overflowY: rootStyle.overflowY,
      writingMode: rootStyle.writingMode,
      direction: rootStyle.direction,
      fontSize: rootStyle.fontSize,
    },
    keyed,
    fonts: {
      declared: [...new Set(options.requiredFonts)].sort(),
      loaded,
    },
    effectiveFields: null,
    effectiveTheme: Object.keys(effectiveTheme).length > 0 ? effectiveTheme : null,
    ownedAssets,
    diagnostics: [],
    requestCounts: { total, byKind },
  }

  function round(value: number): number {
    return Math.round(value * 100) / 100
  }
}

/**
 * Patterns the collector must never let out of the frame. Evidence bundles are
 * committed, so authentication and customer content are redacted at collection
 * time rather than filtered later.
 */
export const DEFAULT_REDACT_PATTERNS: readonly string[] = Object.freeze([
  'Bearer\\s+[A-Za-z0-9._~+/-]+=*',
  '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}',
  '(?:token|password|secret|api[_-]?key)["\'\\s:=]+[A-Za-z0-9._~+/-]{8,}',
])
