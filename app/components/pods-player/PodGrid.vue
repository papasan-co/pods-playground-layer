<script setup lang="ts">
import type { PodListItem } from '#pods-player/types'

/**
 * pods-playground-layer.app.components.pods-player.PodGrid
 *
 * Shared pod browse UI:
 * - search
 * - group by category
 * - consistent cards
 *
 * Hosts control routing via `toForSlug`.
 */

const props = defineProps<{
  pods: PodListItem[]
  toForSlug: (slug: string) => string
  title?: string
  subtitle?: string
}>()

const search = ref('')

const categoryLabels: Record<string, string> = {
  hero: 'Hero',
  maps: 'Maps',
  metrics: 'Metrics',
  stories: 'Stories',
  media: 'Media',
  layout: 'Layout',
  visuals: 'Visuals',
}

const podsByCategory = computed(() => {
  const categories = new Map<string, PodListItem[]>()

  props.pods.forEach((pod) => {
    const cat = pod.category || 'visuals'
    if (!categories.has(cat)) categories.set(cat, [])
    categories.get(cat)!.push(pod)
  })

  const filtered = new Map<string, PodListItem[]>()
  categories.forEach((categoryPods, category) => {
    const filteredPods = search.value
      ? categoryPods.filter((p) => {
          const q = search.value.toLowerCase()
          return (
            p.label.toLowerCase().includes(q) ||
            p.slug.toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q)
          )
        })
      : categoryPods

    if (filteredPods.length > 0) filtered.set(category, filteredPods)
  })

  return filtered
})

const sortedCategories = computed(() => {
  const order = ['hero', 'maps', 'metrics', 'stories', 'media', 'layout', 'visuals']
  return Array.from(podsByCategory.value.keys()).sort((a, b) => {
    const aIndex = order.indexOf(a)
    const bIndex = order.indexOf(b)
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })
})
</script>

<template>
  <div class="p-8">
    <div class="max-w-7xl mx-auto">
      <div class="mb-8">
        <h1 v-if="title" class="text-3xl font-bold mb-2">{{ title }}</h1>
        <p v-if="subtitle" class="text-gray-600 dark:text-gray-400">{{ subtitle }}</p>
      </div>

      <div class="mb-6">
        <UInput
          v-model="search"
          placeholder="Search pods..."
          icon="i-heroicons-magnifying-glass"
          size="lg"
          class="max-w-md"
        />
      </div>

      <div v-if="sortedCategories.length === 0" class="text-center py-12">
        <p class="text-gray-500">No pods found</p>
      </div>

      <div v-else class="space-y-8">
        <div v-for="category in sortedCategories" :key="category" class="space-y-4">
          <div class="border-b border-gray-200 dark:border-gray-700 pb-2">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {{ categoryLabels[category] || category }}
            </h2>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {{ podsByCategory.get(category)?.length }} pod{{ podsByCategory.get(category)?.length !== 1 ? 's' : '' }}
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <PodCard
              v-for="pod in podsByCategory.get(category)"
              :key="pod.slug"
              :pod="pod"
              :to="toForSlug(pod.slug)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

