<script setup lang="ts">
/**
 * pods-playground-layer.app.components.pods-player.PodsPlayerPlaygroundShell
 *
 * v2 four-column pod playground: workspace rail, pod list, canvas, field panel.
 */

import { usePodPlayer } from '../../composables/pods-player/usePodPlayer'
import { usePlaygroundLayout } from '../../composables/pods-player/usePlaygroundLayout'
import PodsPlayerWorkspaceRail from './PodsPlayerWorkspaceRail.vue'
import PodsPlayerPodList from './PodsPlayerPodList.vue'
import PodsPlayerCanvasToolbar from './PodsPlayerCanvasToolbar.vue'
import PodsPlayerCanvasCard from './PodsPlayerCanvasCard.vue'
import PodsPlayerFieldPanel from './PodsPlayerFieldPanel.vue'
import PodsPlayerPreview from './PodsPlayerPreview.vue'
import PodsPlayerStoryPreview from './PodsPlayerStoryPreview.vue'

const props = defineProps<{
  packs: { id: string; label: string }[]
  pods: { slug: string; label: string }[]
  activePackId: string
  packLabel: string
  packMeta?: string
  slug: string
  /** When false, show quiet artifact hint in canvas card */
  artifactReady?: boolean
  /** Cmd+K from playground chrome (e.g. host command palette) */
  onCmdK?: () => void
}>()

const emit = defineEmits<{
  selectPack: [id: string]
  selectPod: [slug: string]
  backToPacks: []
}>()

const slugRef = toRef(props, 'slug')

const {
  runtime,
  pod,
  mode,
  viewport,
  fixture,
  schema,
  loading,
  reloadKey,
  flatForm,
  previewProps,
  hasChanges,
  reloadComponent,
  applyFormUpdate,
} = usePodPlayer(slugRef)

function stepPod(delta: number) {
  const idx = props.pods.findIndex((p) => p.slug === props.slug)
  if (idx < 0) return
  const next = props.pods[idx + delta]
  if (next) emit('selectPod', next.slug)
}

const layout = usePlaygroundLayout({
  onCmdK: () => props.onCmdK?.(),
  onArrowLeft: () => stepPod(-1),
  onArrowRight: () => stepPod(1),
})

const {
  podListCollapsed,
  fieldPanelCollapsed,
  scrollMode,
  advancedFieldsOpen,
  showFixtures,
  showPropsTab,
  showYamlTab,
  togglePodList,
  toggleFieldPanel,
  toggleScrollMode,
} = layout

const podLabel = computed(() => pod.value?.label || pod.value?.slug || props.slug)

function setViewport(v: import('#pods-player/types').PodsPlayerViewport) {
  viewport.value = v
}

function setMode(m: import('#pods-player/types').PodsPlayerMode) {
  mode.value = m
}

function setShowFixtures(v: boolean) {
  showFixtures.value = v
}
function setShowPropsTab(v: boolean) {
  showPropsTab.value = v
}
function setShowYamlTab(v: boolean) {
  showYamlTab.value = v
}

function toggleAdvanced() {
  advancedFieldsOpen.value = !advancedFieldsOpen.value
}
</script>

<template>
  <div
    class="pods-playground-chrome flex h-full min-h-0 overflow-hidden"
    style="
      background: var(--pg-bg);
      font-family: var(--pg-font-sans);
      color: var(--pg-fg-primary);
    "
  >
    <!-- E2E / introspection: nearest Vue component owns usePodPlayer flatForm in setupState -->
    <section data-pods-flat-form-anchor class="pointer-events-none sr-only w-96" aria-hidden="true" />
    <PodsPlayerWorkspaceRail
      :packs="packs"
      :active-pack-id="activePackId"
      @select-pack="emit('selectPack', $event)"
    />

    <PodsPlayerPodList
      :pack-label="packLabel"
      :pack-meta="packMeta"
      :pods="pods"
      :active-slug="slug"
      :collapsed="podListCollapsed"
      @select-pod="emit('selectPod', $event)"
      @back="emit('backToPacks')"
      @expand="togglePodList()"
    />

    <div class="flex min-w-0 flex-1 flex-col overflow-hidden pr-3.5 pt-3.5">
      <PodsPlayerCanvasToolbar
        :pack-label="packLabel"
        :pod-label="podLabel"
        :viewport="viewport"
        :pod-list-collapsed="podListCollapsed"
        :field-panel-collapsed="fieldPanelCollapsed"
        :scroll-mode="scrollMode"
        :has-changes="hasChanges"
        :mode="mode"
        :supported-modes="runtime.supportedModes"
        :show-fixtures="showFixtures"
        :show-props-tab="showPropsTab"
        :show-yaml-tab="showYamlTab"
        @update:viewport="setViewport"
        @update:mode="setMode"
        @toggle-pod-list="togglePodList()"
        @toggle-field-panel="toggleFieldPanel()"
        @reload="reloadComponent()"
        @toggle-scroll-mode="toggleScrollMode()"
        @update:show-fixtures="setShowFixtures"
        @update:show-props-tab="setShowPropsTab"
        @update:show-yaml-tab="setShowYamlTab"
      />

      <PodsPlayerCanvasCard :artifact-ready="artifactReady !== false" :viewport="viewport">
        <div v-if="loading" class="flex flex-1 items-center justify-center p-8 text-sm" style="color: var(--pg-fg-meta)">
          Loading…
        </div>
        <div
          v-else-if="!pod"
          class="flex flex-1 items-center justify-center p-8 text-sm"
          style="color: var(--pg-fg-meta)"
        >
          Pod not found
        </div>
        <PodsPlayerStoryPreview
          v-else-if="scrollMode"
          :pod="pod"
          :mode="mode"
          :viewport="viewport"
          :preview-props="previewProps"
          :reload-key="reloadKey"
          class="min-h-0 flex-1"
        />
        <PodsPlayerPreview
          v-else
          :key="reloadKey"
          class="min-h-0 flex-1"
          :pod="pod"
          :mode="mode"
          :viewport="viewport"
          :preview-props="previewProps"
        />
      </PodsPlayerCanvasCard>
    </div>

    <PodsPlayerFieldPanel
      :pod="pod"
      :schema="schema"
      :fixture="fixture"
      :model-value="flatForm"
      :viewport="viewport"
      :collapsed="fieldPanelCollapsed"
      :advanced-open="advancedFieldsOpen"
      :show-props-tab="showPropsTab"
      :show-yaml-tab="showYamlTab"
      @update:model-value="applyFormUpdate"
      @update:viewport="setViewport"
      @toggle-advanced="toggleAdvanced"
      @expand="toggleFieldPanel()"
    />
  </div>
</template>
