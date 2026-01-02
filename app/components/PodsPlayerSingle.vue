<script setup lang="ts">
/**
 * pods-player-layer.app.components.PodsPlayerSingle
 *
 * Convenience wrapper so consuming apps can use `<PodsPlayerSingle />` without
 * relying on Nuxt scanning nested component directories from the layer.
 */

import Inner from './pods-player/PodsPlayerSingle.vue'
</script>

<template>
  <Inner v-bind="$attrs" />
</template>

