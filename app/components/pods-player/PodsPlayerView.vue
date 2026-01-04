<script setup lang="ts">
// Explicitly import from the layer's wrapper, not relying on auto-import
import PodsPlayerSingle from '../PodsPlayerSingle.vue'
import { useSlots } from 'vue'

/**
 * pods-player-layer.app.components.pods-player.PodsPlayerView
 *
 * “Page-level” pod view composition (but NOT a Nuxt route).
 *
 * IMPORTANT: This component intentionally stays visually identical to the
 * original `cms-story-components` playground page, which rendered only the
 * shared `<PodsPlayerSingle />` inside the host shell.
 *
 * We keep it as a wrapper so hosts have a stable extension surface via slots,
 * without introducing extra header chrome like “← Back”.
 */

defineProps<{
  slug: string
}>()

const slots = useSlots()
</script>

<template>
  <PodsPlayerSingle :slug="slug" class="h-full">
    <template #headerRight>
      <slot name="headerRight" />
    </template>
    <template v-if="slots.preview" #preview="slotProps">
      <slot name="preview" v-bind="slotProps" />
    </template>
    <template #rightPanelFooter>
      <slot name="rightPanelFooter" />
    </template>
  </PodsPlayerSingle>
</template>

