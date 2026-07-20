<script setup lang="ts">
import type {
  PodDetails,
  PodsPlayerCanvasTarget,
  PodsPlayerMode,
  PodsPlayerViewport,
} from '#pods-player/types'
import { usePodsPlayerRuntime } from '#pods-player-runtime'
import {
  PodRuntimeFailure,
  captureLegacyRuntime,
  createLatestRequestController,
  createPreviewReadinessController,
  createRuntimeSnapshot,
  normalizeRuntimeFailure,
  runtimeArtifactKey as buildRuntimeArtifactKey,
  runtimeBoundaryKey as buildRuntimeBoundaryKey,
  type PodRuntimeApi,
  type PodRuntimeIdentity,
  type PreviewState,
  type PreviewReadinessController,
} from '#pods-player/runtime/isolation'
import PodsPlayerPreviewDevice from './PodsPlayerPreviewDevice.vue'

/**
 * pods-playground-layer.app.components.pods-player.PodsPlayerPreview
 *
 * Shared preview column for the pod playground.
 * - SFC mode: host runtime loads the Vue component
 * - Vue mode: host runtime supplies Vue runtime ESM URL(s); layer injects them as module scripts into an iframe
 */

const props = defineProps<{
  pod: PodDetails | null
  mode: PodsPlayerMode
  viewport: PodsPlayerViewport
  previewProps: Record<string, unknown>
  selectableTargets?: PodsPlayerCanvasTarget[]
  selectedTargetKey?: string | null
  contentReady?: boolean
  contentSourcePreviewId?: string | null
}>()

const emit = defineEmits<{
  selectTarget: [target: PodsPlayerCanvasTarget]
  ready: [payload: { sourcePreviewId: string | null }]
}>()

const runtime = usePodsPlayerRuntime()
const route = useRoute()
const activeSourcePreviewId = useState<string>('pod-studio.activeSourcePreviewId', () => '')
const activeSourcePreviewPodSlug = useState<string>(
  'pod-studio.activeSourcePreviewPodSlug',
  () => '',
)
const activeSourcePreviewDraftPackId = useState<string>(
  'pod-studio.activeSourcePreviewDraftPackId',
  () => '',
)
const activeSourcePreviewRevision = useState<number>(
  'pod-studio.activeSourcePreviewRevision',
  () => 0,
)
const brandPreviewRevision = useState('pod-studio.brand.previewRevision', () => 0)
const config = useRuntimeConfig()

type PreviewDeviceHandle = {
  iframeElement: () => HTMLIFrameElement | null
  iframeWindow: () => Window | null
}

const previewDeviceRef = ref<PreviewDeviceHandle | null>(null)
const previewRequests = createLatestRequestController()
const runtimeLoadRequests = createLatestRequestController()
const previewModeRequests = createLatestRequestController()

const Comp = shallowRef<any>(null)
const renderedPreviewProps = shallowRef<Record<string, unknown>>({})
const renderedSfcArtifactId = ref<string | null>(null)
const renderedSfcPodSlug = ref<string | null>(null)
const settledLayerSequenceSourcePreviewId = ref<string | null>(null)
const layerSequenceSettleRevision = ref(0)
const previewSlotRevision = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)
let previewReadyRequestId = 0
/**
 * An SFC swap whose matching source-preview data had not landed when the
 * module finished loading. The resume watcher completes it as soon as
 * contentSourcePreviewId catches up — without this, the swap is dropped and
 * the canvas deadlocks on the previous artifact (the in-session activation
 * stall after stacked source turns).
 */
let deferredSfcSwap: {
  mod: unknown
  sourcePreviewId: string | null
  podSlug: string
  previousText: string
} | null = null
const committedSfcSwapTimingKeys = new Set<string>()
const settledLayerSequenceTimingKeys = new Set<string>()
const resolvedRenderModeTimingKeys = new Set<string>()

const vueScripts = ref<string[]>([])
const vueStylesheets = ref<string[]>([])
const vueRuntimeLoadKey = ref('')
const vueRuntimeArtifactKey = ref('')
const vueRuntimeBoundaryKey = ref('')
const vueRuntimeIdentity = shallowRef<Readonly<PodRuntimeIdentity> | null>(null)
const vueReady = ref(false)
const vueFallbackActive = ref(false)
const previewCssVars = ref<Record<string, string> | null>(null)
const debugFill = computed(() => route.query.debugFill === '1')
const renderedMode = ref<PodsPlayerMode | null>(null)
const previewState = shallowRef<PreviewState>({ status: 'idle' })
let frameGeneration = 0
let renderGeneration = 0
let vueMountOwner: { api: PodRuntimeApi; win: Window; artifactKey: string } | null = null
let readiness: PreviewReadinessController | null = null
const requestedEffectiveMode = computed(() => {
  const sourcePreviewId = currentCanvasArtifactId()
  const shouldUseHmrSfc = isActiveHmrSourcePreview(sourcePreviewId)

  if ((props.mode === 'sfc' || shouldUseHmrSfc) && vueFallbackActive.value) {
    return 'vue'
  }

  return shouldUseHmrSfc ? 'sfc' : props.mode
})
const effectiveMode = computed(() => renderedMode.value || requestedEffectiveMode.value)
const previewFrameKey = computed(() =>
  effectiveMode.value === 'vue'
    ? `artifact:${vueRuntimeBoundaryKey.value || 'resolving'}`
    : `source:${currentDraftPackId()}:${currentCanvasArtifactId() || 'local'}`,
)
const renderedCanvasArtifactId = computed(() =>
  effectiveMode.value === 'sfc' ? renderedSfcArtifactId.value : currentCanvasArtifactId(),
)
const settleLayerSequencesForPreview = computed(
  () =>
    effectiveMode.value === 'sfc' &&
    Boolean(renderedCanvasArtifactId.value) &&
    settledLayerSequenceSourcePreviewId.value === renderedCanvasArtifactId.value,
)
const hasRenderablePreview = computed(() =>
  effectiveMode.value === 'sfc'
    ? Boolean(Comp.value)
    : Boolean(vueReady.value || vueScripts.value.length || vueStylesheets.value.length),
)
const hasMountedPreviewSurface = computed(() =>
  Boolean(
    renderedMode.value ||
      renderedSfcArtifactId.value ||
      vueRuntimeLoadKey.value ||
      hasRenderablePreview.value,
  ),
)

