import type { FormField } from './formMapper'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Return every explicitly governed hidden identity field for one repeater. */
export function repeaterIdentityFields(field: FormField): string[] {
  const ui = isRecord(field['x-ui']) ? field['x-ui'] : null
  const configured =
    ui && Array.isArray(ui.itemIdentities)
      ? ui.itemIdentities
      : ui && typeof ui.itemIdentity === 'string'
        ? [ui.itemIdentity]
        : []

  return [
    ...new Set(
      configured
        .filter((identity): identity is string => typeof identity === 'string')
        .map((identity) => identity.trim())
        .filter((identity) => /^_[a-z][a-z0-9_]*$/.test(identity)),
    ),
  ]
}

/** Mint a lowercase opaque DOM-safe identity for a newly inserted item. */
export function mintDesignItemIdentity(randomUuid?: () => string): string {
  const random =
    randomUuid?.() ??
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

  return `design-item-${random.toLowerCase()}`
}

/** Add a fresh identity to a cloned repeater blueprint without mutating it. */
export function identifyRepeaterBlueprint(
  field: FormField,
  blueprint: Record<string, unknown>,
  randomUuid?: () => string,
): Record<string, unknown> {
  const next = structuredClone(blueprint)
  for (const identityField of repeaterIdentityFields(field)) {
    next[identityField] = mintDesignItemIdentity(randomUuid)
  }

  return next
}
