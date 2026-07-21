import {
  flatFromFixture,
  rebuildPayload,
  type FormField,
} from './formMapper'

export type FormProjectionOperation =
  | { type: 'set'; path: string; value: unknown }
  | { type: 'unset'; path: string }

export type FormModelOperation =
  | { type: 'set'; path: string; value: unknown }
  | { type: 'unset'; path: string }

export type FormProjectionState = {
  fields: FormField[]
  base: Record<string, unknown>
  model: Record<string, unknown>
  operations: FormProjectionOperation[]
}

export type FormProjectionViewport = 'laptop' | 'tablet' | 'phone'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T
  }
  return value
}

function pathParts(path: string): string[] {
  return path.split('.').filter(Boolean)
}

function isIndex(part: string): boolean {
  return /^(0|[1-9]\d*)$/.test(part)
}

export function projectionGet(value: unknown, path: string): unknown {
  let current = value
  for (const part of pathParts(path)) {
    if (Array.isArray(current) && isIndex(part)) current = current[Number(part)]
    else if (isRecord(current)) current = current[part]
    else return undefined
  }
  return current
}

function setAtPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = pathParts(path)
  if (parts.length === 0) return

  let current: Record<string, unknown> | unknown[] = root
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    const nextPart = parts[index + 1]
    const existing = Array.isArray(current) && isIndex(part)
      ? current[Number(part)]
      : (current as Record<string, unknown>)[part]
    const next = Array.isArray(existing) || isRecord(existing)
      ? existing
      : isIndex(nextPart) ? [] : {}

    if (Array.isArray(current) && isIndex(part)) current[Number(part)] = next
    else (current as Record<string, unknown>)[part] = next
    current = next
  }

  const last = parts[parts.length - 1]
  if (Array.isArray(current) && isIndex(last)) current[Number(last)] = clone(value)
  else (current as Record<string, unknown>)[last] = clone(value)
}

function unsetAtPath(root: Record<string, unknown>, path: string): void {
  const parts = pathParts(path)
  if (parts.length === 0) return

  let current: unknown = root
  for (const part of parts.slice(0, -1)) {
    if (Array.isArray(current) && isIndex(part)) current = current[Number(part)]
    else if (isRecord(current)) current = current[part]
    else return
  }

  const last = parts[parts.length - 1]
  if (Array.isArray(current) && isIndex(last)) current.splice(Number(last), 1)
  else if (isRecord(current)) Reflect.deleteProperty(current, last)
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => valuesEqual(item, right[index]))
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => key in right && valuesEqual(left[key], right[key]))
  }
  return false
}

function diffValues(
  before: unknown,
  after: unknown,
  path = '',
  operations: FormProjectionOperation[] = [],
): FormProjectionOperation[] {
  if (valuesEqual(before, after)) return operations

  if (Array.isArray(before) && Array.isArray(after)) {
    const sharedLength = Math.min(before.length, after.length)
    for (let index = 0; index < sharedLength; index += 1) {
      diffValues(before[index], after[index], path ? `${path}.${index}` : String(index), operations)
    }
    for (let index = sharedLength; index < after.length; index += 1) {
      operations.push({ type: 'set', path: path ? `${path}.${index}` : String(index), value: clone(after[index]) })
    }
    for (let index = before.length - 1; index >= after.length; index -= 1) {
      operations.push({ type: 'unset', path: path ? `${path}.${index}` : String(index) })
    }
    return operations
  }

  if (isRecord(before) && isRecord(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const childPath = path ? `${path}.${key}` : key
      if (!(key in after)) operations.push({ type: 'unset', path: childPath })
      else if (!(key in before)) operations.push({ type: 'set', path: childPath, value: clone(after[key]) })
      else diffValues(before[key], after[key], childPath, operations)
    }
    return operations
  }

  if (path) operations.push({ type: 'set', path, value: clone(after) })
  return operations
}

function replay(
  base: Record<string, unknown>,
  operations: FormProjectionOperation[],
): Record<string, unknown> {
  const payload = clone(base)
  for (const operation of operations) {
    if (operation.type === 'set') setAtPath(payload, operation.path, operation.value)
    else unsetAtPath(payload, operation.path)
  }
  return payload
}

