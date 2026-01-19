/**
 * pods-player-layer/app/pods-player/formMapper.ts
 *
 * Dot-path mapping between YAML form fields and a nested props payload.
 *
 * This is promoted from the `cms-story-components` playground, but implemented
 * without extra dependencies so both host apps can share it.
 */

export interface FormField {
  /**
   * Leaf fields must have a name. Layout primitives (group/row) may omit it.
   */
  name?: string
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

function isUiOnlyGroupName(name: string | undefined): boolean {
  return !!name && name.startsWith('__')
}

function joinPath(prefix: string, next: string): string {
  if (!prefix) return next
  return `${prefix}.${next}`
}

export function flatFromFixture(
  fields: FormField[],
  fixture: Record<string, unknown>,
  pathPrefix: string = '',
): Record<string, unknown> {
  const flat: Record<string, unknown> = {}

  for (const field of fields) {
    if (field.type === 'group' && field.children) {
      const groupName = field.name
      const nextPrefix = groupName && !isUiOnlyGroupName(groupName) ? joinPath(pathPrefix, groupName) : pathPrefix
      Object.assign(flat, flatFromFixture(field.children, fixture, nextPrefix))
      continue
    }

    if (field.type === 'row' && field.fields) {
      // Row is purely UI/layout; children read from the same fixture scope.
      Object.assign(flat, flatFromFixture(field.fields, fixture, pathPrefix))
      continue
    }

    if (field.type === 'repeater' && field.fields) {
      if (!field.name) continue
      const listPath = field.path || joinPath(pathPrefix, field.name)
      const provided = dotGet(fixture, listPath) as unknown[] | undefined
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
    if (!field.name) continue
    const fieldKey = field.name

    if (field.responsive) {
      const path = field.path || joinPath(pathPrefix, fieldKey)
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

    const path = field.path || joinPath(pathPrefix, fieldKey)
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

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const [k, v] of Object.entries(source)) {
    const existing = target[k]
    if (isRecord(existing) && isRecord(v)) {
      deepMerge(existing, v)
    } else {
      target[k] = v
    }
  }
}

export function rebuildPayload(fields: FormField[], flat: Record<string, unknown>, pathPrefix: string = ''): Record<string, unknown> {
  const nested: Record<string, unknown> = {}

  for (const field of fields) {
    if (field.type === 'group' && field.children) {
      const groupName = field.name
      const nextPrefix = groupName && !isUiOnlyGroupName(groupName) ? joinPath(pathPrefix, groupName) : pathPrefix
      const nestedGroup = rebuildPayload(field.children, flat, nextPrefix)
      deepMerge(nested, nestedGroup)
      continue
    }

    if (field.type === 'row' && field.fields) {
      for (const rowField of field.fields) {
        if (!rowField.name) continue
        if (flat[rowField.name] !== undefined) {
          const path = rowField.path || joinPath(pathPrefix, rowField.name)
          dotSet(nested, path, flat[rowField.name])
        }
      }
      continue
    }

    if (field.type === 'repeater' && field.fields) {
      if (!field.name) continue
      const value = flat[field.name] as unknown[]
      if (Array.isArray(value)) {
        const nestedRepeater = value.map((item) =>
          rebuildPayload(field.fields!, (item ?? {}) as Record<string, unknown>),
        )
        const listPath = field.path || joinPath(pathPrefix, field.name)
        dotSet(nested, listPath, nestedRepeater)
      }
      continue
    }

    if (!field.name) continue
    const path = field.path || joinPath(pathPrefix, field.name)
    if (flat[field.name] !== undefined) {
      dotSet(nested, path, flat[field.name])
    }
  }

  return nested
}

