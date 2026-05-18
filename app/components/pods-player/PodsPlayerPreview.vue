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
}>()

const emit = defineEmits<{
  selectTarget: [target: PodsPlayerCanvasTarget]
  ready: [payload: { sourcePreviewId: string | null }]
}>()

const runtime = usePodsPlayerRuntime()
const route = useRoute()
const brandPreviewRevision = useState(
  'pod-studio.brand.previewRevision',
  () => 0,
)

const Comp = shallowRef<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const vueScripts = ref<string[]>([])
const vueStylesheets = ref<string[]>([])
const vueRuntimeLoadKey = ref('')
const vueReady = ref(false)
const previewCssVars = ref<Record<string, string> | null>(null)
const debugFill = computed(() => route.query.debugFill === '1')
const targetableValues = computed(() =>
  [...(props.selectableTargets || [])]
    .filter((target) => target.displayValue.trim().length > 0)
    .sort((a, b) => b.displayValue.length - a.displayValue.length),
)

function handleCanvasClick(event: MouseEvent): void {
  if (!targetableValues.value.length) return

  const path =
    typeof event.composedPath === 'function' ? event.composedPath() : []

  for (const node of path) {
    if (!(node instanceof HTMLElement)) continue

    const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
    if (!text) continue

    const match = targetableValues.value.find((target) =>
      text.includes(target.displayValue),
    )
    if (match) {
      emit('selectTarget', match)
      break
    }
  }
}

function currentSourcePreviewId(): string | null {
  if (typeof route.query.sourcePreview === 'string' && route.query.sourcePreview) {
    return route.query.sourcePreview
  }

  if (typeof route.query.sourcePreviewId === 'string' && route.query.sourcePreviewId) {
    return route.query.sourcePreviewId
  }

  return null
}

function emitPreviewReady(sourcePreviewId: string | null): void {
  emit('ready', { sourcePreviewId })
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

async function emitPreviewReadyAfterPaint(win: Window | null, sourcePreviewId: string | null): Promise<void> {
  await nextTick()
  await waitForPreviewPaint(win)

  if (sourcePreviewId !== currentSourcePreviewId()) {
    return
  }

  emitPreviewReady(sourcePreviewId)
}

async function renderVueRuntimeIntoIframe() {
  if (!import.meta.client) return
  if (props.mode !== 'vue') return
  if (!vueReady.value) return
  if (!props.pod?.slug) return

  // The iframe is hosted by PodsPlayerPreviewDevice; find it and call into the runtime API.
  const frame = document.querySelector<HTMLIFrameElement>(
    'iframe[title="Pod preview"]',
  )
  const win = frame?.contentWindow ?? null
  const api = (win as any)?.__AUTUMN_PODS_VUE__
  if (!api || typeof api.renderPod !== 'function') return

  const googleKey = (window as any)?.__AUTUMN_RUNTIME__?.maps?.google?.key
  const injected =
    typeof googleKey === 'string' && googleKey
      ? { googleMapsKey: googleKey, apiKey: googleKey }
      : {}

  const sourcePreviewId = currentSourcePreviewId()

  api.renderPod({
    slug: props.pod.slug,
    mountSelector: '[data-pods-vue-mount="1"]',
    props: { ...(props.previewProps || {}), ...injected },
  })
  await emitPreviewReadyAfterPaint(win, sourcePreviewId)
}

function runtimeLoadKey(scripts: readonly string[], stylesheets: readonly string[]): string {
  return JSON.stringify({
    scripts,
    stylesheets,
  })
}

watch(
  () =>
    [
      props.pod?.slug,
      props.mode,
      brandPreviewRevision.value,
      route.query.sourcePreview,
      route.query.sourcePreviewId,
    ] as const,
  async ([slug, mode]) => {
    Comp.value = null
    error.value = null
    vueScripts.value = []
    vueStylesheets.value = []
    vueRuntimeLoadKey.value = ''
    vueReady.value = false

    if (!slug || !props.pod) return

    loading.value = true
    try {
      previewCssVars.value = runtime.getPreviewCssVars
        ? await runtime.getPreviewCssVars()
        : null
      if (mode === 'sfc') {
        if (!runtime.loadSfcComponent) {
          throw new Error('SFC mode is not supported by this host.')
        }
        const mod = await runtime.loadSfcComponent(props.pod)
        Comp.value = markRaw(mod as any)
        await emitPreviewReadyAfterPaint(import.meta.client ? window : null, currentSourcePreviewId())
      } else if (mode === 'vue') {
        if (!runtime.ensureRuntimeLoaded) {
          throw new Error('Vue runtime mode is not supported by this host.')
        }
        const ensured = await runtime.ensureRuntimeLoaded(props.pod)
        const nextScripts = ensured.vueBundleUrls ?? []
        const nextStylesheets = ensured.stylesheetUrls ?? []
        vueRuntimeLoadKey.value = runtimeLoadKey(nextScripts, nextStylesheets)
        vueScripts.value = nextScripts
        vueStylesheets.value = nextStylesheets
        vueReady.value = ensured.ready && nextScripts.length === 0
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

function handleScriptsLoaded(payload: { moduleScripts: string[]; extraStylesheets: string[] }) {
  if (props.mode !== 'vue') return
  if (runtimeLoadKey(payload.moduleScripts, payload.extraStylesheets) !== vueRuntimeLoadKey.value) return

  vueReady.value = true
}

watch(
  () =>
    [props.mode, vueReady.value, props.pod?.slug, props.previewProps] as const,
  () => void renderVueRuntimeIntoIframe(),
  { deep: true, immediate: true, flush: 'post' },
)
</script>

<template>
  <div
    class="flex-1 overflow-hidden flex items-start justify-center p-4 min-h-0"
    style="background: var(--pg-canvas-bg, var(--pg-bg))"
  >
    <PodsPlayerPreviewDevice
      :device="viewport"
      :module-scripts="mode === 'vue' ? vueScripts : []"
      :extra-stylesheets="mode === 'vue' ? vueStylesheets : []"
      :ready="mode === 'sfc' ? true : vueReady"
      :css-vars="previewCssVars"
      :root-classes="['autumn-runtime']"
      :debug-fill="debugFill"
      class="flex relative"
      @scriptsLoaded="handleScriptsLoaded"
    >
      <template v-if="loading">
        <div class="w-full h-full flex items-center justify-center">
          <div class="text-gray-500">Loading preview...</div>
        </div>
      </template>
      <template v-else-if="error">
        <div class="w-full h-full flex items-center justify-center">
          <div class="text-red-500 text-sm">{{ error }}</div>
        </div>
      </template>
      <template v-else-if="mode === 'sfc' && Comp">
        <div
          class="relative h-full w-full"
          :class="targetableValues.length ? 'cursor-crosshair' : ''"
          @click.capture="handleCanvasClick"
        >
          <component :is="Comp" v-bind="previewProps" />
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
      <template v-else-if="mode === 'vue'">
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
  </div>
</template>