/** Hydrate an immutable base plus the editable model exposed to form controls. */
export function hydrateFormProjection(
  fields: FormField[],
  payload: Record<string, unknown>,
): FormProjectionState {
  const base = clone(payload)
  return {
    fields: clone(fields),
    base,
    model: clone(flatFromFixture(fields, base)),
    operations: [],
  }
}

/** Apply an operation expressed in canonical payload coordinates. */
export function applyFormProjectionOperation(
  state: FormProjectionState,
  operation: FormProjectionOperation,
): FormProjectionState {
  const operations = [...state.operations, clone(operation)]
  const payload = replay(state.base, operations)
  return {
    ...state,
    model: clone(flatFromFixture(state.fields, payload)),
    operations,
  }
}

const UNSET_SENTINEL = Symbol('form-projector-unset')

/**
 * Apply an operation expressed in form-model coordinates and translate only
 * its semantic difference into sparse canonical payload operations.
 */
export function applyFormModelOperation(
  state: FormProjectionState,
  operation: FormModelOperation,
): FormProjectionState {
  const beforeModel = clone(state.model)
  const afterModel = clone(state.model)
  const beforePayload = rebuildPayload(state.fields, beforeModel)
  let translated: FormProjectionOperation[] = []

  if (operation.type === 'set') {
    setAtPath(afterModel, operation.path, operation.value)
    const sentinelModel = clone(beforeModel)
    setAtPath(sentinelModel, operation.path, UNSET_SENTINEL)
    const sentinelPaths = findSentinelPaths(rebuildPayload(state.fields, sentinelModel))
    translated = sentinelPaths.map((path) => ({ type: 'set', path, value: operation.value }))
  } else {
    const sentinelModel = clone(beforeModel)
    setAtPath(sentinelModel, operation.path, UNSET_SENTINEL)
    const sentinelPayload = rebuildPayload(state.fields, sentinelModel)
    translated = findSentinelPaths(sentinelPayload).map((path) => ({ type: 'unset', path }))
    unsetAtPath(afterModel, operation.path)
  }

  if (translated.length === 0) {
    translated = resolveCanonicalModelPaths(state.fields, operation.path).map((path) =>
      operation.type === 'set'
        ? { type: 'set' as const, path, value: operation.value }
        : { type: 'unset' as const, path },
    )
  }

  if (translated.length === 0) {
    translated = diffValues(beforePayload, rebuildPayload(state.fields, afterModel))
  }

  return {
    ...state,
    model: afterModel,
    operations: [...state.operations, ...translated],
  }
}

/** Reconcile a whole control model while still emitting only sparse payload differences. */
export function reconcileFormProjectionModel(
  state: FormProjectionState,
  model: Record<string, unknown>,
): FormProjectionState {
  let next = state
  for (const operation of diffModelValues(state.model, model)) {
    next = applyFormModelOperation(next, operation)
  }
  return next
}

function diffModelValues(
  before: unknown,
  after: unknown,
  path = '',
  operations: FormModelOperation[] = [],
): FormModelOperation[] {
  if (valuesEqual(before, after)) return operations
  if (!Array.isArray(before) && Array.isArray(after)) {
    if (after.length === 0 && path) operations.push({ type: 'set', path, value: [] })
    after.forEach((item, index) => {
      diffModelValues(undefined, item, path ? `${path}.${index}` : String(index), operations)
    })
    return operations
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const sharedLength = Math.min(before.length, after.length)
    for (let index = 0; index < sharedLength; index += 1) {
      diffModelValues(before[index], after[index], path ? `${path}.${index}` : String(index), operations)
    }
    for (let index = sharedLength; index < after.length; index += 1) {
      diffModelValues(undefined, after[index], path ? `${path}.${index}` : String(index), operations)
    }
    for (let index = before.length - 1; index >= after.length; index -= 1) {
      operations.push({ type: 'unset', path: path ? `${path}.${index}` : String(index) })
    }
    return operations
  }
  if (!isRecord(before) && isRecord(after)) {
    const entries = Object.entries(after)
    if (entries.length === 0 && path) operations.push({ type: 'set', path, value: {} })
    for (const [key, value] of entries) {
      diffModelValues(undefined, value, path ? `${path}.${key}` : key, operations)
    }
    return operations
  }
  if (isRecord(before) && isRecord(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const childPath = path ? `${path}.${key}` : key
      if (!(key in after)) operations.push({ type: 'unset', path: childPath })
      else if (!(key in before)) operations.push({ type: 'set', path: childPath, value: after[key] })
      else diffModelValues(before[key], after[key], childPath, operations)
    }
    return operations
  }
  if (path) operations.push({ type: 'set', path, value: after })
  return operations
}