function commitRenderedPreviewProps(nextPreviewProps: Record<string, unknown>) {
  renderedPreviewProps.value = nextPreviewProps
  previewSlotRevision.value += 1
}

const targetableValues = computed(() =>
  [...(props.selectableTargets || [])]
    .filter((target) => target.displayValue.trim().length > 0)
    .sort((a, b) => b.displayValue.length - a.displayValue.length),
)

function handleCanvasClick(event: MouseEvent): void {
  if (!targetableValues.value.length) return

  const path = typeof event.composedPath === 'function' ? event.composedPath() : []

  for (const node of path) {
    if (!(node instanceof HTMLElement)) continue

    const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
    if (!text) continue

    const match = targetableValues.value.find((target) => text.includes(target.displayValue))
    if (match) {
      emit('selectTarget', match)
      break
    }
  }
}

function currentSourcePreviewId(): string | null {
  if (
    activeSourcePreviewId.value &&
    activeSourcePreviewPodSlug.value === props.pod?.slug &&
    activeSourcePreviewDraftPackId.value === currentDraftPackId()
  ) {
    return activeSourcePreviewId.value
  }

  if (typeof route.query.sourcePreview === 'string' && route.query.sourcePreview) {
    return route.query.sourcePreview
  }

  if (typeof route.query.sourcePreviewId === 'string' && route.query.sourcePreviewId) {
    return route.query.sourcePreviewId
  }

  return null
}

function currentDraftPackId(): string {
  return typeof route.query.draftPack === 'string' ? route.query.draftPack : ''
}

function currentDraftArtifactId(): string | null {
  return typeof route.query.draftArtifact === 'string' && route.query.draftArtifact
    ? route.query.draftArtifact
    : null
}

function currentCanvasArtifactId(): string | null {
  return currentSourcePreviewId() || currentDraftArtifactId()
}

function emitPreviewReady(sourcePreviewId: string | null): void {
  emit('ready', { sourcePreviewId })
}

function recordPreviewTiming(
  sourcePreviewId: string | null,
  mark: string,
  data?: Record<string, unknown>,
): void {
  if (!import.meta.client) return

  const win = window as Window & {
    __POD_STUDIO_PREVIEW_TIMINGS__?: Array<{
      mark: string
      at: number
      sourcePreviewId: string | null
      data?: Record<string, unknown>
    }>
  }
  const timings = win.__POD_STUDIO_PREVIEW_TIMINGS__ || []
  timings.push({
    mark,
    at: Math.round(performance.now()),
    sourcePreviewId,
    data,
  })
  win.__POD_STUDIO_PREVIEW_TIMINGS__ = timings
}

function waitForPreviewPaint(win: Window | null): Promise<void> {
  if (!import.meta.client) return Promise.resolve()

  const raf = win?.requestAnimationFrame?.bind(win) ?? window.requestAnimationFrame.bind(window)

  return new Promise((resolve) => {
    raf(() => {
      raf(() => resolve())
    })
  })
}

function previewIframeWindow(): Window | null {
  if (!import.meta.client) return null
  return previewDeviceRef.value?.iframeWindow() ?? null
}

function previewBodyText(win: Window | null): string {
  if (!import.meta.client) return ''

  const doc = win?.document ?? previewIframeWindow()?.document ?? document

  return (doc.body?.innerText || doc.body?.textContent || '').replace(/\s+/g, ' ').trim()
}

function comparablePreviewText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function sourcePreviewExpectedTexts(sourcePreviewId: string | null, previousText = ''): string[] {
  if (!import.meta.client || !sourcePreviewId) return []

  const win = window as Window & {
    __POD_STUDIO_HMR_EXPECTED_TEXTS__?: Record<string, string[]>
  }
  const expectedTexts = win.__POD_STUDIO_HMR_EXPECTED_TEXTS__?.[sourcePreviewId] || []
  const comparablePreviousText = comparablePreviewText(previousText)

  return expectedTexts.filter(
    (value) =>
      typeof value === 'string' &&
      value.trim().length > 0 &&
      !comparablePreviousText.includes(comparablePreviewText(value)),
  )
}

function isActiveHmrSourcePreview(sourcePreviewId: string | null): boolean {
  if (!sourcePreviewId) return false
  if (activeSourcePreviewId.value !== sourcePreviewId) return false
  if (activeSourcePreviewPodSlug.value !== props.pod?.slug) return false
  if (activeSourcePreviewDraftPackId.value !== currentDraftPackId()) return false

  return true
}

