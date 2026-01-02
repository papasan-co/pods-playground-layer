<script setup lang="ts">
/**
 * pods-player-layer.app.components.PodCard
 *
 * Convenience re-export so consuming apps can use `<PodCard />` without needing
 * to remember the directory prefix (`PodsPlayerPodCard`).
 */

import PodsPlayerPodCard from './pods-player/PodCard.vue'
</script>

<template>
  <PodsPlayerPodCard v-bind="$attrs" />
</template>

