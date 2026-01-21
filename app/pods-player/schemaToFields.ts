import type { FormField } from '#pods-player/formMapper'

/**
 * pods-player-layer.app.pods-player.schemaToFields
 *
 * Fallback: derive a simple YAML-like `FormField[]` from a JSON Schema.
 *
 * This is important for the CMS, where v1 PodPacks may ship schemas but not
 * YAML “fields” definitions. It lets the shared UI still render a usable Form tab.
 */

type JsonSchema = Record<string, any>

function labelFor(key: string, schema: JsonSchema): string {
  if (typeof schema.title === 'string' && schema.title.trim()) return schema.title
  return key
}

export function schemaToFields(schema: unknown): FormField[] {
  if (!schema || typeof schema !== 'object') return []
  const s = schema as JsonSchema
  const props = s.properties
  if (!props || typeof props !== 'object') return []

  const out: FormField[] = []
  for (const [key, propSchema] of Object.entries(props)) {
    if (!propSchema || typeof propSchema !== 'object') continue

    const type = (propSchema as any).type

    // Special-case geopoints: treat { lat: number, lng: number } as a single control.
    if (type === 'object' && (propSchema as any).properties) {
      const p = (propSchema as any).properties as Record<string, any>
      const latSchema = p?.lat
      const lngSchema = p?.lng
      const isLat = latSchema && (latSchema.type === 'number' || latSchema.type === 'integer')
      const isLng = lngSchema && (lngSchema.type === 'number' || lngSchema.type === 'integer')
      if (isLat && isLng) {
        out.push({ name: key, label: labelFor(key, propSchema as any), type: 'geopoint' } as any)
        continue
      }
    }

    if (type === 'object' && (propSchema as any).properties) {
      out.push({
        name: key,
        label: labelFor(key, propSchema as any),
        type: 'group',
        children: schemaToFields(propSchema),
      } as any)
      continue
    }

    if (type === 'boolean') {
      out.push({ name: key, label: labelFor(key, propSchema as any), type: 'toggle' } as any)
      continue
    }

    if (type === 'number' || type === 'integer') {
      out.push({ name: key, label: labelFor(key, propSchema as any), type: 'input-number' } as any)
      continue
    }

    if (type === 'string') {
      const format = (propSchema as any).format
      const isLong =
        format === 'textarea' ||
        (typeof (propSchema as any).description === 'string' && (propSchema as any).description.length > 120)
      out.push({
        name: key,
        label: labelFor(key, propSchema as any),
        type: isLong ? 'textarea' : 'input',
      } as any)
      continue
    }

    // Arrays and unknowns: treat as JSON input for now (v1).
    out.push({ name: key, label: labelFor(key, propSchema as any), type: 'input' } as any)
  }

  return out
}