function visibleTextCandidates(
  value: unknown,
  previousText = '',
  candidates = new Set<string>(),
): string[] {
  const comparablePreviousText = comparablePreviewText(previousText)

  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, ' ').trim()
    const lower = normalized.toLowerCase()
    const looksLikeVisibleCopy =
      normalized.length >= 8 &&
      !normalized.startsWith('#') &&
      !/^https?:\/\//i.test(normalized) &&
      !/^[a-z0-9-]+$/i.test(normalized) &&
      !['external url', 'primary', 'secondary'].includes(lower)

    if (
      looksLikeVisibleCopy &&
      !comparablePreviousText.includes(comparablePreviewText(normalized))
    ) {
      candidates.add(normalized)
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      visibleTextCandidates(item, previousText, candidates)
    }
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      visibleTextCandidates(item, previousText, candidates)
    }
  }

  return [...candidates]
}

function previewDataReady(sourcePreviewId: string | null = null): boolean {
  return (
    props.contentReady !== false &&
    (!sourcePreviewId || props.contentSourcePreviewId === sourcePreviewId)
  )
}

async function emitPreviewReadyAfterPaint(
  win: Window | null,
  sourcePreviewId: string | null,
  options: {
    previousText?: string | null
    expectedTexts?: string[]
    source?: string
  } = {},
): Promise<void> {
  const requestId = ++previewReadyRequestId
  await nextTick()
  if (!previewDataReady(sourcePreviewId)) {
    recordPreviewTiming(sourcePreviewId, 'canvas_ready_deferred_until_matching_source_preview_data', {
      source: options.source || 'unknown',
      contentSourcePreviewId: props.contentSourcePreviewId || null,
      contentReady: props.contentReady !== false,
    })
    return
  }
  const explicitPreviousText = options.previousText || ''
  const registeredExpectedTexts = sourcePreviewExpectedTexts(sourcePreviewId, explicitPreviousText)
  const expectedTexts = [
    ...(sourcePreviewId && registeredExpectedTexts.length > 0
      ? registeredExpectedTexts
      : options.expectedTexts || []),
  ].filter((value, index, list) => list.indexOf(value) === index)
  await waitForPreviewPaint(win)

  if (requestId !== previewReadyRequestId) {
    return
  }

  if (sourcePreviewId !== currentCanvasArtifactId()) {
    return
  }

  if (!previewDataReady(sourcePreviewId)) return
  if (sourcePreviewId) {
    const doc = win?.document ?? previewIframeWindow()?.document ?? document
    const selector = `[data-pods-canvas-artifact-id="${CSS.escape(sourcePreviewId)}"]`
    if (!doc.querySelector(selector)) return
  }

  const nextText = previewBodyText(win)
  recordPreviewTiming(sourcePreviewId, 'canvas_painted_ready', {
    source: options.source || 'unknown',
    expectedTextCount: expectedTexts.length,
    textChanged: Boolean(explicitPreviousText && nextText !== explicitPreviousText),
    acknowledgement: 'vue-next-tick-two-animation-frames',
  })
  emitPreviewReady(sourcePreviewId)
}

function vueRuntimeApi(win: Window | null): { api: PodRuntimeApi; legacy: boolean } {
  const artifactKey = vueRuntimeArtifactKey.value
  if (!win || !artifactKey) {
    throw new PodRuntimeFailure('missing-runtime', 'The preview runtime has no active artifact identity.', {
      runtimeArtifactKey: artifactKey || undefined,
      podSlug: props.pod?.slug,
    })
  }
  const runtimeWindow = win as Window & {
    __AUTUMN_PODS_REGISTRY__?: Record<string, PodRuntimeApi>
    __AUTUMN_PODS_VUE__?: PodRuntimeApi
    __AUTUMN_PODS_LEGACY_OWNER__?: string
  }
  const registered = runtimeWindow.__AUTUMN_PODS_REGISTRY__?.[artifactKey]
  if (registered) return { api: registered, legacy: false }
  return { api: captureLegacyRuntime(runtimeWindow, artifactKey), legacy: true }
}

function unmountVueRuntimePreview(sourcePreviewId: string | null): boolean {
  const owner = vueMountOwner
  if (!owner || typeof owner.api.unmount !== 'function') return false

  try {
    owner.api.unmount({ mountSelector: '[data-pods-vue-mount="1"]' })
    vueMountOwner = null
    recordPreviewTiming(sourcePreviewId, 'vue_runtime_preview_unmounted_for_sfc', {
      podSlug: props.pod?.slug || null,
    })
    return true
  } catch (exception) {
    recordPreviewTiming(sourcePreviewId, 'vue_runtime_preview_unmount_skipped', {
      podSlug: props.pod?.slug || null,
      message: exception instanceof Error ? exception.message : String(exception),
    })
    return false
  }
}

if (import.meta.client && import.meta.hot) {
  const hot = import.meta.hot as {
    on: (event: 'vite:afterUpdate', callback: (payload: unknown) => void) => void
    off?: (event: 'vite:afterUpdate', callback: (payload: unknown) => void) => void
  }
  const handleViteAfterUpdate = (payload: unknown) => {
    const sourcePreviewId = currentSourcePreviewId()
    if (!sourcePreviewId) return

    recordPreviewTiming(sourcePreviewId, 'hmr_client_hot_update_received', {
      updateCount: Array.isArray((payload as { updates?: unknown[] } | null)?.updates)
        ? ((payload as { updates?: unknown[] }).updates || []).length
        : null,
    })
    if (loading.value) {
      return
    }

    void (async () => {
      if (!previewDataReady()) return
      const previousText = previewBodyText(window)
      const expectedTexts = visibleTextCandidates(props.previewProps || {}, previousText)

      if (expectedTexts.length === 0) {
        return
      }

      await emitPreviewReadyAfterPaint(window, sourcePreviewId, {
        previousText,
        expectedTexts,
        source: 'vite-after-update',
      })
    })()
  }

  onMounted(() => {
    hot.on('vite:afterUpdate', handleViteAfterUpdate)
  })

  onBeforeUnmount(() => {
    hot.off?.('vite:afterUpdate', handleViteAfterUpdate)
  })
}

