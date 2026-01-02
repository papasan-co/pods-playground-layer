<script setup lang="ts">
import type { PodListItem } from '#pods-player/types'

/**
 * pods-player-layer.app.components.pods-player.PodCard
 *
 * Shared browse card for a pod in the library. Hosts decide routing (`to`).
 */

defineProps<{
  pod: PodListItem
  to: string
}>()
</script>

<template>
  <NuxtLink :to="to" class="group">
    <UCard class="h-full hover:shadow-lg transition-shadow">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon
            v-if="pod.icon"
            :name="pod.icon"
            class="w-5 h-5 text-gray-400 group-hover:text-primary-600 transition-colors"
          />
          <h3 class="text-lg font-semibold group-hover:text-primary-600">
            {{ pod.label }}
          </h3>
        </div>
      </template>

      <p v-if="pod.description" class="text-sm text-gray-600 dark:text-gray-400">
        {{ pod.description }}
      </p>

      <template #footer>
        <div class="flex items-center justify-between text-xs text-gray-500">
          <span v-if="pod.version">v{{ pod.version }}</span>
          <span v-else />
        </div>
      </template>
    </UCard>
  </NuxtLink>
</template>

