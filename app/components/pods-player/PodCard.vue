<script setup lang="ts">
import type { PodListItem } from '#pods-player/types'

/**
 * pods-playground-layer.app.components.pods-player.PodCard
 *
 * Shared browse card for a pod in the library. Hosts decide routing (`to`).
 */

defineProps<{
  pod: PodListItem
  to: string
}>()
</script>

<template>
  <NuxtLink
    :to="to"
    class="group block border border-gray-200 dark:border-neutral-800 rounded-lg overflow-hidden bg-white dark:bg-gray-800 transition hover:shadow-sm"
  >
    <div class="aspect-[3/2] bg-gray-100 dark:bg-neutral-900 overflow-hidden">
      <img
        v-if="pod.previewImageUrl"
        :src="pod.previewImageUrl"
        :alt="`${pod.label} preview`"
        class="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        data-pod-thumb
      />
      <div v-else class="h-full w-full flex items-center justify-center text-xs text-gray-500">
        No preview
      </div>
    </div>

    <div class="p-4 space-y-2">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-sm font-medium truncate group-hover:text-primary-600 transition-colors">
            {{ pod.label }}
          </div>
        </div>

        <div class="flex items-center gap-2">
          <UBadge v-if="pod.category" color="info" variant="soft" size="sm" class="capitalize">
            {{ pod.category }}
          </UBadge>
          <span v-if="pod.version" class="text-[10px] text-gray-500 font-mono">v{{ pod.version }}</span>
        </div>
      </div>

      <div v-if="pod.description" class="text-xs text-gray-500 line-clamp-2">
        {{ pod.description }}
      </div>
    </div>
  </NuxtLink>
</template>

