<script setup lang="ts">
import type { PodDetails, PodsPlayerMode, PodsPlayerViewport } from '#pods-player/types'
import { usePodsPlayerRuntime } from '#pods-player-runtime'
import PodsPlayerPreviewDevice from './PodsPlayerPreviewDevice.vue'
import PodsPlayerWebComponentMount from './PodsPlayerWebComponentMount.vue'

/**
 * pods-player-layer.app.components.pods-player.PodsPlayerStoryPreview
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

const Comp = shallowRef<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const wcScripts = ref<string[]>([])
const wcTag = ref<string | null>(null)
const wcReady = ref(false)

const scenes = computed<any[]>(() => {
  const label = props.pod?.label || props.pod?.slug || 'Pod'
  const slug = props.pod?.slug || 'pod'

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
    wcScripts.value = []
    wcTag.value = null
    wcReady.value = false

    if (!slug) return

    loading.value = true
    try {
      if (mode === 'sfc') {
        if (!runtime.loadSfcComponent) throw new Error('SFC mode is not supported by this host.')
        const mod = await runtime.loadSfcComponent(props.pod)
        Comp.value = markRaw(mod as any)
      } else {
        if (!runtime.ensureRuntimeLoaded) throw new Error('Web Component mode is not supported by this host.')
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

function visualPropsForStep(step: number) {
  // Always pass the current step into the visual for scrolly behaviors.
  return { ...(props.previewProps || {}), step }
}
</script>

<template>
  <div class="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4 min-h-0">
    <PodsPlayerPreviewDevice
      :key="`${pod.slug}::${mode}::${reloadKey ?? 0}`"
      :device="viewport"
      :scripts="mode === 'wc' ? wcScripts : []"
      :ready="mode === 'sfc' ? true : wcReady"
      :scrollable="true"
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
                  v-bind="visualPropsForStep(step)"
                  class="w-full h-full"
                />
                <template v-else>
                  <div v-if="!wcReady" class="w-full h-full grid place-items-center text-gray-500">Loading runtime…</div>
                  <PodsPlayerWebComponentMount
                    v-else-if="wcTag"
                    :tag="wcTag"
                    :props="visualPropsForStep(step)"
                  />
                  <div v-else class="w-full h-full grid place-items-center text-gray-500">No WC tag available.</div>
                </template>
              </div>
            </template>
          </StoryScrollyPage>
        </div>
      </template>
    </PodsPlayerPreviewDevice>
  </div>
</template>

