<script setup lang="ts">
import type { PodDetails, PodsPlayerMode, PodsPlayerViewport } from '#pods-player/types'
import { usePodsPlayerRuntime } from '#pods-player-runtime'
import PodsPlayerPreviewDevice from './PodsPlayerPreviewDevice.vue'
import PodsPlayerWebComponentMount from './PodsPlayerWebComponentMount.vue'

/**
 * pods-player-layer.app.components.pods-player.PodsPlayerPreview
 *
 * Shared preview column for the pod playground.
 * - SFC mode: host runtime loads the Vue component
 * - WC mode: host runtime supplies bundle URLs + webComponentTag; layer injects bundles into an iframe
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

const wcScripts = ref<string[]>([])
const wcTag = ref<string | null>(null)
const wcReady = ref(false)

watch(
  () => [props.pod?.slug, props.mode] as const,
  async ([slug, mode]) => {
    Comp.value = null
    error.value = null
    wcScripts.value = []
    wcTag.value = null
    wcReady.value = false

    if (!slug || !props.pod) return

    loading.value = true
    try {
      if (mode === 'sfc') {
        if (!runtime.loadSfcComponent) {
          throw new Error('SFC mode is not supported by this host.')
        }
        const mod = await runtime.loadSfcComponent(props.pod)
        Comp.value = markRaw(mod as any)
      } else {
        if (!runtime.ensureRuntimeLoaded) {
          throw new Error('Web Component mode is not supported by this host.')
        }
        const ensured = await runtime.ensureRuntimeLoaded(props.pod)
        wcScripts.value = ensured.bundleUrls ?? []
        wcTag.value = ensured.webComponentTag ?? null
        wcReady.value = ensured.ready && wcScripts.value.length === 0
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
  wcReady.value = true
}
</script>

<template>
  <div class="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4 min-h-0">
    <PodsPlayerPreviewDevice
      :device="viewport"
      :scripts="mode === 'wc' ? wcScripts : []"
      :ready="mode === 'sfc' ? true : wcReady"
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
      <template v-else-if="mode === 'wc' && wcTag">
        <PodsPlayerWebComponentMount :tag="wcTag" :props="previewProps" />
      </template>
      <template v-else>
        <div class="w-full h-full flex items-center justify-center">
          <div class="text-gray-500">No preview available</div>
        </div>
      </template>
    </PodsPlayerPreviewDevice>
  </div>
</template>

