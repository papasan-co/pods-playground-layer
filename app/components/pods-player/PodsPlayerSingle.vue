<script setup lang="ts">
import type { PodsPlayerViewport } from '#pods-player/types'
import { usePodPlayer } from '../../composables/pods-player/usePodPlayer'
import PodsPlayerViewportSwitcher from './PodsPlayerViewportSwitcher.vue'
import PodsPlayerModeSwitcher from './PodsPlayerModeSwitcher.vue'
import PodsPlayerPreview from './PodsPlayerPreview.vue'
import PodsPlayerMetaPanel from './PodsPlayerMetaPanel.vue'

/**
 * pods-playground-layer.app.components.pods-player.PodsPlayerSingle
 *
 * Legacy two-column pod playground layout. State lives in usePodPlayer.
 */

const props = defineProps<{
  slug: string
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
</script>

<template>
  <div class="flex h-full overflow-hidden">
    <section class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div class="border-b border-default p-4 flex items-center bg-white bg-default">
        <div class="flex-1">
          <div class="text-sm font-semibold">
            {{ pod?.label || 'Pod' }}
            <span v-if="pod?.slug" class="text-xs text-muted">({{ pod.slug }})</span>
          </div>
          <p v-if="pod?.description" class="text-xs text-muted mt-1">
            {{ pod.description }}
          </p>
        </div>

        <div class="flex-1 flex justify-center">
          <PodsPlayerViewportSwitcher v-model="viewport" />
        </div>

        <div class="flex-1 flex items-center justify-end gap-3">
          <slot name="headerRight" />
          <PodsPlayerModeSwitcher v-model="mode" :supported-modes="runtime.supportedModes" />
          <UButton
            icon="i-lucide-refresh-cw"
            :color="hasChanges ? 'info' : 'neutral'"
            :variant="hasChanges ? 'solid' : 'outline'"
            size="sm"
            title="Reload preview"
            @click="reloadComponent"
          />
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center h-full">
        <div class="text-muted">Loading…</div>
      </div>
      <div v-else-if="!pod" class="flex items-center justify-center h-full">
        <div class="text-muted">Pod not found</div>
      </div>
      <slot
        v-else
        name="preview"
        :pod="pod"
        :mode="mode"
        :viewport="viewport"
        :preview-props="previewProps"
        :reloadKey="reloadKey"
      >
        <PodsPlayerPreview
          :key="reloadKey"
          :pod="pod"
          :mode="mode"
          :viewport="viewport"
          :preview-props="previewProps"
        />
      </slot>
    </section>

    <section class="w-96 border-l border-default flex flex-col bg-white bg-default">
      <slot
        name="rightPanel"
        :pod="pod"
        :schema="schema"
        :fixture="fixture"
        :model-value="flatForm"
        :viewport="viewport"
        :update-model-value="applyFormUpdate"
        :update-viewport="(val: PodsPlayerViewport) => (viewport = val)"
      >
        <PodsPlayerMetaPanel
          :pod="pod"
          :schema="schema"
          :fixture="fixture"
          :model-value="flatForm"
          :viewport="viewport"
          @update:model-value="applyFormUpdate"
          @update:viewport="(val) => (viewport = val)"
        />
        <slot name="rightPanelFooter" />
      </slot>
    </section>
  </div>
</template>
