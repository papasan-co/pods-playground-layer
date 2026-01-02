<script setup lang="ts">
import PodsPlayerView from './pods-player/PodsPlayerView.vue'

/**
 * pods-player-layer.app.components.PodsPlayerView
 *
 * Root re-export so hosts can reliably import from `@pods-player-layer/app/components/*`
 * without depending on Nuxt component auto-import behavior across layers.
 */
</script>

<template>
  <PodsPlayerView v-bind="$attrs" />
</template>