async function renderVueRuntimeIntoIframe() {
  if (!import.meta.client) return
  if (effectiveMode.value !== 'vue') return
  if (!vueReady.value) return
  if (!props.pod?.slug) return

  const win = previewIframeWindow()
  const renderRequest = previewRequests.begin(
    `${vueRuntimeArtifactKey.value}:${props.pod.slug}:${previewSlotRevision.value}`,
  )
  const { api, legacy } = vueRuntimeApi(win)
  if (!win || !renderRequest.isCurrent()) return

  if (api.getPod && !api.getPod(props.pod.slug)) {
    throw new PodRuntimeFailure(
      'missing-pod',
      `Pod "${props.pod.slug}" is not available in the selected runtime.`,
      { runtimeArtifactKey: vueRuntimeArtifactKey.value, podSlug: props.pod.slug },
    )
  }

  if (vueMountOwner && (vueMountOwner.api !== api || vueMountOwner.win !== win)) {
    vueMountOwner.api.unmount?.({ mountSelector: '[data-pods-vue-mount="1"]' })
    vueMountOwner = null
  }

  const googleKey = (window as any)?.__AUTUMN_RUNTIME__?.maps?.google?.key
  const injected =
    typeof googleKey === 'string' && googleKey
      ? { googleMapsKey: googleKey, apiKey: googleKey }
      : {}

  const sourcePreviewId = currentCanvasArtifactId()
  renderGeneration += 1
  const renderToken = `render-${renderGeneration}`
  const sessionKey = `${vueRuntimeArtifactKey.value}:${props.pod.slug}:${renderRequest.generation}`
  const acknowledgement = {
    type: 'autumn:pods-rendered' as const,
    sessionKey,
    frameGeneration,
    renderToken,
  }
  readiness?.dispose()
  readiness = createPreviewReadinessController({
    allowedOrigins: [window.location.origin],
    source: win,
    sessionKey,
    frameGeneration,
    renderToken,
  })
  previewState.value = readiness.state()

  api.renderPod({
    slug: props.pod.slug,
    mountSelector: '[data-pods-vue-mount="1"]',
    props: { ...(renderedPreviewProps.value || {}), ...injected },
    acknowledgement: {
      sessionKey,
      frameGeneration,
      renderToken,
      targetOrigin: window.location.origin,
    },
  })
  vueMountOwner = { api, win, artifactKey: vueRuntimeArtifactKey.value }

  // Historical bundles do not implement acknowledgement. The bounded legacy
  // adapter emits the same authenticated state transition after two paints.
  if (legacy) {
    await waitForPreviewPaint(win)
    if (!renderRequest.isCurrent() || !readiness) return
    readiness.accept({ source: win, origin: window.location.origin, data: acknowledgement })
    previewState.value = readiness.state()
    publishRuntimeSnapshot()
    emitPreviewReady(sourcePreviewId)
  }
}

function publishRuntimeSnapshot(): void {
  if (!import.meta.client || !vueRuntimeIdentity.value || !vueRuntimeArtifactKey.value) return
  const state = previewState.value
  const failure = state.status === 'failed' ? state.failure : null
  window.__POD_RUNTIME_SNAPSHOT__ = createRuntimeSnapshot({
    sessionKey:
      'sessionKey' in state ? state.sessionKey : `${vueRuntimeArtifactKey.value}:idle`,
    runtimeArtifactKey: vueRuntimeArtifactKey.value,
    runtimeBoundaryKey: vueRuntimeBoundaryKey.value,
    identity: vueRuntimeIdentity.value,
    requestGeneration: previewRequests.current()?.generation ?? 0,
    frameGeneration,
    registryKeys: Object.keys(
      (previewIframeWindow() as Window & {
        __AUTUMN_PODS_REGISTRY__?: Record<string, PodRuntimeApi>
      } | null)?.__AUTUMN_PODS_REGISTRY__ || {},
    ),
    ownedStyles: [...vueStylesheets.value],
    ownedModules: [...vueScripts.value],
    loadedLayerCommit:
      String((config.public as Record<string, unknown>).podsPlayerLayerCommit || 'unknown'),
    state,
    failure,
  })
}

function handleRuntimeAcknowledgement(event: MessageEvent): void {
  if (!readiness?.accept(event)) return
  previewState.value = readiness.state()
  publishRuntimeSnapshot()
  emitPreviewReady(currentCanvasArtifactId())
}

onMounted(() => window.addEventListener('message', handleRuntimeAcknowledgement))
onBeforeUnmount(() => {
  window.removeEventListener('message', handleRuntimeAcknowledgement)
  previewRequests.dispose()
  runtimeLoadRequests.dispose()
  previewModeRequests.dispose()
  readiness?.dispose()
  unmountVueRuntimePreview(currentCanvasArtifactId())
})

