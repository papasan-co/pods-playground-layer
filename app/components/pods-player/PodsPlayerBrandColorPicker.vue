<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDesignTokens } from '../../composables/pods-player/useDesignTokens'

/**
 * pods-playground-layer.app.components.pods-player.PodsPlayerBrandColorPicker
 *
 * Shared UI control for choosing a brand color:
 * - select from token groups/shades (driven by CSS vars)
 * - or pick a custom color
 *
 * Promoted from `cms-story-components` playground with a minimal token bridge.
 */

const props = defineProps<{
  modelValue?: string
  outputMode?: 'hex' | 'token'
  tokenOptions?: string[]
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
const colorGroupMap = computed(() => new Map(colorGroups.value.map((group) => [group.value, group.color])))

const selectedTokenKey = ref<string>('primary')
const customColor = ref<string>('#000000')
const effectiveOutputMode = computed(() => props.outputMode ?? 'hex')

const tokenSwatches = computed(() => {
  const allowedKeys = (props.tokenOptions && props.tokenOptions.length > 0)
    ? props.tokenOptions
    : colorGroups.value.map((group) => group.value)

  const unique = Array.from(new Set(allowedKeys))
  return unique
    .map((key) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      color: colorGroupMap.value.get(key) ?? null,
    }))
    .filter((swatch): swatch is { key: string; label: string; color: string } => Boolean(swatch.color))
})

const currentColor = computed(() => {
  if (effectiveOutputMode.value === 'token') {
    return getGroupColor500(selectedTokenKey.value)
  }
  if (colorMode.value === 'token') {
    const selected = tokenSwatches.value.find((swatch) => swatch.key === selectedTokenKey.value)
    return selected?.color ?? '#000000'
  }
  return customColor.value
})

watch(
  () => props.modelValue,
  (newValue) => {
    if (!newValue) {
      colorMode.value = 'token'
      selectedTokenKey.value = tokenSwatches.value[0]?.key ?? 'primary'
      return
    }

    if (effectiveOutputMode.value === 'token') {
      selectedTokenKey.value = String(newValue)
      colorMode.value = 'token'
      return
    }

    const asHex = String(newValue).toUpperCase()
    const matched = tokenSwatches.value.find((swatch) => swatch.color.toUpperCase() === asHex)
    if (matched) {
      colorMode.value = 'token'
      selectedTokenKey.value = matched.key
      return
    }
    colorMode.value = 'custom'
    customColor.value = String(newValue)
  },
  { immediate: true },
)

watch([colorMode, selectedTokenKey], () => {
  const nextValue = colorMode.value === 'token'
    ? (effectiveOutputMode.value === 'token' ? selectedTokenKey.value : currentColor.value)
    : customColor.value

  if (nextValue !== props.modelValue) emit('update:modelValue', nextValue)
})

watch(customColor, (newValue) => {
  if (colorMode.value === 'custom' && newValue !== props.modelValue) {
    emit('update:modelValue', newValue)
  }
})
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
        <div class="flex gap-1.5 flex-wrap">
          <button
            v-for="swatch in tokenSwatches"
            :key="swatch.key"
            type="button"
            class="flex flex-col items-center gap-1 group"
            :aria-label="swatch.label"
            :title="swatch.label"
            @click="selectedTokenKey = swatch.key"
          >
            <div
              class="w-8 h-8 rounded border transition-all"
              :class="{
                'border-blue-500 ring-2 ring-blue-500': selectedTokenKey === swatch.key,
                'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500': selectedTokenKey !== swatch.key
              }"
              :style="{ backgroundColor: swatch.color }"
            />
          </button>
        </div>
        <p v-if="tokenSwatches.length === 0" class="text-xs text-gray-500">
          No brand colors available.
        </p>
      </div>

      <div v-else class="space-y-2">
        <!-- Make the whole row the click target for the native color picker -->
        <label
          class="relative block rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <div class="flex items-center gap-2 min-w-0">
            <div
              class="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 shrink-0"
              :style="{ backgroundColor: customColor }"
            />
            <div class="min-w-0">
              <div class="text-sm font-medium text-gray-700 dark:text-gray-200">Custom</div>
              <div class="text-xs text-gray-600 dark:text-gray-400 font-mono truncate">{{ customColor }}</div>
            </div>
          </div>

          <!-- Invisible native control overlay -->
          <input
            v-model="customColor"
            type="color"
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Pick a custom color"
          />
        </label>
      </div>
    </div>
  </div>
</template>
