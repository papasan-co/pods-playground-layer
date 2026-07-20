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

export interface PodRuntimeSession {
  readonly key: string
  readonly identity: Readonly<PodRuntimeIdentity>
  readonly generation: number
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

interface MountOwner {
  runtimeArtifactKey: string
  api: PodRuntimeApi
  mountSelector: string
}

export interface PodRuntimeRegistry {
  register(key: string, api: PodRuntimeApi): void
  lookup(key: string, podSlug?: string): PodRuntimeApi
  mount(
    mountKey: string,
    artifactKey: string,
    podSlug: string,
    props: Record<string, unknown>,
    mountSelector?: string,
  ): void
  unmount(mountKey: string): void
  keys(): string[]
}

export function createPodRuntimeRegistry(
  seed: Record<string, PodRuntimeApi> = {},
): PodRuntimeRegistry {
  const runtimes = new Map<string, PodRuntimeApi>(Object.entries(seed))
  const mounts = new Map<string, MountOwner>()

  const lookup = (key: string, podSlug?: string): PodRuntimeApi => {
    const api = runtimes.get(key)
    if (!api) {
      throw new PodRuntimeFailure('missing-runtime', `Runtime artifact is not loaded: ${key}`, {
        runtimeArtifactKey: key,
        podSlug,
      })
    }
    if (podSlug && api.getPod && !api.getPod(podSlug)) {
      throw new PodRuntimeFailure(
        'missing-pod',
        `Pod "${podSlug}" is not available in runtime artifact ${key}.`,
        { runtimeArtifactKey: key, podSlug },
      )
    }
    return api
  }

  return {
    register(key, api) {
      if (!key.trim() || !api || typeof api.renderPod !== 'function') {
        throw new TypeError('A runtime artifact key and renderPod API are required.')
      }
      runtimes.set(key, api)
    },
    lookup,
    mount(mountKey, artifactKey, podSlug, props, selector = mountKey) {
      const api = lookup(artifactKey, podSlug)
      const previous = mounts.get(mountKey)
      if (previous) {
        previous.api.unmount?.({ mountSelector: previous.mountSelector })
        mounts.delete(mountKey)
      }
      try {
        api.renderPod({ slug: podSlug, mountSelector: selector, props })
        mounts.set(mountKey, { runtimeArtifactKey: artifactKey, api, mountSelector: selector })
      } catch (cause) {
        throw new PodRuntimeFailure('mount-failed', `Unable to mount pod "${podSlug}".`, {
          runtimeArtifactKey: artifactKey,
          podSlug,
          cause,
        })
      }
    },
    unmount(mountKey) {
      const owner = mounts.get(mountKey)
      if (!owner) return
      owner.api.unmount?.({ mountSelector: owner.mountSelector })
      mounts.delete(mountKey)
    },
    keys: () => [...runtimes.keys()].sort(),
  }
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

export interface OwnedRuntimeAsset {
  owner: string
  kind: 'style' | 'module'
  url: string
}

export interface RuntimeAssetAdapter {
  load(asset: OwnedRuntimeAsset): Promise<void>
  remove(asset: OwnedRuntimeAsset): void
}

function ownedAssets(set: RuntimeAssetSet): OwnedRuntimeAsset[] {
  const styles = [...new Set([...set.shellStyles, ...set.packStyles])]
    .filter(Boolean)
    .map((url) => ({ owner: set.owner, kind: 'style' as const, url }))
  const modules = [...new Set(set.runtimeModules)]
    .filter(Boolean)
    .map((url) => ({ owner: set.owner, kind: 'module' as const, url }))
  return [...styles, ...modules]
}

export class RuntimeAssetLedger {
  readonly #adapter: RuntimeAssetAdapter
  #active: OwnedRuntimeAsset[] = []
  #owner: string | null = null

  constructor(adapter: RuntimeAssetAdapter) {
    this.#adapter = adapter
  }

  async activate(set: RuntimeAssetSet): Promise<void> {
    this.dispose()
    const loaded: OwnedRuntimeAsset[] = []
    try {
      for (const asset of ownedAssets(set)) {
        await this.#adapter.load(asset)
        loaded.push(asset)
      }
      this.#active = loaded
      this.#owner = set.owner
    } catch (cause) {
      for (const asset of loaded.reverse()) this.#adapter.remove(asset)
      this.#active = []
      this.#owner = null
      const detail = cause instanceof Error ? ` ${cause.message}` : ''
      throw new PodRuntimeFailure('asset-failed', `Unable to load preview runtime assets.${detail}`, {
        runtimeArtifactKey: set.owner,
        cause,
      })
    }
  }

  dispose(): void {
    for (const asset of [...this.#active].reverse()) this.#adapter.remove(asset)
    this.#active = []
    this.#owner = null
  }

  snapshot(): { owner: string | null; styles: string[]; modules: string[] } {
    return {
      owner: this.#owner,
      styles: this.#active.filter((asset) => asset.kind === 'style').map((asset) => asset.url),
      modules: this.#active.filter((asset) => asset.kind === 'module').map((asset) => asset.url),
    }
  }
}

export function createDocumentRuntimeAssetAdapter(doc: Document): RuntimeAssetAdapter {
  const nodes = new Map<string, HTMLElement>()
  const assetKey = (asset: OwnedRuntimeAsset) => `${asset.owner}:${asset.kind}:${asset.url}`

  return {
    load(asset) {
      return new Promise<void>((resolve, reject) => {
        const node =
          asset.kind === 'style' ? doc.createElement('link') : doc.createElement('script')
        node.dataset.podsRuntimeOwner = asset.owner
        node.dataset.podsRuntimeAsset = asset.kind
        if (node.tagName === 'LINK') {
          const link = node as HTMLLinkElement
          link.rel = 'stylesheet'
          link.href = asset.url
        } else {
          const script = node as HTMLScriptElement
          script.type = 'module'
          script.src = asset.url
        }
        const cleanupListeners = () => {
          node.removeEventListener('load', handleLoad)
          node.removeEventListener('error', handleError)
        }
        const handleLoad = () => {
          cleanupListeners()
          nodes.set(assetKey(asset), node)
          resolve()
        }
        const handleError = () => {
          cleanupListeners()
          node.remove()
          reject(new Error(`Failed to load ${asset.kind}: ${asset.url}`))
        }
        node.addEventListener('load', handleLoad, { once: true })
        node.addEventListener('error', handleError, { once: true })
        doc.head.appendChild(node)
      })
    },
    remove(asset) {
      const key = assetKey(asset)
      nodes.get(key)?.remove()
      nodes.delete(key)
    },
  }
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
  extraStylesheets?: readonly string[]
}

/** Build the exact asset identity used to reject stale iframe completion events. */
export function runtimeAssetLoadKey(identity: RuntimeAssetLoadIdentity): string {
  return JSON.stringify({
    runtimeOwner: identity.runtimeOwner || null,
    moduleScripts: [...(identity.moduleScripts ?? [])],
    scripts: [...(identity.scripts ?? [])],
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

export interface RuntimeSnapshot {
  sessionKey: string
  runtimeArtifactKey: string
  runtimeBoundaryKey: string
  identity: Readonly<PodRuntimeIdentity>
  requestGeneration: number
  frameGeneration: number
  registryKeys: string[]
  ownedStyles: string[]
  ownedModules: string[]
  loadedLayerCommit: string
  state: PreviewState | { status: 'ready'; renderToken: string }
  failure: PreviewFailure | null
}

export function createRuntimeSnapshot(input: RuntimeSnapshot): Readonly<RuntimeSnapshot> {
  return Object.freeze({
    ...input,
    identity: Object.freeze({ ...input.identity }),
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