function runtimeLoadKey(scripts: readonly string[], stylesheets: readonly string[]): string {
  return JSON.stringify({
    scripts,
    stylesheets,
  })
}

function shouldFallbackToVueRuntime(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith('POD_STUDIO_HMR_PREVIEW_FALLBACK:')
}

function shouldSettleLayerSequencesForSourcePreview(sourcePreviewId: string | null): boolean {
  return isActiveHmrSourcePreview(sourcePreviewId)
}

async function settleLayerSequencesForSourcePreview(
  sourcePreviewId: string | null,
  source: string,
): Promise<void> {
  if (!shouldSettleLayerSequencesForSourcePreview(sourcePreviewId)) return

  settledLayerSequenceSourcePreviewId.value = sourcePreviewId
  layerSequenceSettleRevision.value += 1
  const timingKey = `${props.pod?.slug || ''}:${sourcePreviewId || ''}`
  if (sourcePreviewId && !settledLayerSequenceTimingKeys.has(timingKey)) {
    settledLayerSequenceTimingKeys.add(timingKey)
    recordPreviewTiming(sourcePreviewId, 'hmr_layer_sequences_settled_for_preview', {
      source,
      podSlug: props.pod?.slug || null,
    })
  }
  await nextTick()
}

async function stageSfcComponentSwap(
  mod: unknown,
  nextPreviewProps: Record<string, unknown>,
  sourcePreviewId: string | null,
): Promise<void> {
  const nextComp = markRaw(mod as any)

  recordPreviewTiming(sourcePreviewId, 'hmr_sfc_props_staged', {
    podSlug: props.pod?.slug || null,
    visibleTextSample: visibleTextCandidates(nextPreviewProps).slice(0, 16),
  })
  Comp.value = nextComp
  renderedMode.value = 'sfc'
  renderedSfcArtifactId.value = sourcePreviewId
  renderedSfcPodSlug.value = props.pod?.slug || null
  const sourceIdentity: PodRuntimeIdentity = {
    organizationId: typeof route.params.org === 'string' ? route.params.org : 'local',
    subjectType: sourcePreviewId ? 'preview' : currentDraftPackId() ? 'draft' : 'preview',
    subjectId: sourcePreviewId || currentDraftPackId() || props.pod?.slug || 'source',
    packId: typeof route.params.packId === 'string' ? route.params.packId : 'base',
    releaseId: 'source',
    manifestHash: sourcePreviewId || currentDraftArtifactId() || 'working-tree',
    artifactRevision: sourcePreviewId || currentDraftArtifactId() || undefined,
    podSlug: props.pod?.slug || 'unknown',
    rendererMode: 'source',
  }
  const sourceBoundary = buildRuntimeBoundaryKey(sourceIdentity)
  if (vueRuntimeBoundaryKey.value !== sourceBoundary) frameGeneration += 1
  vueRuntimeIdentity.value = sourceIdentity
  vueRuntimeArtifactKey.value = buildRuntimeArtifactKey(sourceIdentity)
  vueRuntimeBoundaryKey.value = sourceBoundary
  vueScripts.value = []
  vueStylesheets.value = []
  vueRuntimeLoadKey.value = ''
  vueReady.value = false
  commitRenderedPreviewProps(nextPreviewProps)
  await nextTick()
  if (unmountVueRuntimePreview(sourcePreviewId)) {
    previewSlotRevision.value += 1
    await nextTick()
  }
  const timingKey = `${props.pod?.slug || ''}:${sourcePreviewId || ''}`
  if (sourcePreviewId && !committedSfcSwapTimingKeys.has(timingKey)) {
    committedSfcSwapTimingKeys.add(timingKey)
    recordPreviewTiming(sourcePreviewId, 'hmr_sfc_swap_committed')
  }
  await settleLayerSequencesForSourcePreview(sourcePreviewId, 'sfc-swap')
  previewState.value = {
    status: 'ready',
    sessionKey: `${vueRuntimeArtifactKey.value}:${previewSlotRevision.value}`,
    renderToken: `source-${previewSlotRevision.value}`,
  }
  publishRuntimeSnapshot()
}

async function loadVueRuntimePreview(): Promise<boolean> {
  if (!runtime.ensureRuntimeLoaded) {
    throw new Error('Vue runtime mode is not supported by this host.')
  }
  const request = runtimeLoadRequests.begin(
    `${props.pod?.slug || ''}:${currentCanvasArtifactId() || ''}:${activeSourcePreviewRevision.value}`,
  )
  const provisionalSessionKey = `${request.key}:${request.generation}`
  previewState.value = { status: 'resolving', sessionKey: provisionalSessionKey }
  const ensured = await runtime.ensureRuntimeLoaded(props.pod as PodDetails, {
    parentStylesInert: true,
  })
  if (!request.isCurrent()) return false
  const nextScripts = ensured.vueBundleUrls ?? []
  const nextStylesheets = ensured.stylesheetUrls ?? []
  const nextArtifactKey = ensured.runtimeArtifactKey || runtimeLoadKey(nextScripts, [])
  const nextBoundaryKey = ensured.runtimeBoundaryKey || nextArtifactKey
  if (vueRuntimeBoundaryKey.value !== nextBoundaryKey) {
    unmountVueRuntimePreview(currentCanvasArtifactId())
    readiness?.dispose()
    frameGeneration += 1
    vueReady.value = false
  }
  vueRuntimeLoadKey.value = runtimeLoadKey(nextScripts, nextStylesheets)
  vueRuntimeArtifactKey.value = nextArtifactKey
  vueRuntimeBoundaryKey.value = nextBoundaryKey
  vueRuntimeIdentity.value = ensured.runtimeIdentity || null
  vueScripts.value = nextScripts
  vueStylesheets.value = nextStylesheets
  previewState.value = { status: 'loading-assets', sessionKey: provisionalSessionKey }
  vueReady.value = ensured.ready && nextScripts.length === 0
  publishRuntimeSnapshot()
  return true
}

