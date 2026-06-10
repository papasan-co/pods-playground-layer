<script setup lang="ts">
import type {
  PodDetails,
  PodsPlayerCanvasTarget,
  PodsPlayerMode,
  PodsPlayerViewport,
} from '#pods-player/types'
import { usePodsPlayerRuntime } from '#pods-player-runtime'
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
const committedSfcSwapTimingKeys = new Set<string>()
const settledLayerSequenceTimingKeys = new Set<string>()
const resolvedRenderModeTimingKeys = new Set<string>()

const vueScripts = ref<string[]>([])
const vueStylesheets = ref<string[]>([])
const vueRuntimeLoadKey = ref('')
const vueReady = ref(false)
const vueFallbackActive = ref(false)
const previewCssVars = ref<Record<string, string> | null>(null)
const debugFill = computed(() => route.query.debugFill === '1')
const renderedMode = ref<PodsPlayerMode | null>(null)
const requestedEffectiveMode = computed(() => {
  const sourcePreviewId = currentCanvasArtifactId()
  const shouldUseHmrSfc = isActiveHmrSourcePreview(sourcePreviewId)

  if ((props.mode === 'sfc' || shouldUseHmrSfc) && vueFallbackActive.value) {
    return 'vue'
  }

  return shouldUseHmrSfc ? 'sfc' : props.mode
})
const effectiveMode = computed(() => renderedMode.value || requestedEffectiveMode.value)
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

  const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Pod preview"]')

  return frame?.contentWindow ?? null
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

async function waitForExpectedPreviewTextOrChange(
  win: Window | null,
  expectedTexts: string[],
  previousText: string | null | undefined,
): Promise<{ expectedTextVisible: boolean; textChanged: boolean }> {
  if (!import.meta.client) {
    return { expectedTextVisible: false, textChanged: false }
  }

  const candidates = [...expectedTexts].sort((a, b) => b.length - a.length)
  const hasPreviousText = Boolean(previousText)
  const hasExpectedText = candidates.length > 0

  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    const nextText = previewBodyText(win)
    const comparableNextText = comparablePreviewText(nextText)
    if (
      candidates.some((candidate) => comparableNextText.includes(comparablePreviewText(candidate)))
    ) {
      return {
        expectedTextVisible: true,
        textChanged: hasPreviousText ? nextText !== previousText : false,
      }
    }

    if (!hasExpectedText && hasPreviousText && nextText && nextText !== previousText) {
      return { expectedTextVisible: false, textChanged: true }
    }

    await wait(50)
  }

  return { expectedTextVisible: false, textChanged: false }
}

async function waitForPreviewContent(win: Window | null): Promise<void> {
  if (!import.meta.client) return

  const deadline = Date.now() + 4000

  while (Date.now() < deadline) {
    const doc = win?.document ?? previewIframeWindow()?.document ?? document

    if (
      doc.querySelector(
        '[data-pod-surface="1"], [data-primitive], [data-pods-preview-root="1"] section',
      ) ||
      (doc.body?.textContent || '').trim().length > 0
    ) {
      return
    }

    await wait(50)
  }
}

async function waitForPreviewDataReady(sourcePreviewId: string | null = null): Promise<void> {
  if (!import.meta.client) return

  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    const dataReady =
      props.contentReady !== false &&
      (!sourcePreviewId || props.contentSourcePreviewId === sourcePreviewId)

    if (dataReady) {
      return
    }

    await wait(50)
  }
}

async function waitForCanvasArtifact(
  win: Window | null,
  sourcePreviewId: string | null,
): Promise<void> {
  if (!import.meta.client || !sourcePreviewId) return

  const deadline = Date.now() + 4000
  const selector = `[data-pods-canvas-artifact-id="${CSS.escape(sourcePreviewId)}"]`

  while (Date.now() < deadline) {
    const doc = win?.document ?? previewIframeWindow()?.document ?? document
    if (doc.querySelector(selector)) {
      return
    }

    await wait(50)
  }
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
  await waitForPreviewDataReady(sourcePreviewId)
  await nextTick()
  await waitForCanvasArtifact(win, sourcePreviewId)
  await waitForPreviewContent(win)
  const explicitPreviousText = options.previousText || ''
  const previousText = explicitPreviousText || previewBodyText(win)
  const registeredExpectedTexts = sourcePreviewExpectedTexts(sourcePreviewId, explicitPreviousText)
  const expectedTexts = [
    ...(sourcePreviewId && registeredExpectedTexts.length > 0
      ? registeredExpectedTexts
      : options.expectedTexts || []),
  ].filter((value, index, list) => list.indexOf(value) === index)
  const previewWait = await waitForExpectedPreviewTextOrChange(win, expectedTexts, previousText)
  await waitForPreviewPaint(win)
  const useFastHmrReadyPath = isActiveHmrSourcePreview(sourcePreviewId)
  if (!useFastHmrReadyPath) {
    await wait(50)
    await waitForPreviewPaint(win)
    if (previewWait.expectedTextVisible) {
      await wait(125)
      await waitForPreviewPaint(win)
    }
  }

  if (requestId !== previewReadyRequestId) {
    return
  }

  if (sourcePreviewId !== currentCanvasArtifactId()) {
    return
  }

  if (sourcePreviewId && expectedTexts.length > 0 && !previewWait.expectedTextVisible) {
    return
  }

  recordPreviewTiming(sourcePreviewId, 'canvas_painted_ready', {
    source: options.source || 'unknown',
    expectedTextCount: expectedTexts.length,
    expectedTextVisible: previewWait.expectedTextVisible,
    textChanged: previewWait.textChanged,
    fastHmrReadyPath: useFastHmrReadyPath,
  })
  emitPreviewReady(sourcePreviewId)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function vueRuntimeApi(win: Window | null): Promise<{
  renderPod: (args: unknown) => void
  unmount?: (args: unknown) => void
} | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const api = (win as any)?.__AUTUMN_PODS_VUE__

    if (api && typeof api.renderPod === 'function') {
      return api
    }

    await wait(50)
  }

  return null
}

