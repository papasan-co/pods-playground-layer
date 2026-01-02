<script setup lang="ts">
/**
 * pods-player-layer.app.components.PodGrid
 *
 * Convenience re-export so consuming apps can use `<PodGrid />` without needing
 * to remember the directory prefix (`PodsPlayerPodGrid`).
 */

import PodsPlayerPodGrid from './pods-player/PodGrid.vue'
</script>

<template>
  <PodsPlayerPodGrid v-bind="$attrs" />
</template>