watch(
  () =>
    [
      props.pod?.slug,
      requestedEffectiveMode.value,
      currentCanvasArtifactId(),
      props.contentSourcePreviewId,
      props.contentReady,
      activeSourcePreviewRevision.value,
    ] as const,
  async ([slug, mode]) => {
    const selection = previewModeRequests.begin(
      `${slug || ''}:${mode}:${currentCanvasArtifactId() || ''}:${activeSourcePreviewRevision.value}`,
    )
    error.value = null

    if (!slug || !props.pod) {
      Comp.value = null
      renderedSfcArtifactId.value = null
      renderedSfcPodSlug.value = null
      settledLayerSequenceSourcePreviewId.value = null
      vueScripts.value = []
      vueStylesheets.value = []
      vueRuntimeLoadKey.value = ''
      vueRuntimeArtifactKey.value = ''
      vueRuntimeBoundaryKey.value = ''
      vueRuntimeIdentity.value = null
      vueReady.value = false
      vueFallbackActive.value = false
      renderedMode.value = null
      runtimeLoadRequests.dispose()
      return
    }

    loading.value = true
    try {
      const requestedSourcePreviewId = currentCanvasArtifactId()
      if (requestedSourcePreviewId || activeSourcePreviewId.value) {
        const timingKey = [
          slug,
          requestedSourcePreviewId || 'none',
          mode,
          props.mode,
          activeSourcePreviewRevision.value,
          props.contentSourcePreviewId || 'none',
          props.contentReady === false ? 'not-ready' : 'ready',
        ].join(':')
        if (!resolvedRenderModeTimingKeys.has(timingKey)) {
          resolvedRenderModeTimingKeys.add(timingKey)
          recordPreviewTiming(
            requestedSourcePreviewId || activeSourcePreviewId.value || null,
            'hmr_preview_render_mode_resolved',
            {
              podSlug: slug,
              routeMode: props.mode,
              requestedMode: mode,
              renderedMode: renderedMode.value,
              requestedSourcePreviewId,
              activeSourcePreviewId: activeSourcePreviewId.value || null,
              activeSourcePreviewPodSlug: activeSourcePreviewPodSlug.value || null,
              activeSourcePreviewDraftPackId: activeSourcePreviewDraftPackId.value || null,
              currentDraftPackId: currentDraftPackId() || null,
              activeSourcePreviewRevision: activeSourcePreviewRevision.value,
              contentSourcePreviewId: props.contentSourcePreviewId || null,
              contentReady: props.contentReady !== false,
              isActiveHmrSourcePreview: isActiveHmrSourcePreview(requestedSourcePreviewId),
              hasRenderablePreview: hasRenderablePreview.value,
            },
          )
        }
      }
      if (
        settledLayerSequenceSourcePreviewId.value &&
        settledLayerSequenceSourcePreviewId.value !== requestedSourcePreviewId
      ) {
        settledLayerSequenceSourcePreviewId.value = null
      }
      previewCssVars.value = runtime.getPreviewCssVars ? await runtime.getPreviewCssVars() : null
      if (!selection.isCurrent()) return
      if (mode === 'sfc') {
        if (!runtime.loadSfcComponent) {
          throw new Error('SFC mode is not supported by this host.')
        }
        const previousWindow = previewIframeWindow()
        if (Comp.value) {
          await waitForPreviewPaint(previousWindow)
          if (!selection.isCurrent()) return
        }
        const previousText = previewBodyText(previousWindow)
        const sourcePreviewId = currentCanvasArtifactId()
        const stagedPreviewProps = props.previewProps || {}
        if (
          Comp.value &&
          renderedMode.value === 'sfc' &&
          renderedSfcArtifactId.value === sourcePreviewId &&
          renderedSfcPodSlug.value === slug
        ) {
          commitRenderedPreviewProps(stagedPreviewProps)
          recordPreviewTiming(sourcePreviewId, 'hmr_sfc_existing_props_committed', {
            podSlug: slug,
          })
          await settleLayerSequencesForSourcePreview(sourcePreviewId, 'sfc-existing-props')
          if (!selection.isCurrent()) return
          await emitPreviewReadyAfterPaint(previewIframeWindow(), sourcePreviewId, {
            previousText,
            expectedTexts: visibleTextCandidates(stagedPreviewProps, previousText),
            source: 'sfc-existing-props',
          })
          return
        }

        let mod: unknown
        try {
          mod = await runtime.loadSfcComponent(props.pod)
          if (!selection.isCurrent()) return
        } catch (err) {
          if (!shouldFallbackToVueRuntime(err)) {
            throw err
          }
          vueFallbackActive.value = true
          if (!(await loadVueRuntimePreview())) return
          if (!selection.isCurrent()) return
          commitRenderedPreviewProps(props.previewProps || {})
          Comp.value = null
          renderedSfcArtifactId.value = null
          renderedSfcPodSlug.value = null
          renderedMode.value = 'vue'
          return
        }
        vueFallbackActive.value = false
        const dataReady = previewDataReady(sourcePreviewId)
        if (!selection.isCurrent()) return
        if (!dataReady) {
          // Deferring with no retry deadlocked the canvas on stacked source
          // turns: contentSourcePreviewId only updates after the shell's pod
          // data load completes, and when that outlasts the 4s window the
          // swap was dropped forever — the canvas stayed on the previous
          // artifact while chat announced success (live: the in-session
          // activation stall). Stash the loaded module; the resume watcher
          // below completes the swap the moment matching data arrives.
          deferredSfcSwap = { mod, sourcePreviewId, podSlug: slug, previousText }
          recordPreviewTiming(
            sourcePreviewId,
            'hmr_sfc_swap_deferred_until_matching_source_preview_data',
            {
              podSlug: slug,
              contentSourcePreviewId: props.contentSourcePreviewId || null,
              contentReady: props.contentReady !== false,
            },
          )
          return
        }
        deferredSfcSwap = null
        await nextTick()
        if (!selection.isCurrent()) return
        const nextPreviewProps = props.previewProps || {}
        await stageSfcComponentSwap(mod, nextPreviewProps, sourcePreviewId)
        if (!selection.isCurrent()) return
        const expectedTexts = visibleTextCandidates(nextPreviewProps, previousText)
        await emitPreviewReadyAfterPaint(previewIframeWindow(), sourcePreviewId, {
          previousText,
          expectedTexts,
          source: 'sfc-load',
        })
      } else if (mode === 'vue') {
        const sourcePreviewId = currentCanvasArtifactId()
        const isFallbackMode =
          vueFallbackActive.value &&
          (props.mode === 'sfc' || isActiveHmrSourcePreview(sourcePreviewId))
        if (!isFallbackMode) {
          vueFallbackActive.value = false
        }
        if (!(await loadVueRuntimePreview())) return
        if (!selection.isCurrent()) return
        commitRenderedPreviewProps(props.previewProps || {})
        Comp.value = null
        renderedSfcArtifactId.value = null
        renderedSfcPodSlug.value = null
        renderedMode.value = 'vue'
      } else {
        throw new Error(`Unknown mode: ${mode}`)
      }
    } catch (err) {
      if (selection.isCurrent()) failPreview(err)
    } finally {
      selection.commit(() => {
        loading.value = false
      })
    }
  },
  { immediate: true },
)

