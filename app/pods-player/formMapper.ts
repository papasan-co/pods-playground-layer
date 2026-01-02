/**
 * pods-player-layer/app/pods-player/formMapper.ts
 *
 * Dot-path mapping between YAML form fields and a nested props payload.
 *
 * This is promoted from the `cms-story-components` playground, but implemented
 * without extra dependencies so both host apps can share it.
 */

export interface FormField {
  name: string
  path?: string
  type: string
  children?: FormField[]
  fields?: FormField[]
  fixture?: Record<string, unknown>
  default?: unknown
  responsive?: boolean
  value?: { desktop?: unknown; tablet?: unknown; phone?: unknown }
  when?:
    | { field: string; equals: unknown }
    | Array<{ field: string; equals: unknown }>
  [key: string]: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function dotGet(obj: unknown, path: string): unknown {
  if (!isRecord(obj)) return undefined
  if (!path) return undefined
  const parts = path.split('.')
  let cur: unknown = obj
  for (const part of parts) {
    if (!isRecord(cur)) return undefined
    cur = cur[part]
  }
  return cur
}

function dotSet(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.')
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    const next = cur[key]
    if (!isRecord(next)) cur[key] = {}
    cur = cur[key] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]] = value
}

export function flatFromFixture(
  fields: FormField[],
  fixture: Record<string, unknown>,
  prefix: string = '',
): Record<string, unknown> {
  const flat: Record<string, unknown> = {}

  for (const field of fields) {
    const fieldKey = prefix ? `${prefix}.${field.name}` : field.name

    if (field.type === 'group' && field.children) {
      const provided = dotGet(fixture, field.name) as Record<string, unknown> | undefined
      const nestedFixture = {
        ...(field.fixture ?? {}),
        ...(provided ?? {}),
      }
      flat[field.name] = flatFromFixture(field.children, nestedFixture)
      continue
    }

    if (field.type === 'row' && field.fields) {
      const parentFixture = prefix
        ? (dotGet(fixture, prefix) as Record<string, unknown> | undefined)
        : fixture

      const transformedFixture: Record<string, unknown> = {
        ...(field.fixture ?? {}),
        ...(parentFixture ?? {}),
      }

      if (Array.isArray(transformedFixture.center) && transformedFixture.center.length === 2) {
        transformedFixture.lng = Number(transformedFixture.center[0])
        transformedFixture.lat = Number(transformedFixture.center[1])
      }

      if (field.fields) {
        for (const nestedField of field.fields) {
          if (transformedFixture[nestedField.name] === undefined && nestedField.default !== undefined) {
            transformedFixture[nestedField.name] = nestedField.default
          }
        }
      }

      const rowFlat = flatFromFixture(field.fields, transformedFixture, '')
      Object.assign(flat, rowFlat)
      continue
    }

    if (field.type === 'repeater' && field.fields) {
      const provided = dotGet(fixture, field.name) as unknown[] | undefined
      if (Array.isArray(provided) && provided.length > 0) {
        flat[field.name] = provided.map((item) => flatFromFixture(field.fields!, (item ?? {}) as any))
      } else if (field.default !== undefined) {
        flat[field.name] = field.default
      } else {
        flat[field.name] = []
      }
      continue
    }

    // leaf
    if (field.responsive) {
      const path = field.path || fieldKey
      const value = dotGet(fixture, path)
      if (value !== undefined && isRecord(value)) {
        flat[field.name] = value
      } else if (field.value) {
        flat[field.name] = field.value
      } else {
        flat[field.name] = {
          desktop: field.default ?? '',
          tablet: field.default ?? '',
          phone: field.default ?? '',
        }
      }
      continue
    }

    const path = field.path || fieldKey
    const value = dotGet(fixture, path)

    if (value !== undefined) {
      flat[field.name] = field.type === 'number' ? Number(value) : value
    } else if (field.default !== undefined) {
      flat[field.name] = field.type === 'number' ? Number(field.default) : field.default
    } else if (field.type === 'toggle') {
      flat[field.name] = false
    } else if (field.type === 'repeater') {
      flat[field.name] = []
    } else if (field.type === 'input') {
      flat[field.name] = ''
    }
  }

  return flat
}

export function rebuildPayload(fields: FormField[], flat: Record<string, unknown>): Record<string, unknown> {
  const nested: Record<string, unknown> = {}

  for (const field of fields) {
    if (field.type === 'group' && field.children) {
      const value = flat[field.name] as Record<string, unknown>
      if (value) {
        const nestedGroup = rebuildPayload(field.children, value)
        dotSet(nested, field.name, nestedGroup)
      }
      continue
    }

    if (field.type === 'row' && field.fields) {
      for (const rowField of field.fields) {
        if (flat[rowField.name] !== undefined) {
          const path = rowField.path || rowField.name
          dotSet(nested, path, flat[rowField.name])
        }
      }
      continue
    }

    if (field.type === 'repeater' && field.fields) {
      const value = flat[field.name] as unknown[]
      if (Array.isArray(value)) {
        const nestedRepeater = value.map((item) =>
          rebuildPayload(field.fields!, (item ?? {}) as Record<string, unknown>),
        )
        dotSet(nested, field.name, nestedRepeater)
      }
      continue
    }

    const path = field.path || field.name
    if (flat[field.name] !== undefined) {
      dotSet(nested, path, flat[field.name])
    }
  }

  return nested
}

