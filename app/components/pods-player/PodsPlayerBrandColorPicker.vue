<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDesignTokens } from '~/composables/pods-player/useDesignTokens'

/**
 * pods-player-layer.app.components.pods-player.PodsPlayerBrandColorPicker
 *
 * Shared UI control for choosing a brand color:
 * - select from token groups/shades (driven by CSS vars)
 * - or pick a custom color
 *
 * Promoted from `cms-story-components` playground with a minimal token bridge.
 */

const props = defineProps<{
  modelValue?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const { tokens } = useDesignTokens()

const isExpanded = ref(false)
const colorMode = ref<'token' | 'custom'>('token')
const tabItems = [
  { label: 'Brand Colors', value: 'token' },
  { label: 'Custom Color', value: 'custom' },
]

const getGroupColor500 = (group: string) => {
  if (!tokens.value?.color) return '#000000'
  return tokens.value.color[`${group}-500`] || '#000000'
}

const colorGroups = computed(() => {
  const groups = ['primary', 'secondary', 'tertiary', 'quaternary', 'neutral']
  return groups.map((group) => ({
    value: group,
    label: group.charAt(0).toUpperCase() + group.slice(1),
    color: getGroupColor500(group),
  }))
})

const getShades = (group: string) => {
  if (!tokens.value?.color) return []
  const shades: string[] = []
  Object.keys(tokens.value.color).forEach((key) => {
    if (key.startsWith(`${group}-`)) shades.push(key.replace(`${group}-`, ''))
  })
  return shades.sort()
}

const selectedGroup = ref<string>('primary')
const selectedShade = ref<string>('500')
const customColor = ref<string>('#000000')
const explicitColor = ref<string | null>(null)

watch(
  () => props.modelValue,
  (newValue) => {
    if (!newValue) {
      colorMode.value = 'token'
      selectedGroup.value = 'primary'
      selectedShade.value = '500'
      explicitColor.value = null
      return
    }

    if (newValue === '#FFFFFF' || newValue === '#ffffff' || newValue === 'white') {
      colorMode.value = 'token'
      explicitColor.value = '#FFFFFF'
      return
    }
    if (newValue === '#000000' || newValue === '#000' || newValue === 'black') {
      colorMode.value = 'token'
      explicitColor.value = '#000000'
      return
    }

    explicitColor.value = null

    let foundToken = false
    if (tokens.value?.color) {
      Object.keys(tokens.value.color).forEach((key) => {
        if (tokens.value.color[key] === newValue) {
          const parts = key.split('-')
          if (parts.length >= 2 && parts[0]) {
            selectedGroup.value = parts[0]
            selectedShade.value = parts.slice(1).join('-')
            colorMode.value = 'token'
            foundToken = true
          }
        }
      })
    }

    if (!foundToken) {
      colorMode.value = 'custom'
      customColor.value = newValue
    }
  },
  { immediate: true },
)

const currentColor = computed(() => {
  if (explicitColor.value) return explicitColor.value
  if (colorMode.value === 'token' && tokens.value?.color) {
    const tokenKey = `${selectedGroup.value}-${selectedShade.value}`
    return tokens.value.color[tokenKey] || '#000000'
  }
  return customColor.value
})

watch([colorMode, selectedGroup, selectedShade, explicitColor], () => {
  const newColor = currentColor.value
  if (newColor !== props.modelValue) emit('update:modelValue', newColor)
})

watch(customColor, (newValue) => {
  if (colorMode.value === 'custom' && newValue !== props.modelValue) {
    explicitColor.value = null
    emit('update:modelValue', newValue)
  }
})

const getTokenColor = (group: string, shade: string) => {
  if (!tokens.value?.color) return '#000000'
  return tokens.value.color[`${group}-${shade}`] || '#000000'
}
</script>

<template>
  <div class="rounded-md border border-gray-200 dark:border-gray-700">
    <button
      type="button"
      class="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      @click="isExpanded = !isExpanded"
    >
      <div class="flex items-center gap-2">
        <div
          class="w-8 h-8 rounded border border-gray-300 dark:border-gray-600"
          :style="{ backgroundColor: currentColor }"
        />
        <span class="text-xs text-gray-600 dark:text-gray-400 font-mono">{{ currentColor }}</span>
      </div>
      <UIcon
        :name="isExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
        class="w-5 h-5 text-gray-400"
      />
    </button>

    <div v-if="isExpanded" class="p-4 space-y-3 border-t border-gray-200 dark:border-gray-700">
      <UTabs
        :model-value="colorMode"
        :items="tabItems"
        size="sm"
        variant="pill"
        :content="false"
        @update:model-value="colorMode = $event as 'token' | 'custom'"
      />

      <div v-if="colorMode === 'token'" class="space-y-3">
        <USelect
          v-model="selectedGroup"
          :items="colorGroups"
          value-attribute="value"
          label-attribute="label"
          size="sm"
          placeholder="Select color group"
        >
          <template #leading="{ modelValue }">
            <span
              v-if="modelValue"
              class="inline-block h-3 w-3 rounded-full mr-2"
              :style="`background-color: ${getGroupColor500(modelValue)}`"
            />
          </template>

          <template #item="{ item }">
            <div class="flex items-center gap-2">
              <span class="inline-block h-3 w-3 rounded-full shrink-0" :style="`background-color: ${item.color}`" />
              <span>{{ item.label }}</span>
            </div>
          </template>
        </USelect>

        <div v-if="selectedGroup" class="flex gap-1.5 flex-wrap">
          <button
            v-for="shade in getShades(selectedGroup)"
            :key="shade"
            type="button"
            class="flex flex-col items-center gap-1 group"
            @click="explicitColor = null; selectedShade = shade"
          >
            <span class="text-[10px] text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100">
              {{ shade }}
            </span>
            <div
              class="w-8 h-8 rounded border transition-all"
              :class="{
                'border-blue-500 ring-2 ring-blue-500': selectedShade === shade && !explicitColor,
                'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500': selectedShade !== shade || explicitColor
              }"
              :style="{ backgroundColor: getTokenColor(selectedGroup, shade) }"
            />
          </button>

          <button type="button" class="flex flex-col items-center gap-1 group" @click="explicitColor = '#FFFFFF'; emit('update:modelValue', '#FFFFFF')">
            <span class="text-[10px] text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100">White</span>
            <div
              class="w-8 h-8 rounded border transition-all"
              :class="{
                'border-blue-500 ring-2 ring-blue-500': currentColor === '#FFFFFF' || currentColor === '#ffffff',
                'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500': currentColor !== '#FFFFFF' && currentColor !== '#ffffff'
              }"
              style="background-color: #FFFFFF"
            />
          </button>

          <button type="button" class="flex flex-col items-center gap-1 group" @click="explicitColor = '#000000'; emit('update:modelValue', '#000000')">
            <span class="text-[10px] text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100">Black</span>
            <div
              class="w-8 h-8 rounded border transition-all"
              :class="{
                'border-blue-500 ring-2 ring-blue-500': currentColor === '#000000' || currentColor === '#000',
                'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500': currentColor !== '#000000' && currentColor !== '#000'
              }"
              style="background-color: #000000"
            />
          </button>
        </div>
      </div>

      <div v-else class="space-y-2">
        <UInput v-model="customColor" type="color" size="sm" />
      </div>
    </div>
  </div>
</template>