// Resume a deferred SFC swap the moment its matching source-preview data
// lands. The main mode watcher also lists contentSourcePreviewId in its deps,
// but its re-fire is not guaranteed to survive the async interleaving of a
// stacked-turn activation (live: four consecutive compiled-and-passed turns
// never painted) — this is the deterministic completion path.
async function resumeDeferredSfcSwap(): Promise<void> {
  const pending = deferredSfcSwap
  if (!pending) return
  if (loading.value) return // a live mode-watcher pass owns the swap
  if (props.contentReady === false) return
  if (pending.podSlug !== props.pod?.slug) {
    deferredSfcSwap = null
    return
  }
  const requestedId = currentCanvasArtifactId()
  if (pending.sourcePreviewId && requestedId !== pending.sourcePreviewId) {
    deferredSfcSwap = null // superseded by a newer artifact
    return
  }
  if (pending.sourcePreviewId && props.contentSourcePreviewId !== pending.sourcePreviewId) return

  deferredSfcSwap = null
  await nextTick()
  const nextPreviewProps = props.previewProps || {}
  await stageSfcComponentSwap(pending.mod, nextPreviewProps, pending.sourcePreviewId)
  recordPreviewTiming(pending.sourcePreviewId, 'hmr_sfc_swap_resumed_after_source_preview_data', {
    podSlug: pending.podSlug,
  })
  await emitPreviewReadyAfterPaint(previewIframeWindow(), pending.sourcePreviewId, {
    previousText: pending.previousText,
    expectedTexts: visibleTextCandidates(nextPreviewProps, pending.previousText),
    source: 'sfc-load-resumed',
  })
}

watch(
  () => [props.contentSourcePreviewId, props.contentReady] as const,
  () => {
    void resumeDeferredSfcSwap()
  },
)

// Data can land while a mode-watcher pass is mid-flight and still miss its
// 4s poll: that pass re-defers, and no prop change follows to retry. The
// loading edge covers the gap.
watch(loading, (isLoading) => {
  if (!isLoading) void resumeDeferredSfcSwap()
})

watch(brandPreviewRevision, async () => {
  previewCssVars.value = runtime.getPreviewCssVars ? await runtime.getPreviewCssVars() : null
})

watch(
  () => props.previewProps,
  (nextPreviewProps) => {
    if (loading.value && hasRenderablePreview.value) return

    const previousText = previewBodyText(previewIframeWindow())
    const expectedTexts = visibleTextCandidates(nextPreviewProps || {}, previousText)
    commitRenderedPreviewProps(nextPreviewProps || {})
    const sourcePreviewId = currentCanvasArtifactId()
    recordPreviewTiming(sourcePreviewId, 'hmr_preview_props_received', {
      source: 'preview-props-watch',
      contentSourcePreviewId: props.contentSourcePreviewId || null,
      contentReady: props.contentReady !== false,
      visibleTextSample: visibleTextCandidates(nextPreviewProps || {}).slice(0, 16),
    })
    if (hasRenderablePreview.value && !isActiveHmrSourcePreview(sourcePreviewId)) {
      void emitPreviewReadyAfterPaint(previewIframeWindow(), sourcePreviewId, {
        previousText,
        expectedTexts,
        source: 'preview-props',
      })
    }
  },
  { deep: true, immediate: true },
)

