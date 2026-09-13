/**
 * pods-playground-layer.app.utils.colorA11y
 *
 * The contrast maths every colour control in this system measures with.
 *
 * One implementation on purpose. It was copied twice — byte for byte into
 * this repo's playground, and under different names into the CMS — and the
 * copies drifted on two points that matter: whether the returned hex is
 * normalised, and whether an unparseable input (a token key, a gradient)
 * yields black or NaN. Same function name, two answers, in one running app,
 * because Nuxt auto-import shadows one with the other.
 *
 * Hosts re-export from here through `#pods-player-color-a11y` rather than
 * keeping a copy. Accessibility is the last thing that should have three
 * answers.
 *
 * Hex and browser-computed RGB/RGBA are measured consistently. Translucent
 * colors use the lowest possible contrast over an unknown opaque backdrop;
 * unsupported CSS retains the existing black fallback.
 */
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function normalizeHex(input: string): string | null {
  const value = String(input ?? '').trim()
  const rgb = computedRgb(value)
  if (rgb?.alpha === 1) return `#${rgb.channels.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
  if (!HEX_RE.test(value)) return null
  if (value.length === 4) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toUpperCase()
  }
  return value.toUpperCase()
}

/** Browser-computed RGB/RGBA; unsupported CSS keeps the existing invalid-color policy. */
function computedRgb(input: string): { channels: number[]; alpha: number } | null {
  const match = input.trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i)
  if (!match) return null
  const channels = match.slice(1, 4).map(Number)
  const alpha = match[4] === undefined ? 1 : Number(match[4])
  return channels.every(value => Number.isFinite(value) && value >= 0 && value <= 255)
    && Number.isFinite(alpha) && alpha >= 0 && alpha <= 1 ? { channels, alpha } : null
}

/** The possible luminance interval over an unknown opaque backdrop. */
function luminanceRange(color: string): [number, number] {
  const rgb = computedRgb(color)
  if (!rgb || rgb.alpha === 1) {
    const value = luminance(color)
    return [value, value]
  }
  const over = (floor: number) => luminance(`#${rgb.channels.map(channel =>
    Math.round(channel * rgb.alpha + floor * (1 - rgb.alpha)).toString(16).padStart(2, '0'),
  ).join('')}`)
  return [over(0), over(255)]
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
  const [aMin, aMax] = luminanceRange(aHex)
  const [bMin, bMax] = luminanceRange(bHex)
  if (aMax < bMin) return (bMin + 0.05) / (aMax + 0.05)
  if (bMax < aMin) return (aMin + 0.05) / (bMax + 0.05)
  return 1
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
