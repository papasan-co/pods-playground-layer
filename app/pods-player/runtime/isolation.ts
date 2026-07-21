export type PodRuntimeSubjectType = 'story' | 'scene' | 'draft' | 'preview'
export type PodRuntimeRendererMode = 'artifact' | 'source'

export interface PodRuntimeIdentity {
  organizationId: string
  subjectType: PodRuntimeSubjectType
  subjectId: string
  packId: string
  releaseId: string
  manifestHash: string
  artifactRevision?: string
  podSlug: string
  rendererMode: PodRuntimeRendererMode
}

export const POD_RENDER_IDENTITY_CONTRACT = 'PodRenderIdentity.v1' as const

export type PodRenderIdentityContract = typeof POD_RENDER_IDENTITY_CONTRACT
export type PodRenderColorScheme = 'light' | 'dark'
export type PodRenderReducedMotion = 'no-preference' | 'reduce'

export interface PodRenderViewport {
  name: string
  width: number
  height: number
}

export interface PodRenderMediaMode {
  colorScheme: PodRenderColorScheme
  reducedMotion: PodRenderReducedMotion
}

export interface PodRenderIdentityInput extends PodRuntimeIdentity {
  contract: PodRenderIdentityContract
  selectionSequence: number
  schemaRevision: string
  fixtureRevision: string
  themeRevision: string
  fieldRevision: string
  layerCommits: Readonly<{
    'pods-playground-layer': string
    'scroll-runtime-layer': string
  }>
  viewport: Readonly<PodRenderViewport>
  devicePixelRatio: number
  mediaMode: Readonly<PodRenderMediaMode>
  packCssAssetSetVersion: string
}

export interface PodRenderIdentity extends PodRenderIdentityInput {
  readonly sessionFingerprint: string
  readonly renderFingerprint: string
}

export interface PodRuntimeContentRevisions {
  readonly manifest: string
  readonly pods: string
  readonly runtime: string
  readonly packStyles: readonly string[]
}

export interface PodRuntimeContentIdentity {
  readonly runtimeContentRevisions: Readonly<PodRuntimeContentRevisions>
  readonly packCssAssetSetVersion: string
}

export type RuntimeLayerName = 'pods-playground-layer' | 'scroll-runtime-layer'
export type RuntimeLayerSelectionMode = 'local' | 'remote'
export type RuntimeLayerIdentityEnforcement = 'diagnostic' | 'warning' | 'hard'

export interface RuntimeLayerDependencyDescriptor {
  readonly name: RuntimeLayerName
  readonly mode: RuntimeLayerSelectionMode
  readonly selected: string
  readonly requestedRef: string | null
  readonly resolvedCommit: string | null
  readonly expectedCommit: string | null
}

export interface RuntimeLayerIdentityDiagnostic {
  readonly code: 'runtime-layer-identity-missing' | 'runtime-layer-commit-mismatch'
  readonly layer: RuntimeLayerName
  readonly severity: RuntimeLayerIdentityEnforcement
  readonly message: string
}

export interface RuntimeLayerDependencyValidation {
  readonly valid: boolean
  readonly blocked: boolean
  readonly enforcement: RuntimeLayerIdentityEnforcement
  readonly diagnostics: readonly RuntimeLayerIdentityDiagnostic[]
}

export interface PodRenderTransactionIdentityInput {
  readonly runtimeIdentity: Readonly<PodRuntimeIdentity>
  readonly runtimeContentIdentity: PodRuntimeContentIdentity | null
  readonly schema: unknown
  readonly fixture: unknown
  readonly theme: unknown
  readonly fields: unknown
  readonly dependencies: readonly RuntimeLayerDependencyDescriptor[]
  readonly selectionSequence: number
  readonly viewport: Readonly<PodRenderViewport>
  readonly devicePixelRatio: number
  readonly mediaMode: Readonly<PodRenderMediaMode>
  readonly enforcement: RuntimeLayerIdentityEnforcement
}

export interface RenderIdentityCommitToken {
  readonly selectionSequence: number
  readonly sessionFingerprint: string
}

export interface StaleRenderIdentityDiagnostic {
  readonly code: 'stale-render-identity'
  readonly expectedSelectionSequence: number
  readonly observedSelectionSequence: number
  readonly expectedSessionFingerprint: string | null
  readonly observedSessionFingerprint: string
}

export interface RenderIdentityCommitGate {
  begin(selectionSequence: number): void
  activate(token: RenderIdentityCommitToken): boolean
  isCurrent(token: RenderIdentityCommitToken): boolean
  commit(token: RenderIdentityCommitToken, commit: () => void): boolean
  current(): Readonly<RenderIdentityCommitToken> | null
}

export const POD_RENDER_IDENTITY_FIELDS = [
  'contract',
  'organizationId',
  'subjectType',
  'subjectId',
  'packId',
  'releaseId',
  'manifestHash',
  'artifactRevision',
  'podSlug',
  'rendererMode',
  'selectionSequence',
  'schemaRevision',
  'fixtureRevision',
  'themeRevision',
  'fieldRevision',
  'layerCommits',
  'viewport',
  'devicePixelRatio',
  'mediaMode',
  'packCssAssetSetVersion',
] as const satisfies readonly (keyof PodRenderIdentityInput)[]

