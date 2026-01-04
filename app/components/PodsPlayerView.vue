<script setup lang="ts">
import PodsPlayerView from './pods-player/PodsPlayerView.vue'
import { useSlots } from 'vue'

/**
 * pods-player-layer.app.components.PodsPlayerView
 *
 * Root re-export so hosts can reliably import from `@pods-player-layer/app/components/*`
 * without depending on Nuxt component auto-import behavior across layers.
 */

const slots = useSlots()
</script>

<template>
  <PodsPlayerView v-bind="$attrs">
    <template #headerRight>
      <slot name="headerRight" />
    </template>
    <template v-if="slots.preview" #preview="slotProps">
      <slot name="preview" v-bind="slotProps" />
    </template>
    <template #rightPanelFooter>
      <slot name="rightPanelFooter" />
    </template>
  </PodsPlayerView>
</template>