function handleScriptsLoaded(payload: { moduleScripts: string[]; extraStylesheets: string[] }) {
  if (effectiveMode.value !== 'vue') return
  if (runtimeLoadKey(payload.moduleScripts, payload.extraStylesheets) !== vueRuntimeLoadKey.value)
    return

  vueReady.value = true
  const state = previewState.value
  previewState.value = {
    status: 'mounting',
    sessionKey: 'sessionKey' in state ? state.sessionKey : vueRuntimeArtifactKey.value,
    renderToken: `pending-${renderGeneration + 1}`,
  }
}

function failPreview(failure: unknown): void {
  const normalized = normalizeRuntimeFailure(failure)
  const state = previewState.value
  previewState.value = {
    status: 'failed',
    sessionKey: 'sessionKey' in state ? state.sessionKey : vueRuntimeArtifactKey.value || 'preview',
    failure: normalized,
  }
  error.value = normalized.message
  vueReady.value = false
  publishRuntimeSnapshot()
}

watch(
  () =>
    [
      effectiveMode.value,
      vueReady.value,
      props.pod?.slug,
      renderedPreviewProps.value,
      loading.value,
    ] as const,
  () => {
    // Pod identity and preview props are one render transaction. A route
    // change updates the pod slug before the async mode loader has staged its
    // matching props; rendering during that window mounts the new component
    // with the previous pod's payload (Hero props briefly reached Cards Grid).
    // Including the loading edge in this watcher guarantees a render is
    // scheduled once the matched tuple has committed.
    if (loading.value) return

    void renderVueRuntimeIntoIframe().catch(failPreview)
  },
  { deep: true, immediate: true, flush: 'post' },
)
</script>

<template>
  <div
    class="relative flex-1 overflow-hidden flex items-start justify-center p-4 min-h-0"
    style="background: var(--pg-canvas-bg, var(--pg-bg))"
  >
    <div
      v-if="loading && !hasRenderablePreview && !hasMountedPreviewSurface"
      class="w-full h-full flex items-center justify-center"
    >
      <div class="text-gray-500">Loading preview...</div>
    </div>
    <div
      v-else-if="error && !hasRenderablePreview"
      class="w-full h-full flex items-center justify-center"
    >
      <div class="text-red-500 text-sm">{{ error }}</div>
    </div>
    <PodsPlayerPreviewDevice
      :key="previewFrameKey"
      ref="previewDeviceRef"
      v-else
      :device="viewport"
      :module-scripts="effectiveMode === 'vue' ? vueScripts : []"
      :extra-stylesheets="effectiveMode === 'vue' ? vueStylesheets : []"
      :runtime-owner="effectiveMode === 'vue' ? vueRuntimeArtifactKey : null"
      :ready="effectiveMode === 'sfc' ? true : vueReady"
      :css-vars="previewCssVars"
      :root-classes="['autumn-runtime']"
      :canvas-artifact-id="renderedCanvasArtifactId"
      :debug-fill="debugFill"
      :settle-layer-sequences="settleLayerSequencesForPreview"
      :settle-layer-sequences-revision="layerSequenceSettleRevision"
      :slot-revision="previewSlotRevision"
      class="flex relative"
      @scriptsLoaded="handleScriptsLoaded"
      @scriptsFailed="failPreview"
    >
      <template v-if="effectiveMode === 'sfc' && Comp">
        <div
          class="relative h-full w-full"
          :class="targetableValues.length ? 'cursor-crosshair' : ''"
          @click.capture="handleCanvasClick"
        >
          <component :is="Comp" v-bind="renderedPreviewProps" />
          <div
            v-if="targetableValues.length"
            class="pointer-events-none absolute left-3 top-3 z-30 rounded-full border bg-white/90 px-2 py-1 text-[10px] font-medium shadow-sm backdrop-blur"
            style="border-color: rgba(15, 23, 42, 0.16); color: rgb(51, 65, 85)"
          >
            {{
              selectedTargetKey
                ? `Target: ${targetableValues.find((target) => target.key === selectedTargetKey)?.label || 'selected element'}`
                : 'Click canvas text to target'
            }}
          </div>
        </div>
      </template>
      <template v-else-if="effectiveMode === 'vue'">
        <div class="h-full w-full">
          <div class="w-full h-full" data-pods-vue-mount="1" />
        </div>
      </template>
      <template v-else>
        <div class="w-full h-full flex items-center justify-center">
          <div class="text-gray-500">No preview available</div>
        </div>
      </template>
    </PodsPlayerPreviewDevice>
    <div
      v-if="loading && hasRenderablePreview"
      class="pointer-events-none absolute left-6 top-6 z-40 rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur-md"
      style="
        border-color: rgba(15, 23, 42, 0.14);
        background: rgba(255, 255, 255, 0.82);
        color: rgb(51, 65, 85);
      "
    >
      Updating canvas preview...
    </div>
    <div
      v-if="error && hasRenderablePreview"
      class="pointer-events-none absolute left-6 bottom-6 z-40 max-w-sm rounded-md border px-3 py-2 text-[11px] shadow-sm backdrop-blur-md"
      style="
        border-color: rgba(239, 68, 68, 0.25);
        background: rgba(254, 242, 242, 0.92);
        color: rgb(185, 28, 28);
      "
    >
      {{ error }}
    </div>
  </div>
</template>