type MissingPodRenderIdentityField = Exclude<
  keyof PodRenderIdentityInput,
  (typeof POD_RENDER_IDENTITY_FIELDS)[number]
>
const allPodRenderIdentityFieldsAreGoverned: MissingPodRenderIdentityField extends never
  ? true
  : never = true
void allPodRenderIdentityFieldsAreGoverned

export const POD_RENDER_SESSION_IDENTITY_FIELDS = [...POD_RENDER_IDENTITY_FIELDS] as const

export const POD_RENDER_PEER_IDENTITY_FIELDS = [
  'contract',
  'packId',
  'releaseId',
  'manifestHash',
  'artifactRevision',
  'podSlug',
  'rendererMode',
  'schemaRevision',
  'fixtureRevision',
  'themeRevision',
  'fieldRevision',
  'layerCommits',
  'viewport',
  'devicePixelRatio',
  'mediaMode',
  'packCssAssetSetVersion',
] as const satisfies readonly (keyof PodRenderIdentityInput)[]

export type PodRenderIdentityFailureCode =
  | 'invalid-render-identity'
  | 'unsupported-render-identity'
  | 'unsupported-render-identity-value'

/** A privacy-safe identity construction failure that names fields, never values. */
export class PodRenderIdentityFailure extends Error {
  readonly code: PodRenderIdentityFailureCode
  readonly fields: string[]

  constructor(code: PodRenderIdentityFailureCode, message: string, fields: string[] = []) {
    super(message)
    this.name = 'PodRenderIdentityFailure'
    this.code = code
    this.fields = [...fields]
  }
}