function resolveCanonicalModelPaths(fields: FormField[], modelPath: string): string[] {
  const modelParts = pathParts(modelPath)

  function resolve(
    nestedFields: FormField[],
    remaining: string[],
    payloadPrefix = '',
    explicitPathsAreAbsolute = true,
  ): string[] {
    const paths: string[] = []
    for (const field of nestedFields) {
      if (field.type === 'group' && field.children) {
        if (field.name && !isUiOnlyGroupName(field.name)) {
          if (remaining[0] !== field.name) continue
          const groupPath = field.path
            ? explicitPathsAreAbsolute ? field.path : joinPath(payloadPrefix, field.path)
            : joinPath(payloadPrefix, field.name)
          if (remaining.length === 1) paths.push(groupPath)
          else paths.push(...resolve(field.children, remaining.slice(1), groupPath, explicitPathsAreAbsolute))
        } else {
          paths.push(...resolve(field.children, remaining, payloadPrefix, explicitPathsAreAbsolute))
        }
        continue
      }

      if (field.type === 'row' && field.fields) {
        paths.push(...resolve(field.fields, remaining, payloadPrefix, explicitPathsAreAbsolute))
        continue
      }

      if (field.type === 'repeater' && field.fields && field.name) {
        if (remaining[0] !== field.name) continue
        const listPath = field.path
          ? explicitPathsAreAbsolute ? field.path : joinPath(payloadPrefix, field.path)
          : joinPath(payloadPrefix, field.name)
        if (remaining.length === 1) {
          paths.push(listPath)
          continue
        }
        const itemIndex = remaining[1]
        if (!isIndex(itemIndex)) continue
        const itemPath = joinPath(listPath, itemIndex)
        if (remaining.length === 2) paths.push(itemPath)
        else paths.push(...resolve(field.fields, remaining.slice(2), itemPath, false))
        continue
      }

      if (!field.name || remaining.length !== 1 || remaining[0] !== field.name) continue
      const fieldPath = field.path || field.name
      paths.push(field.path && explicitPathsAreAbsolute
        ? field.path
        : joinPath(payloadPrefix, fieldPath))
    }
    return paths
  }

  return [...new Set(resolve(fields, modelParts))]
}

function findSentinelPaths(value: unknown, path = '', paths: string[] = []): string[] {
  if (value === UNSET_SENTINEL) {
    if (path) paths.push(path)
    return paths
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSentinelPaths(item, path ? `${path}.${index}` : String(index), paths))
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      findSentinelPaths(item, path ? `${path}.${key}` : key, paths)
    }
  }
  return paths
}

/** Serialize by replaying sparse operations over the immutable hydrated base. */
export function serializeFormProjection(state: FormProjectionState): Record<string, unknown> {
  return replay(state.base, state.operations)
}

function isUiOnlyGroupName(name: string | undefined): boolean {
  return Boolean(name?.startsWith('__'))
}

function joinPath(prefix: string, name: string): string {
  return prefix ? `${prefix}.${name}` : name
}

function responsiveValue(value: unknown, viewport: FormProjectionViewport): unknown {
  if (!isRecord(value)) return value
  const key = viewport === 'laptop' ? 'desktop' : viewport
  return key in value ? value[key] : value
}