function unmountVueRuntimePreview(sourcePreviewId: string | null): boolean {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Pod preview"]')
  const api = (frame?.contentWindow as any)?.__AUTUMN_PODS_VUE__
  if (!api || typeof api.unmount !== 'function') return false

  try {
    api.unmount({ mountSelector: '[data-pods-vue-mount="1"]' })
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
      await waitForPreviewDataReady()
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

  // The iframe is hosted by PodsPlayerPreviewDevice; find it and call into the runtime API.
  const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Pod preview"]')
  const win = frame?.contentWindow ?? null
  const api = await vueRuntimeApi(win)
  if (!api) return

  const googleKey = (window as any)?.__AUTUMN_RUNTIME__?.maps?.google?.key
  const injected =
    typeof googleKey === 'string' && googleKey
      ? { googleMapsKey: googleKey, apiKey: googleKey }
      : {}

  const sourcePreviewId = currentCanvasArtifactId()
  const previousText = previewBodyText(win)
  const expectedTexts = visibleTextCandidates(renderedPreviewProps.value, previousText)

  api.renderPod({
    slug: props.pod.slug,
    mountSelector: '[data-pods-vue-mount="1"]',
    props: { ...(renderedPreviewProps.value || {}), ...injected },
  })
  await emitPreviewReadyAfterPaint(win, sourcePreviewId, {
    previousText,
    expectedTexts,
    source: 'vue-runtime-render',
  })
}

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
  await wait(0)
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
}

async function loadVueRuntimePreview(): Promise<void> {
  if (!runtime.ensureRuntimeLoaded) {
    throw new Error('Vue runtime mode is not supported by this host.')
  }
  const ensured = await runtime.ensureRuntimeLoaded(props.pod as PodDetails)
  const nextScripts = ensured.vueBundleUrls ?? []
  const nextStylesheets = ensured.stylesheetUrls ?? []
  vueRuntimeLoadKey.value = runtimeLoadKey(nextScripts, nextStylesheets)
  vueScripts.value = nextScripts
  vueStylesheets.value = nextStylesheets
  vueReady.value = ensured.ready && nextScripts.length === 0
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
    error.value = null

    if (!slug || !props.pod) {
      Comp.value = null
      renderedSfcArtifactId.value = null
      renderedSfcPodSlug.value = null
      settledLayerSequenceSourcePreviewId.value = null
      vueScripts.value = []
      vueStylesheets.value = []
      vueRuntimeLoadKey.value = ''
      vueReady.value = false
      vueFallbackActive.value = false
      renderedMode.value = null
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
      if (mode === 'sfc') {
        if (!runtime.loadSfcComponent) {
          throw new Error('SFC mode is not supported by this host.')
        }
        const previousWindow = previewIframeWindow()
        if (Comp.value) {
          await waitForPreviewContent(previousWindow)
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
        } catch (err) {
          if (!shouldFallbackToVueRuntime(err)) {
            throw err
          }
          vueFallbackActive.value = true
          await loadVueRuntimePreview()
          commitRenderedPreviewProps(props.previewProps || {})
          Comp.value = null
          renderedSfcArtifactId.value = null
          renderedSfcPodSlug.value = null
          renderedMode.value = 'vue'
          return
        }
        vueFallbackActive.value = false
        await waitForPreviewDataReady(sourcePreviewId)
        await nextTick()
        const nextPreviewProps = props.previewProps || {}
        await stageSfcComponentSwap(mod, nextPreviewProps, sourcePreviewId)
        const expectedTexts = visibleTextCandidates(nextPreviewProps, previousText)
        await emitPreviewReadyAfterPaint(previewIframeWindow(), sourcePreviewId, {
          previousText,
          expectedTexts,
          source: 'sfc-load',
        })
      } else if (mode === 'vue') {
        vueFallbackActive.value = false
        await loadVueRuntimePreview()
        commitRenderedPreviewProps(props.previewProps || {})
        Comp.value = null
        renderedSfcArtifactId.value = null
        renderedSfcPodSlug.value = null
        renderedMode.value = 'vue'
      } else {
        throw new Error(`Unknown mode: ${mode}`)
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

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
    recordPreviewTiming(currentCanvasArtifactId(), 'hmr_preview_props_received', {
      source: 'preview-props-watch',
      contentSourcePreviewId: props.contentSourcePreviewId || null,
      contentReady: props.contentReady !== false,
      visibleTextSample: visibleTextCandidates(nextPreviewProps || {}).slice(0, 16),
    })
    if (hasRenderablePreview.value) {
      void emitPreviewReadyAfterPaint(previewIframeWindow(), currentCanvasArtifactId(), {
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
}

watch(
  () => [effectiveMode.value, vueReady.value, props.pod?.slug, renderedPreviewProps.value] as const,
  () => {
    if (
      loading.value &&
      renderedMode.value &&
      requestedEffectiveMode.value !== renderedMode.value
    ) {
      return
    }

    void renderVueRuntimeIntoIframe()
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
      v-else
      :device="viewport"
      :module-scripts="effectiveMode === 'vue' ? vueScripts : []"
      :extra-stylesheets="effectiveMode === 'vue' ? vueStylesheets : []"
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