function canonicalizeIdentityValue(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return JSON.stringify(value)
    throw new PodRenderIdentityFailure(
      'unsupported-render-identity-value',
      `Render identity value at ${path} is not a finite number.`,
      [path],
    )
  }
  if (typeof value !== 'object') {
    throw new PodRenderIdentityFailure(
      'unsupported-render-identity-value',
      `Render identity value at ${path} is not supported.`,
      [path],
    )
  }
  if (ancestors.has(value)) {
    throw new PodRenderIdentityFailure(
      'unsupported-render-identity-value',
      `Render identity value at ${path} is cyclic.`,
      [path],
    )
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return `[${value
        .map((entry, index) => canonicalizeIdentityValue(entry, `${path}[${index}]`, ancestors))
        .join(',')}]`
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new PodRenderIdentityFailure(
        'unsupported-render-identity-value',
        `Render identity value at ${path} is not a plain object.`,
        [path],
      )
    }
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalizeIdentityValue(record[key], `${path}.${key}`, ancestors)}`,
      )
      .join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
}

/** Hashes supported JSON-shaped input without retaining or returning its serialized value. */
export async function canonicalContentRevision(value: unknown): Promise<string> {
  const canonical = canonicalizeIdentityValue(value, '$', new WeakSet())
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new PodRenderIdentityFailure(
      'unsupported-render-identity-value',
      'Web Crypto SHA-256 is unavailable for render identity.',
    )
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return `sha256:${bytesToHex(new Uint8Array(digest))}`
}

function isSha256Revision(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value)
}

function isCommit(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{7,40}$/.test(value)
}

function validatePodRenderIdentity(input: PodRenderIdentityInput): void {
  if (input.contract !== POD_RENDER_IDENTITY_CONTRACT) {
    throw new PodRenderIdentityFailure(
      'unsupported-render-identity',
      'Unsupported pod render identity contract.',
      ['contract'],
    )
  }

  const invalidFields: string[] = []
  for (const field of [
    'organizationId',
    'subjectType',
    'subjectId',
    'packId',
    'releaseId',
    'manifestHash',
    'podSlug',
    'rendererMode',
  ] as const) {
    if (typeof input[field] !== 'string' || !input[field].trim()) invalidFields.push(field)
  }
  for (const field of [
    'schemaRevision',
    'fixtureRevision',
    'themeRevision',
    'fieldRevision',
  ] as const) {
    if (!isSha256Revision(input[field])) invalidFields.push(field)
  }
  if (input.artifactRevision !== undefined && !input.artifactRevision.trim()) {
    invalidFields.push('artifactRevision')
  }
  if (!Number.isSafeInteger(input.selectionSequence) || input.selectionSequence < 1) {
    invalidFields.push('selectionSequence')
  }
  if (!isCommit(input.layerCommits?.['pods-playground-layer'])) {
    invalidFields.push('layerCommits.pods-playground-layer')
  }
  if (!isCommit(input.layerCommits?.['scroll-runtime-layer'])) {
    invalidFields.push('layerCommits.scroll-runtime-layer')
  }
  if (
    !input.viewport?.name?.trim() ||
    !Number.isFinite(input.viewport?.width) ||
    input.viewport.width <= 0 ||
    !Number.isFinite(input.viewport?.height) ||
    input.viewport.height <= 0
  ) {
    invalidFields.push('viewport')
  }
  if (!Number.isFinite(input.devicePixelRatio) || input.devicePixelRatio <= 0) {
    invalidFields.push('devicePixelRatio')
  }
  if (!['light', 'dark'].includes(input.mediaMode?.colorScheme)) {
    invalidFields.push('mediaMode.colorScheme')
  }
  if (!['no-preference', 'reduce'].includes(input.mediaMode?.reducedMotion)) {
    invalidFields.push('mediaMode.reducedMotion')
  }
  if (!/^pack-css:v1:sha256:[a-f0-9]{64}$/.test(input.packCssAssetSetVersion)) {
    invalidFields.push('packCssAssetSetVersion')
  }

  if (invalidFields.length) {
    throw new PodRenderIdentityFailure(
      'invalid-render-identity',
      `Pod render identity has invalid required fields: ${invalidFields.join(', ')}.`,
      invalidFields,
    )
  }
}

function identityProjection(
  input: PodRenderIdentityInput,
  fields: readonly (keyof PodRenderIdentityInput)[],
): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => [field, field === 'artifactRevision' ? input[field] ?? null : input[field]]),
  )
}

/** Returns the mechanically governed cross-host projection for evidence consistency checks. */
export function podRenderPeerIdentityProjection(
  input: PodRenderIdentityInput,
): Record<string, unknown> {
  return identityProjection(input, POD_RENDER_PEER_IDENTITY_FIELDS)
}

/** Validates and fingerprints one canonical render identity envelope. */
export async function createPodRenderIdentity(
  input: PodRenderIdentityInput,
): Promise<Readonly<PodRenderIdentity>> {
  validatePodRenderIdentity(input)
  const sessionFingerprint = await canonicalContentRevision(
    identityProjection(input, POD_RENDER_SESSION_IDENTITY_FIELDS),
  )
  const renderFingerprint = await canonicalContentRevision(
    podRenderPeerIdentityProjection(input),
  )
  return Object.freeze({
    ...input,
    layerCommits: Object.freeze({ ...input.layerCommits }),
    viewport: Object.freeze({ ...input.viewport }),
    mediaMode: Object.freeze({ ...input.mediaMode }),
    sessionFingerprint,
    renderFingerprint,
  })
}

/** Builds a URL-independent pack stylesheet identity from authoritative content hashes. */
export async function packCssAssetSetVersion(contentHashes: readonly string[]): Promise<string> {
  const hashes = [...new Set(contentHashes)].sort()
  if (hashes.length === 0 || hashes.some((hash) => !isSha256Revision(hash))) {
    throw new PodRenderIdentityFailure(
      'invalid-render-identity',
      'Pack CSS identity requires authoritative SHA-256 content hashes.',
      ['packCssContentHashes'],
    )
  }
  return `pack-css:v1:${await canonicalContentRevision(hashes)}`
}

/** Validates and normalizes the immutable artifact revisions returned by a host adapter. */
export async function createPodRuntimeContentIdentity(
  revisions: PodRuntimeContentRevisions,
): Promise<PodRuntimeContentIdentity> {
  const invalidFields = (['manifest', 'pods', 'runtime'] as const)
    .filter((field) => !isSha256Revision(revisions[field]))
    .map((field) => `runtimeContentRevisions.${field}`)
  if (invalidFields.length) {
    throw new PodRenderIdentityFailure(
      'invalid-render-identity',
      `Pod runtime content identity has invalid required fields: ${invalidFields.join(', ')}.`,
      invalidFields,
    )
  }

  const packStyles = [...new Set(revisions.packStyles)].sort()
  const cssAssetSetVersion = await packCssAssetSetVersion(packStyles)
  return Object.freeze({
    runtimeContentRevisions: Object.freeze({
      manifest: revisions.manifest,
      pods: revisions.pods,
      runtime: revisions.runtime,
      packStyles: Object.freeze(packStyles),
    }),
    packCssAssetSetVersion: cssAssetSetVersion,
  })
}

function commitsMatch(first: string, second: string): boolean {
  return first === second || first.startsWith(second) || second.startsWith(first)
}

/** Validates the two runtime-layer selections without changing enforcement state. */
export function validateRuntimeLayerDependencies(
  dependencies: readonly RuntimeLayerDependencyDescriptor[],
  enforcement: RuntimeLayerIdentityEnforcement,
): RuntimeLayerDependencyValidation {
  const diagnostics: RuntimeLayerIdentityDiagnostic[] = []
  const byName = new Map(dependencies.map((dependency) => [dependency.name, dependency]))

  for (const layer of ['pods-playground-layer', 'scroll-runtime-layer'] as const) {
    const dependency = byName.get(layer)
    if (
      !dependency ||
      !dependency.selected.trim() ||
      !dependency.resolvedCommit ||
      !isCommit(dependency.resolvedCommit) ||
      !dependency.expectedCommit ||
      !isCommit(dependency.expectedCommit)
    ) {
      diagnostics.push({
        code: 'runtime-layer-identity-missing',
        layer,
        severity: enforcement,
        message: `${layer} requires selected, resolved, and expected dependency identity.`,
      })
      continue
    }
    if (!commitsMatch(dependency.resolvedCommit, dependency.expectedCommit)) {
      diagnostics.push({
        code: 'runtime-layer-commit-mismatch',
        layer,
        severity: enforcement,
        message: `${layer} resolved commit does not match the expected commit.`,
      })
    }
  }

  return Object.freeze({
    valid: diagnostics.length === 0,
    blocked: enforcement === 'hard' && diagnostics.length > 0,
    enforcement,
    diagnostics: Object.freeze(diagnostics),
  })
}

/** Builds the complete identity which must exist before an artifact render can mount. */
export async function createPodRenderTransactionIdentity(
  input: PodRenderTransactionIdentityInput,
): Promise<Readonly<PodRenderIdentity>> {
  if (!input.runtimeContentIdentity) {
    throw new PodRenderIdentityFailure(
      'invalid-render-identity',
      'A render transaction requires canonical runtime content identity.',
      ['runtimeContentIdentity'],
    )
  }
  if (input.schema === undefined) {
    throw new PodRenderIdentityFailure(
      'invalid-render-identity',
      'A render transaction requires a schema or compiled contract input.',
      ['schema'],
    )
  }

  const canonicalContent = await createPodRuntimeContentIdentity(
    input.runtimeContentIdentity.runtimeContentRevisions,
  )
  if (
    canonicalContent.packCssAssetSetVersion !==
    input.runtimeContentIdentity.packCssAssetSetVersion
  ) {
    throw new PodRenderIdentityFailure(
      'invalid-render-identity',
      'The declared pack CSS asset-set version does not match its content revisions.',
      ['packCssAssetSetVersion'],
    )
  }
  if (input.runtimeIdentity.manifestHash !== canonicalContent.runtimeContentRevisions.manifest) {
    throw new PodRenderIdentityFailure(
      'invalid-render-identity',
      'Runtime and content manifest revisions do not match.',
      ['manifestHash'],
    )
  }

  const dependencyValidation = validateRuntimeLayerDependencies(
    input.dependencies,
    input.enforcement,
  )
  if (!dependencyValidation.valid && input.enforcement !== 'diagnostic') {
    throw new PodRenderIdentityFailure(
      'invalid-render-identity',
      'Runtime layer dependencies do not match the expected commits.',
      ['runtimeLayerDependencies'],
    )
  }
  const dependencyByName = new Map(
    input.dependencies.map((dependency) => [dependency.name, dependency]),
  )

  const [schemaRevision, fixtureRevision, themeRevision, fieldRevision] = await Promise.all([
    canonicalContentRevision(input.schema),
    canonicalContentRevision(input.fixture),
    canonicalContentRevision(input.theme),
    canonicalContentRevision(input.fields),
  ])

  return createPodRenderIdentity({
    ...input.runtimeIdentity,
    contract: POD_RENDER_IDENTITY_CONTRACT,
    selectionSequence: input.selectionSequence,
    schemaRevision,
    fixtureRevision,
    themeRevision,
    fieldRevision,
    layerCommits: {
      'pods-playground-layer':
        dependencyByName.get('pods-playground-layer')?.resolvedCommit || '',
      'scroll-runtime-layer':
        dependencyByName.get('scroll-runtime-layer')?.resolvedCommit || '',
    },
    viewport: input.viewport,
    devicePixelRatio: input.devicePixelRatio,
    mediaMode: input.mediaMode,
    packCssAssetSetVersion: canonicalContent.packCssAssetSetVersion,
  })
}

/** Authorizes async commits with both monotonic selection order and canonical session identity. */
export function createRenderIdentityCommitGate(
  onDiscard: (diagnostic: StaleRenderIdentityDiagnostic) => void = () => {},
): RenderIdentityCommitGate {
  let selectionSequence = 0
  let active: Readonly<RenderIdentityCommitToken> | null = null

  const diagnostic = (token: RenderIdentityCommitToken): StaleRenderIdentityDiagnostic => ({
    code: 'stale-render-identity',
    expectedSelectionSequence: selectionSequence,
    observedSelectionSequence: token.selectionSequence,
    expectedSessionFingerprint: active?.sessionFingerprint || null,
    observedSessionFingerprint: token.sessionFingerprint,
  })
  const isCurrent = (token: RenderIdentityCommitToken) =>
    token.selectionSequence === selectionSequence &&
    active?.selectionSequence === token.selectionSequence &&
    active.sessionFingerprint === token.sessionFingerprint

  return {
    begin(nextSelectionSequence) {
      selectionSequence = nextSelectionSequence
      active = null
    },
    activate(token) {
      if (token.selectionSequence !== selectionSequence) {
        onDiscard(diagnostic(token))
        return false
      }
      active = Object.freeze({ ...token })
      return true
    },
    isCurrent,
    commit(token, commit) {
      if (!isCurrent(token)) {
        onDiscard(diagnostic(token))
        return false
      }
      commit()
      return true
    },
    current: () => active,
  }
}

export interface PodRuntimeSession {
  readonly key: string
  readonly identity: Readonly<PodRuntimeIdentity>
  readonly generation: number
  readonly selectionSequence: number
  readonly abortController: AbortController
}

function encodeIdentityPart(value: string | undefined): string {
  return encodeURIComponent(value || '-')
}

export function runtimeArtifactKey(identity: PodRuntimeIdentity): string {
  return [
    identity.packId,
    identity.releaseId,
    identity.manifestHash,
    identity.artifactRevision,
    identity.rendererMode,
  ]
    .map(encodeIdentityPart)
    .join(':')
}

export function runtimeBoundaryKey(identity: PodRuntimeIdentity): string {
  return runtimeArtifactKey(identity)
}

function sessionIdentityKey(identity: PodRuntimeIdentity): string {
  return [
    identity.organizationId,
    identity.subjectType,
    identity.subjectId,
    runtimeArtifactKey(identity),
    identity.podSlug,
  ]
    .map(encodeIdentityPart)
    .join(':')
}

export interface PodRuntimeSessionController {
  begin(identity: PodRuntimeIdentity): PodRuntimeSession
  current(): PodRuntimeSession | null
  isCurrent(session: PodRuntimeSession): boolean
  dispose(session?: PodRuntimeSession): void
}

export function createPodRuntimeSessionController(): PodRuntimeSessionController {
  let generation = 0
  let active: PodRuntimeSession | null = null

  return {
    begin(identity) {
      active?.abortController.abort()
      generation += 1
      const frozenIdentity = Object.freeze({ ...identity })
      active = Object.freeze({
        key: `${sessionIdentityKey(frozenIdentity)}:${generation}`,
        identity: frozenIdentity,
        generation,
        selectionSequence: generation,
        abortController: new AbortController(),
      })
      return active
    },
    current: () => active,
    isCurrent(session) {
      return active === session && !session.abortController.signal.aborted
    },
    dispose(session) {
      if (session && active !== session) {
        session.abortController.abort()
        return
      }
      active?.abortController.abort()
      active = null
    },
  }
}

export interface LatestRequest {
  readonly key: string
  readonly generation: number
  readonly signal: AbortSignal
  isCurrent(): boolean
  commit(commit: () => void): boolean
}

export interface LatestRequestController {
  begin(key: string): LatestRequest
  current(): LatestRequest | null
  dispose(): void
}

export function createLatestRequestController(): LatestRequestController {
  let generation = 0
  let active: { request: LatestRequest; controller: AbortController } | null = null

  return {
    begin(key) {
      active?.controller.abort()
      generation += 1
      const controller = new AbortController()
      const requestGeneration = generation
      const request: LatestRequest = Object.freeze({
        key,
        generation: requestGeneration,
        signal: controller.signal,
        isCurrent: () =>
          active?.request === request &&
          !controller.signal.aborted &&
          active.request.generation === requestGeneration,
        commit(commit: () => void) {
          if (!request.isCurrent()) return false
          commit()
          return true
        },
      })
      active = { request, controller }
      return request
    },
    current: () => active?.request ?? null,
    dispose() {
      active?.controller.abort()
      active = null
    },
  }
}

export type CacheClassification = 'value' | 'transient-empty' | 'authoritative-negative'

interface CacheEntry<T> {
  promise?: Promise<T>
  value?: T
  hasValue: boolean
  expiresAt: number
}

export interface InFlightPromiseCacheOptions<T> {
  classify?: (value: T) => CacheClassification
  positiveTtlMs?: number
  negativeTtlMs?: number
  now?: () => number
}

/**
 * Shares concurrent work without turning temporary failures into browser-lifetime facts.
 * Rejections and transient-empty outcomes are always evicted. Authoritative negatives
 * may be retained only for the caller's bounded TTL.
 */
export class InFlightPromiseCache<T> {
  readonly #entries = new Map<string, CacheEntry<T>>()
  readonly #classify: (value: T) => CacheClassification
  readonly #positiveTtlMs: number
  readonly #negativeTtlMs: number
  readonly #now: () => number

  constructor(options: InFlightPromiseCacheOptions<T> = {}) {
    this.#classify = options.classify ?? (() => 'value')
    this.#positiveTtlMs = options.positiveTtlMs ?? Number.POSITIVE_INFINITY
    this.#negativeTtlMs = Math.max(0, options.negativeTtlMs ?? 0)
    this.#now = options.now ?? Date.now
  }

  get(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.#entries.get(key)
    if (existing?.promise) return existing.promise
    if (existing?.hasValue && existing.expiresAt > this.#now()) {
      return Promise.resolve(existing.value as T)
    }
    if (existing) this.#entries.delete(key)

    const entry: CacheEntry<T> = {
      hasValue: false,
      expiresAt: 0,
    }
    const promise = (async () => load())()
      .then((value) => {
        const classification = this.#classify(value)
        entry.promise = undefined

        if (classification === 'transient-empty') {
          if (this.#entries.get(key) === entry) this.#entries.delete(key)
          return value
        }

        const ttl =
          classification === 'authoritative-negative'
            ? this.#negativeTtlMs
            : this.#positiveTtlMs
        if (ttl <= 0) {
          if (this.#entries.get(key) === entry) this.#entries.delete(key)
          return value
        }

        entry.value = value
        entry.hasValue = true
        entry.expiresAt = ttl === Number.POSITIVE_INFINITY ? ttl : this.#now() + ttl
        return value
      })
      .catch((error) => {
        if (this.#entries.get(key) === entry) this.#entries.delete(key)
        throw error
      })
    entry.promise = promise
    this.#entries.set(key, entry)
    return promise
  }

  invalidate(key?: string): void {
    if (key === undefined) {
      this.#entries.clear()
      return
    }
    this.#entries.delete(key)
  }

  set(key: string, value: T, ttlMs = this.#positiveTtlMs): void {
    if (ttlMs <= 0) {
      this.#entries.delete(key)
      return
    }
    this.#entries.set(key, {
      value,
      hasValue: true,
      expiresAt: ttlMs === Number.POSITIVE_INFINITY ? ttlMs : this.#now() + ttlMs,
    })
  }

  keys(): string[] {
    return [...this.#entries.keys()].sort()
  }
}

export type PodRuntimeFailureCode =
  | 'resolution-failed'
  | 'asset-failed'
  | 'missing-runtime'
  | 'missing-pod'
  | 'legacy-runtime-conflict'
  | 'mount-failed'
  | 'render-failed'

export class PodRuntimeFailure extends Error {
  readonly code: PodRuntimeFailureCode
  readonly runtimeArtifactKey?: string
  readonly podSlug?: string

  constructor(
    code: PodRuntimeFailureCode,
    message: string,
    context: { runtimeArtifactKey?: string; podSlug?: string; cause?: unknown } = {},
  ) {
    super(message, context.cause === undefined ? undefined : { cause: context.cause })
    this.name = 'PodRuntimeFailure'
    this.code = code
    this.runtimeArtifactKey = context.runtimeArtifactKey
    this.podSlug = context.podSlug
  }
}

export interface PodRuntimeApi {
  getPod?: (slug: string) => unknown
  renderPod: (input: {
    slug: string
    mountSelector: string
    props: Record<string, unknown>
    acknowledgement?: {
      sessionKey: string
      frameGeneration: number
      renderToken: string
      targetOrigin: string
    }
  }) => unknown
  updateProps?: (input: {
    slug?: string
    mountSelector: string
    props: Record<string, unknown>
  }) => unknown
  unmount?: (input: { mountSelector: string }) => unknown
}

export interface RuntimeRegistryWindow {
  __AUTUMN_PODS_REGISTRY__?: Record<string, PodRuntimeApi>
  __AUTUMN_PODS_VUE__?: PodRuntimeApi
  __AUTUMN_PODS_LEGACY_OWNER__?: string
}

export function installRegisteredRuntime(
  target: RuntimeRegistryWindow,
  artifactKey: string,
  api: PodRuntimeApi,
): void {
  target.__AUTUMN_PODS_REGISTRY__ ||= {}
  target.__AUTUMN_PODS_REGISTRY__[artifactKey] = api
}

/** A bounded bridge: one document may own one legacy global artifact only. */
export function captureLegacyRuntime(
  target: RuntimeRegistryWindow,
  artifactKey: string,
): PodRuntimeApi {
  const legacy = target.__AUTUMN_PODS_VUE__
  if (!legacy || typeof legacy.renderPod !== 'function') {
    throw new PodRuntimeFailure('missing-runtime', `Legacy runtime did not load: ${artifactKey}`, {
      runtimeArtifactKey: artifactKey,
    })
  }
  const owner = target.__AUTUMN_PODS_LEGACY_OWNER__
  if (owner && owner !== artifactKey) {
    throw new PodRuntimeFailure(
      'legacy-runtime-conflict',
      'Two legacy runtime artifacts cannot share one document.',
      { runtimeArtifactKey: artifactKey },
    )
  }
  target.__AUTUMN_PODS_LEGACY_OWNER__ = artifactKey
  installRegisteredRuntime(target, artifactKey, legacy)
  return legacy
}

export interface RuntimeAssetSet {
  owner: string
  shellStyles: string[]
  packStyles: string[]
  runtimeModules: string[]
  themeVariables: Record<string, string>
}

export type PreviewFailure = {
  code: PodRuntimeFailureCode
  message: string
}

export type PreviewState =
  | { status: 'idle' }
  | { status: 'resolving'; sessionKey: string }
  | { status: 'loading-assets'; sessionKey: string }
  | { status: 'mounting'; sessionKey: string; renderToken: string }
  | { status: 'ready'; sessionKey: string; renderToken: string }
  | { status: 'failed'; sessionKey: string; failure: PreviewFailure }
  | { status: 'disposed'; sessionKey: string }

export interface PreviewReadyMessage {
  type: 'autumn:pods-rendered'
  sessionKey: string
  frameGeneration: number
  renderToken: string
}

export interface PreviewReadinessExpectation {
  allowedOrigins: string[]
  source: unknown
  sessionKey: string
  frameGeneration: number
  renderToken: string
  timeoutMs?: number
  onTimeout?: (failure: PreviewFailure) => void
}

export interface PreviewReadinessController {
  accept(event: { source: unknown; origin: string; data: unknown }): boolean
  state(): PreviewState
  fail(error: unknown): void
  dispose(): void
}

function isReadyMessage(value: unknown): value is PreviewReadyMessage {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<PreviewReadyMessage>
  return (
    data.type === 'autumn:pods-rendered' &&
    typeof data.sessionKey === 'string' &&
    typeof data.frameGeneration === 'number' &&
    typeof data.renderToken === 'string'
  )
}

export function normalizeRuntimeFailure(error: unknown): PreviewFailure {
  if (error instanceof PodRuntimeFailure) {
    return { code: error.code, message: error.message }
  }
  return {
    code: 'render-failed',
    message: error instanceof Error ? error.message : 'The pod preview could not be rendered.',
  }
}

export function createPreviewReadinessController(
  expectation: PreviewReadinessExpectation,
): PreviewReadinessController {
  let current: PreviewState = {
    status: 'mounting',
    sessionKey: expectation.sessionKey,
    renderToken: expectation.renderToken,
  }
  let watchdog: ReturnType<typeof setTimeout> | null = null

  const clearWatchdog = () => {
    if (watchdog === null) return
    clearTimeout(watchdog)
    watchdog = null
  }

  if (expectation.timeoutMs && expectation.timeoutMs > 0) {
    watchdog = setTimeout(() => {
      watchdog = null
      if (current.status !== 'mounting') return
      const failure: PreviewFailure = {
        code: 'render-failed',
        message: 'The pod runtime did not acknowledge that rendering completed.',
      }
      current = {
        status: 'failed',
        sessionKey: expectation.sessionKey,
        failure,
      }
      expectation.onTimeout?.(failure)
    }, expectation.timeoutMs)
  }

  return {
    accept(event) {
      if (current.status !== 'mounting') return false
      if (event.source !== expectation.source) return false
      if (!expectation.allowedOrigins.includes(event.origin)) return false
      if (!isReadyMessage(event.data)) return false
      if (event.data.sessionKey !== expectation.sessionKey) return false
      if (event.data.frameGeneration !== expectation.frameGeneration) return false
      if (event.data.renderToken !== expectation.renderToken) return false
      clearWatchdog()
      current = {
        status: 'ready',
        sessionKey: expectation.sessionKey,
        renderToken: expectation.renderToken,
      }
      return true
    },
    state: () => current,
    fail(error) {
      if (current.status === 'disposed') return
      clearWatchdog()
      current = {
        status: 'failed',
        sessionKey: expectation.sessionKey,
        failure: normalizeRuntimeFailure(error),
      }
    },
    dispose() {
      clearWatchdog()
      current = { status: 'disposed', sessionKey: expectation.sessionKey }
    },
  }
}

export interface RuntimeAssetLoadIdentity {
  runtimeOwner?: string | null
  moduleScripts?: readonly string[]
  scripts?: readonly string[]
  shellStylesheets?: readonly string[]
  extraStylesheets?: readonly string[]
  /** Optional theme/font CSS does not participate in readiness completion. */
  optionalStylesheets?: readonly string[]
}

export interface PreviewStylesheetPlan {
  required: string[]
  optional: string[]
}

/**
 * Keep render-critical shell and pack CSS on the readiness path while letting
 * brand and font decoration arrive independently.
 */
export function createPreviewStylesheetPlan(
  identity: Pick<RuntimeAssetLoadIdentity, 'shellStylesheets' | 'extraStylesheets' | 'optionalStylesheets'>,
): PreviewStylesheetPlan {
  const normalize = (stylesheets: readonly string[] = []) => [
    ...new Set(
      stylesheets
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ]

  return {
    required: normalize([...(identity.shellStylesheets ?? []), ...(identity.extraStylesheets ?? [])]),
    optional: normalize(identity.optionalStylesheets),
  }
}

/** Build the exact asset identity used to reject stale iframe completion events. */
export function runtimeAssetLoadKey(identity: RuntimeAssetLoadIdentity): string {
  return JSON.stringify({
    runtimeOwner: identity.runtimeOwner || null,
    moduleScripts: [...(identity.moduleScripts ?? [])],
    scripts: [...(identity.scripts ?? [])],
    shellStylesheets: [...(identity.shellStylesheets ?? [])],
    extraStylesheets: [...(identity.extraStylesheets ?? [])],
  })
}

/** Report whether an asset load can execute a runtime rather than styles alone. */
export function hasRuntimeAssetScripts(identity: RuntimeAssetLoadIdentity): boolean {
  return (identity.moduleScripts?.length ?? 0) > 0 || (identity.scripts?.length ?? 0) > 0
}

const PREVIEW_SHELL_STYLE = `
html, body {
  box-sizing: border-box;
  margin: 0;
  min-height: 100%;
  width: 100%;
}
*, *::before, *::after {
  box-sizing: inherit;
}
[data-pods-preview-root="1"] {
  min-height: 100%;
  width: 100%;
}
`

/** Install the minimal deterministic shell owned by every iframe preview document. */
export function installPreviewShellStyles(doc: Document): void {
  if (doc.head.querySelector('[data-pods-shell-style="base"]')) return
  const style = doc.createElement('style')
  style.dataset.podsShellStyle = 'base'
  style.textContent = PREVIEW_SHELL_STYLE
  doc.head.appendChild(style)
}

export type PodRenderIdentityState =
  | { status: 'valid' }
  | { status: 'invalid'; reason: string }
  | { status: 'unavailable'; reason: string }

export interface RuntimeIdentityDiagnosticSnapshot {
  code: string
  fields: string[]
  message: string
  expectedSelectionSequence?: number
  observedSelectionSequence?: number
  expectedSessionFingerprint?: string | null
  observedSessionFingerprint?: string
}

export interface RuntimeSnapshot {
  sessionKey: string
  runtimeArtifactKey: string
  runtimeBoundaryKey: string
  identity: Readonly<PodRuntimeIdentity>
  renderIdentity: Readonly<PodRenderIdentity> | null
  identityState: PodRenderIdentityState
  identityDiagnostics: RuntimeIdentityDiagnosticSnapshot[]
  runtimeLayerDependencies: RuntimeLayerDependencyDescriptor[]
  requestGeneration: number
  frameGeneration: number
  registryKeys: string[]
  ownedStyles: string[]
  ownedModules: string[]
  loadedLayerCommit: string
  state: PreviewState | { status: 'ready'; renderToken: string }
  failure: PreviewFailure | null
}

export type RuntimeSnapshotInput = Omit<
  RuntimeSnapshot,
  'renderIdentity' | 'identityState' | 'identityDiagnostics' | 'runtimeLayerDependencies'
> & Partial<Pick<
  RuntimeSnapshot,
  'renderIdentity' | 'identityState' | 'identityDiagnostics' | 'runtimeLayerDependencies'
>>

export function createRuntimeSnapshot(input: RuntimeSnapshotInput): Readonly<RuntimeSnapshot> {
  return Object.freeze({
    ...input,
    identity: Object.freeze({ ...input.identity }),
    renderIdentity: input.renderIdentity ? Object.freeze({ ...input.renderIdentity }) : null,
    identityState: Object.freeze(input.identityState || {
      status: 'unavailable' as const,
      reason: 'legacy-snapshot',
    }),
    identityDiagnostics: (input.identityDiagnostics || []).map((diagnostic) => ({
      ...diagnostic,
      fields: [...diagnostic.fields],
    })),
    runtimeLayerDependencies: (input.runtimeLayerDependencies || []).map((dependency) => ({
      ...dependency,
    })),
    registryKeys: [...input.registryKeys].sort(),
    ownedStyles: [...input.ownedStyles].sort(),
    ownedModules: [...input.ownedModules].sort(),
    failure: input.failure ? { ...input.failure } : null,
  })
}

function comparableSnapshot(snapshot: RuntimeSnapshot): unknown {
  return {
    runtimeArtifactKey: snapshot.runtimeArtifactKey,
    runtimeBoundaryKey: snapshot.runtimeBoundaryKey,
    identity: snapshot.identity,
    renderIdentity: snapshot.renderIdentity
      ? {
          contract: snapshot.renderIdentity.contract,
          sessionFingerprint: snapshot.renderIdentity.sessionFingerprint,
          renderFingerprint: snapshot.renderIdentity.renderFingerprint,
          selectionSequence: snapshot.renderIdentity.selectionSequence,
        }
      : null,
    identityState: snapshot.identityState,
    identityDiagnostics: snapshot.identityDiagnostics,
    runtimeLayerDependencies: snapshot.runtimeLayerDependencies,
    registryKeys: [...snapshot.registryKeys].sort(),
    ownedStyles: [...snapshot.ownedStyles].sort(),
    ownedModules: [...snapshot.ownedModules].sort(),
    loadedLayerCommit: snapshot.loadedLayerCommit,
    state: snapshot.state.status,
    failure: snapshot.failure,
  }
}

export function runtimeSnapshotsEquivalent(
  direct: RuntimeSnapshot,
  navigated: RuntimeSnapshot,
): boolean {
  return JSON.stringify(comparableSnapshot(direct)) === JSON.stringify(comparableSnapshot(navigated))
}

declare global {
  interface Window {
    __AUTUMN_PODS_REGISTRY__?: Record<string, PodRuntimeApi>
    __AUTUMN_PODS_LEGACY_OWNER__?: string
    __POD_RUNTIME_SNAPSHOT__?: Readonly<RuntimeSnapshot>
  }
}
