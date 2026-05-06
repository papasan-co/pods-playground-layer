<script setup lang="ts">
import type { PodDetails, PodsPlayerMode, PodsPlayerViewport } from '#pods-player/types'
import { usePodsPlayerRuntime } from '#pods-player-runtime'
import PodsPlayerPreviewDevice from './PodsPlayerPreviewDevice.vue'

/**
 * pods-playground-layer.app.components.pods-player.PodsPlayerStoryPreview
 *
 * A reactive “Scroll mode” preview renderer that stays in the same Vue tree as the
 * right-hand form panel, so updates to `previewProps` re-render instantly.
 *
 * This uses StoryScrollyPage (from storytime-layer) inside a scrollable preview iframe.
 */

const props = defineProps<{
  pod: PodDetails
  mode: PodsPlayerMode
  viewport: PodsPlayerViewport
  previewProps: Record<string, unknown>
  reloadKey?: number
}>()

const runtime = usePodsPlayerRuntime()
const route = useRoute()

const Comp = shallowRef<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const vueScripts = ref<string[]>([])
const vueReady = ref(false)
const previewCssVars = ref<Record<string, string> | null>(null)
const debugFill = computed(() => route.query.debugFill === '1')

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function scrollVisualProps(
  slug: string,
  baseProps: Record<string, unknown>,
  step: number,
  stepCount = 0,
) {
  const visualProps: Record<string, unknown> = { ...(baseProps || {}), step }
  if (slug === 'steps') {
    visualProps.activeStep = Math.min(Math.max(step + 1, 1), Math.max(stepCount, 1))
  }
  return visualProps
}

/**
 * pods-playground-layer.VueRuntimeVisual
 *
 * Lightweight bridge that renders a pod into an iframe mount using the Vue runtime API.
 * This component lives in the host Vue tree (mounted into the iframe DOM), but calls
 * into the iframe's `window.__AUTUMN_PODS_VUE__` for actual pod rendering.
 */
const VueRuntimeVisual = defineComponent({
  name: 'VueRuntimeVisual',
  props: {
    slug: { type: String, required: true },
    step: { type: Number, required: true },
    stepCount: { type: Number, default: 0 },
    baseProps: { type: Object as PropType<Record<string, unknown>>, required: true },
  },
  setup(props) {
    function render() {
      if (!import.meta.client) return
      const frame = document.querySelector<HTMLIFrameElement>('iframe[title=\"Pod preview\"]')
      const win = frame?.contentWindow as any
      const api = win?.__AUTUMN_PODS_VUE__
      if (!api || typeof api.renderPod !== 'function') return

      const googleKey = (window as any)?.__AUTUMN_RUNTIME__?.maps?.google?.key
      const injected =
        typeof googleKey === 'string' && googleKey
          ? { googleMapsKey: googleKey, apiKey: googleKey }
          : {}
      api.renderPod({
        slug: props.slug,
        mountSelector: '[data-pods-vue-mount=\"1\"]',
        props: { ...scrollVisualProps(props.slug, props.baseProps || {}, props.step, props.stepCount), ...injected },
      })
    }

    onMounted(() => render())
    onUpdated(() => render())

    return () => h('div', { class: 'w-full h-full', 'data-pods-vue-mount': '1' })
  },
})

const stepsScrollRows = computed(() => {
  if (props.pod?.slug !== 'steps') return []
  const rawSteps = props.previewProps?.steps
  if (!Array.isArray(rawSteps)) return []

  return rawSteps
    .filter(isRecord)
    .map((step, index) => ({
      title: textValue(step.title, `Step ${index + 1}`),
      body: textValue(step.body),
    }))
    .filter((step) => step.title || step.body)
})

const stepCount = computed(() => stepsScrollRows.value.length)