/** Project responsive fields for rendering without mutating their canonical objects. */
export function projectFormViewport(
  payload: Record<string, unknown>,
  fields: FormField[],
  viewport: FormProjectionViewport,
): Record<string, unknown> {
  const projected = clone(payload)

  function visit(target: Record<string, unknown>, nestedFields: FormField[], prefix = ''): void {
    for (const field of nestedFields) {
      if (field.type === 'group' && field.children) {
        const nextPrefix = field.name && !isUiOnlyGroupName(field.name)
          ? joinPath(prefix, field.name)
          : prefix
        visit(target, field.children, nextPrefix)
      } else if (field.type === 'row' && field.fields) {
        visit(target, field.fields, prefix)
      } else if (field.type === 'repeater' && field.fields && field.name) {
        const listPath = field.path || joinPath(prefix, field.name)
        const items = projectionGet(target, listPath)
        if (Array.isArray(items)) {
          items.forEach((item) => {
            if (isRecord(item)) visit(item, field.fields ?? [])
          })
        }
      } else if (field.responsive && field.name) {
        const path = field.path || joinPath(prefix, field.name)
        const value = projectionGet(target, path)
        if (value !== undefined) setAtPath(target, path, responsiveValue(value, viewport))
      }
    }
  }

  visit(projected, fields)
  return projected
}

function isS3KeyLike(value: string): boolean {
  const trimmed = value.trim()
  return Boolean(trimmed)
    && !/^(https?:|data:|blob:|\/)/.test(trimmed)
}

export function normalizePersistedMediaValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return isS3KeyLike(trimmed) ? { s3Key: trimmed } : value
  }
  if (!isRecord(value)) return value

  const normalized: Record<string, unknown> = {}
  const mediaId = typeof value.mediaId === 'string'
    ? value.mediaId.trim()
    : typeof value.media_id === 'string' ? value.media_id.trim() : ''
  const s3Key = typeof value.s3Key === 'string'
    ? value.s3Key.trim()
    : typeof value.src === 'string' && isS3KeyLike(value.src) ? value.src.trim() : ''

  if (mediaId) normalized.mediaId = mediaId
  if (s3Key) normalized.s3Key = s3Key
  for (const key of ['alt', 'provider', 'format', 'srcset', 'sizes'] as const) {
    if (typeof value[key] === 'string' && value[key].trim()) normalized[key] = value[key]
  }
  if (typeof value.decorative === 'boolean') normalized.decorative = value.decorative
  if (typeof value.quality === 'number') normalized.quality = value.quality
  for (const key of ['focalPoint', 'crop', 'modifiers', 'metadata'] as const) {
    if (isRecord(value[key])) normalized[key] = clone(value[key])
  }
  return Object.keys(normalized).length ? normalized : value
}

/** Normalize only schema-declared media fields immediately before persistence. */
export function normalizeFormMediaForPersistence(
  payload: Record<string, unknown>,
  fields: FormField[],
): Record<string, unknown> {
  const normalized = clone(payload)

  function visit(target: Record<string, unknown>, nestedFields: FormField[], prefix = ''): void {
    for (const field of nestedFields) {
      if (field.type === 'group' && field.children) {
        const nextPrefix = field.name && !isUiOnlyGroupName(field.name)
          ? joinPath(prefix, field.name)
          : prefix
        visit(target, field.children, nextPrefix)
      } else if (field.type === 'row' && field.fields) {
        visit(target, field.fields, prefix)
      } else if (field.type === 'repeater' && field.fields && field.name) {
        const listPath = field.path || joinPath(prefix, field.name)
        const items = projectionGet(target, listPath)
        if (Array.isArray(items)) {
          items.forEach((item) => {
            if (isRecord(item)) visit(item, field.fields ?? [])
          })
        }
      } else if (field.type === 'medias' && field.name) {
        const path = field.path || joinPath(prefix, field.name)
        const value = projectionGet(target, path)
        if (value !== undefined) setAtPath(target, path, normalizePersistedMediaValue(value))
      }
    }
  }

  visit(normalized, fields)
  return normalized
}
