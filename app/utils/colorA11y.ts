const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function normalizeHex(input: string): string | null {
  const value = String(input ?? '').trim()
  if (!HEX_RE.test(value)) return null
  if (value.length === 4) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toUpperCase()
  }
  return value.toUpperCase()
}

function luminance(hex: string): number {
  const normalized = normalizeHex(hex) ?? '#000000'
  const r = Number.parseInt(normalized.slice(1, 3), 16)
  const g = Number.parseInt(normalized.slice(3, 5), 16)
  const b = Number.parseInt(normalized.slice(5, 7), 16)

  const toLinear = (channel: number) => {
    const v = channel / 255
    if (v <= 0.03928) return v / 12.92
    return ((v + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function clampChannel(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function adjustHex(hex: string, ratio: number): string {
  const normalized = normalizeHex(hex) ?? '#000000'
  const r = Number.parseInt(normalized.slice(1, 3), 16)
  const g = Number.parseInt(normalized.slice(3, 5), 16)
  const b = Number.parseInt(normalized.slice(5, 7), 16)

  if (ratio >= 1) {
    return `#${clampChannel(r + (255 - r) * (ratio - 1)).toString(16).padStart(2, '0')}${clampChannel(g + (255 - g) * (ratio - 1)).toString(16).padStart(2, '0')}${clampChannel(b + (255 - b) * (ratio - 1)).toString(16).padStart(2, '0')}`.toUpperCase()
  }

  return `#${clampChannel(r * ratio).toString(16).padStart(2, '0')}${clampChannel(g * ratio).toString(16).padStart(2, '0')}${clampChannel(b * ratio).toString(16).padStart(2, '0')}`.toUpperCase()
}

export function isHexColor(value: string): boolean {
  return HEX_RE.test(String(value ?? '').trim())
}

export function contrastRatio(aHex: string, bHex: string): number {
  const a = luminance(aHex)
  const b = luminance(bHex)
  const top = Math.max(a, b)
  const bottom = Math.min(a, b)
  return (top + 0.05) / (bottom + 0.05)
}

export function ensureAaTextOnBackground(backgroundHex: string, preferredTextHex: string): string {
  if (contrastRatio(backgroundHex, preferredTextHex) >= 4.5) {
    return (normalizeHex(preferredTextHex) ?? preferredTextHex).toUpperCase()
  }

  const white = '#FFFFFF'
  const ink = '#111111'
  return contrastRatio(backgroundHex, white) >= contrastRatio(backgroundHex, ink) ? white : ink
}

export function ensureUiContrastOnBackground(
  backgroundHex: string,
  preferredHex: string,
  minRatio = 3,
): string {
  if (contrastRatio(backgroundHex, preferredHex) >= minRatio) {
    return (normalizeHex(preferredHex) ?? preferredHex).toUpperCase()
  }

  for (let step = 1; step <= 10; step++) {
    const amount = step * 0.05
    const lighter = adjustHex(preferredHex, 1 + amount)
    if (contrastRatio(backgroundHex, lighter) >= minRatio) return lighter

    const darker = adjustHex(preferredHex, 1 - amount)
    if (contrastRatio(backgroundHex, darker) >= minRatio) return darker
  }

  const white = '#FFFFFF'
  const ink = '#111111'
  return contrastRatio(backgroundHex, white) >= contrastRatio(backgroundHex, ink) ? white : ink
}