const scenes = computed<any[]>(() => {
  const label = props.pod?.label || props.pod?.slug || 'Pod'
  const slug = props.pod?.slug || 'pod'
  const stepRows = stepsScrollRows.value

  if (slug === 'steps' && stepRows.length) {
    return [
      {
        key: 'steps-preview',
        layout: 'split',
        visual: { podSlug: slug },
        mobileLeadInDvh: 90,
        mobileLeadOutDvh: 60,
        mobileCardGapDvh: 130,
        articles: stepRows.map((step, index) => ({
          align: 'left',
          blocks: [
            {
              type: 'copy',
              props: {
                pre: `Step ${index + 1}`,
                title: step.title,
                paragraphs: step.body ? [step.body] : ['Scroll to activate this step in the visual.'],
              },
            },
          ],
        })),
      },
    ]
  }

  return [
    {
      key: 'pod-preview',
      layout: 'split',
      visual: { podSlug: slug },
      mobileLeadInDvh: 120,
      mobileLeadOutDvh: 60,
      mobileCardGapDvh: 160,
      articles: [
        {
          align: 'left',
          blocks: [
            {
              type: 'copy',
              props: {
                pre: 'Preview',
                title: label,
                paragraphs: ['Scroll to step through the scene.'],
              },
            },
          ],
        },
        {
          align: 'left',
          blocks: [
            {
              type: 'copy',
              props: {
                pre: 'Step 1',
                title: 'Narrative context',
                paragraphs: ['Edit fields to see the visual update reactively.'],
              },
            },
          ],
        },
        {
          align: 'left',
          blocks: [
            {
              type: 'cta',
              props: {
                headline: 'Call to action',
                caption: 'This is a placeholder CTA block for story testing.',
                buttonLabel: 'Continue',
                modalUrl: '',
              },
            },
            { type: 'mediaCaption', props: { caption: 'Generated preview scaffold', credit: 'Autumn' } },
          ],
        },
      ],
    },
  ]
})

watch(
  () => [props.pod?.slug, props.mode, props.reloadKey] as const,
  async ([slug, mode]) => {
    Comp.value = null
    error.value = null
    vueScripts.value = []
    vueReady.value = false

    if (!slug) return

    loading.value = true
    try {
      previewCssVars.value = runtime.getPreviewCssVars ? await runtime.getPreviewCssVars() : null
      if (mode === 'sfc') {
        if (!runtime.loadSfcComponent) throw new Error('SFC mode is not supported by this host.')
        const mod = await runtime.loadSfcComponent(props.pod)
        Comp.value = markRaw(mod as any)
      } else if (mode === 'vue') {
        if (!runtime.ensureRuntimeLoaded) throw new Error('Vue runtime mode is not supported by this host.')
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
</script>

<template>
  <div
    class="flex-1 overflow-hidden flex items-center justify-center p-4 min-h-0"
    style="background: var(--pg-canvas-bg, var(--pg-bg))"
  >
    <PodsPlayerPreviewDevice
      :key="`${pod.slug}::${mode}::${reloadKey ?? 0}`"
      :device="viewport"
      :module-scripts="mode === 'vue' ? vueScripts : []"
      :ready="mode === 'sfc' ? true : vueReady"
      :scrollable="true"
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
      <template v-else>
        <div class="min-h-screen bg-white dark:bg-gray-950">
          <!-- StoryScrollyPage is provided by storytime-layer (host app extends it) -->
          <StoryScrollyPage :scenes="scenes" :controls="true">
            <template #visual="{ step }">
              <div class="w-full h-full">
                <component
                  v-if="mode === 'sfc' && Comp"
                  :is="Comp"
                  v-bind="scrollVisualProps(pod.slug, previewProps || {}, step, stepCount)"
                  class="w-full h-full"
                />
                <template v-else-if="mode === 'vue'">
                  <div v-if="!vueReady" class="w-full h-full grid place-items-center text-gray-500">Loading runtime…</div>
                  <VueRuntimeVisual
                    v-else
                    :slug="pod.slug"
                    :step="step"
                    :step-count="stepCount"
                    :base-props="previewProps || {}"
                  />
                </template>
                <div v-else class="w-full h-full grid place-items-center text-gray-500">No preview available.</div>
              </div>
            </template>
          </StoryScrollyPage>
        </div>
      </template>
    </PodsPlayerPreviewDevice>
  </div>
</template>
