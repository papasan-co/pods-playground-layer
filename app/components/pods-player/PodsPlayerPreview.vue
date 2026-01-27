<script setup lang="ts">
import type { PodDetails, PodsPlayerMode, PodsPlayerViewport } from '#pods-player/types'
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
}>()

const runtime = usePodsPlayerRuntime()

const Comp = shallowRef<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const vueScripts = ref<string[]>([])
const vueReady = ref(false)

async function renderVueRuntimeIntoIframe() {
  if (!import.meta.client) return
  if (props.mode !== 'vue') return
  if (!vueReady.value) return
  if (!props.pod?.slug) return

  // The iframe is hosted by PodsPlayerPreviewDevice; find it and call into the runtime API.
  const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Pod preview"]')
  const win = frame?.contentWindow as any
  const api = win?.__AUTUMN_PODS_VUE__
  if (!api || typeof api.renderPod !== 'function') return

  api.renderPod({ slug: props.pod.slug, mountSelector: '[data-pods-vue-mount="1"]', props: props.previewProps || {} })
}

watch(
  () => [props.pod?.slug, props.mode] as const,
  async ([slug, mode]) => {
    Comp.value = null
    error.value = null
    vueScripts.value = []
    vueReady.value = false

    if (!slug || !props.pod) return

    loading.value = true
    try {
      if (mode === 'sfc') {
        if (!runtime.loadSfcComponent) {
          throw new Error('SFC mode is not supported by this host.')
        }
        const mod = await runtime.loadSfcComponent(props.pod)
        Comp.value = markRaw(mod as any)
      } else if (mode === 'vue') {
        if (!runtime.ensureRuntimeLoaded) {
          throw new Error('Vue runtime mode is not supported by this host.')
        }
        const ensured = await runtime.ensureRuntimeLoaded(props.pod)
        vueScripts.value = ensured.vueBundleUrls ?? []
        vueReady.value = ensured.ready && vueScripts.value.length === 0
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

function handleScriptsLoaded() {
  if (props.mode === 'vue') vueReady.value = true
}

watch(
  () => [props.mode, vueReady.value, props.pod?.slug, props.previewProps] as const,
  () => void renderVueRuntimeIntoIframe(),
  { deep: true, immediate: true, flush: 'post' },
)
</script>

<template>
  <div class="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4 min-h-0">
    <PodsPlayerPreviewDevice
      :device="viewport"
      :module-scripts="mode === 'vue' ? vueScripts : []"
      :ready="mode === 'sfc' ? true : vueReady"
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
        <component :is="Comp" v-bind="previewProps" />
      </template>
      <template v-else-if="mode === 'vue'">
        <div class="w-full h-full" data-pods-vue-mount="1" />
      </template>
      <template v-else>
        <div class="w-full h-full flex items-center justify-center">
          <div class="text-gray-500">No preview available</div>
        </div>
      </template>
    </PodsPlayerPreviewDevice>
  </div>
</template>

