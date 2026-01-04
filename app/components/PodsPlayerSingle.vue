<script setup lang="ts">
/**
 * pods-player-layer.app.components.PodsPlayerSingle
 *
 * Convenience wrapper so consuming apps can use `<PodsPlayerSingle />` without
 * relying on Nuxt scanning nested component directories from the layer.
 */

import Inner from './pods-player/PodsPlayerSingle.vue'
import { useAttrs, useSlots } from 'vue'

const props = defineProps<{
  slug: string
}>()

const attrs = useAttrs()
const slots = useSlots()
</script>

<template>
  <Inner :slug="props.slug" v-bind="attrs">
    <template #headerRight>
      <slot name="headerRight" />
    </template>
    <template v-if="slots.preview" #preview="slotProps">
      <slot name="preview" v-bind="slotProps" />
    </template>
    <template #rightPanelFooter>
      <slot name="rightPanelFooter" />
    </template>
  </Inner>
</template>

