<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDesignTokens } from '../../composables/pods-player/useDesignTokens'
import { contrastRatio, ensureAaTextOnBackground, isHexColor } from '../../utils/colorA11y'

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
  outputMode?: 'hex' | 'token' | 'mixed'
  tokenOptions?: string[]
  contrastAgainst?: string
  enforceAaForText?: boolean
  minRatio?: number
  policy?: 'warn' | 'disableTokens'
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

const DEFAULT_BRAND_SWATCH_500: Record<string, string> = {
  primary: '#0F172A',
  secondary: '#4A70A9',
  tertiary: '#EFECE3',
  quaternary: '#8FABD4',
}

const getGroupColor500 = (group: string) => {
  if (!tokens.value?.color) return '#000000'
  return tokens.value.color[`${group}-500`] || DEFAULT_BRAND_SWATCH_500[group] || '#000000'
}

const colorGroups = computed(() => {
  const groups = ['primary', 'secondary', 'tertiary', 'quaternary']
  return groups.map((group) => ({
    value: group,
    label:
      group === 'tertiary'
        ? 'Support 1'
        : group === 'quaternary'
          ? 'Support 2'
          : group.charAt(0).toUpperCase() + group.slice(1),
    color: getGroupColor500(group),
  }))
})
const colorGroupMap = computed(() => new Map(colorGroups.value.map((group) => [group.value, group.color])))

const selectedTokenKey = ref<string>('primary')
const customColor = ref<string>('#000000')
const effectiveOutputMode = computed(() => props.outputMode ?? 'hex')
const effectiveMinRatio = computed(() => {
  if (typeof props.minRatio === 'number') return props.minRatio
  return props.enforceAaForText ? 4.5 : 3
})
const effectivePolicy = computed(() => props.policy ?? 'disableTokens')

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

function resolveInputToHex(input: string | undefined): string | null {
  if (!input) return null
  const value = String(input).trim()
  if (!value) return null
  if (isHexColor(value)) return value.toUpperCase()
  const tokenHex = getGroupColor500(value)
  return isHexColor(tokenHex) ? tokenHex.toUpperCase() : null
}

const contrastBackgroundHex = computed(() => resolveInputToHex(props.contrastAgainst))

function tokenPassesContrast(tokenKey: string): boolean {
  if (!props.enforceAaForText) return true
  if (!contrastBackgroundHex.value) return true
  const candidate = resolveInputToHex(tokenKey)
  if (!candidate) return true
  return contrastRatio(contrastBackgroundHex.value, candidate) >= effectiveMinRatio.value
}

const adjustedCustomColor = computed(() => {
  if (!props.enforceAaForText) return customColor.value
  if (!contrastBackgroundHex.value) return customColor.value
  return ensureAaTextOnBackground(contrastBackgroundHex.value, customColor.value)
})

const isCustomAdjusted = computed(() => {
  if (!props.enforceAaForText) return false
  if (!contrastBackgroundHex.value) return false
  if (!isHexColor(customColor.value)) return false
  return adjustedCustomColor.value.toUpperCase() !== customColor.value.toUpperCase()
})

const effectivePreviewColor = computed(() => {
  if (!props.enforceAaForText) return currentColor.value
  if (!contrastBackgroundHex.value) return currentColor.value
  return ensureAaTextOnBackground(contrastBackgroundHex.value, currentColor.value)
})

const isPreviewAdjusted = computed(() => {
  if (!props.enforceAaForText) return false
  if (!contrastBackgroundHex.value) return false
  const current = currentColor.value
  if (!isHexColor(current)) return false
  return effectivePreviewColor.value.toUpperCase() !== current.toUpperCase()
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

const collapsedDisplayColor = computed(() => {
  return effectivePreviewColor.value
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

    if (effectiveOutputMode.value === 'mixed') {
      const key = String(newValue)
      const hasToken = tokenSwatches.value.some((swatch) => swatch.key === key)
      if (hasToken) {
        selectedTokenKey.value = key
        colorMode.value = 'token'
        return
      }
      colorMode.value = 'custom'
      customColor.value = String(newValue)
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
    ? (effectiveOutputMode.value === 'hex' ? currentColor.value : selectedTokenKey.value)
    : customColor.value

  if (nextValue !== props.modelValue) emit('update:modelValue', nextValue)
})

watch(customColor, (newValue) => {
  if (colorMode.value === 'custom' && newValue !== props.modelValue) {
    emit('update:modelValue', newValue)
  }
})

function swatchLabel(key: string): string {
  if (key === 'tertiary') return 'Support 1'
  if (key === 'quaternary') return 'Support 2'
  return key.charAt(0).toUpperCase() + key.slice(1)
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
          :style="{ backgroundColor: collapsedDisplayColor }"
        />
        <div class="min-w-0">
          <div class="text-xs text-gray-600 dark:text-gray-400 font-mono truncate">{{ collapsedDisplayColor }}</div>
          <div
            v-if="isPreviewAdjusted"
            class="text-[11px] text-amber-600 dark:text-amber-400"
          >
            Preview adjusted for accessibility
          </div>
        </div>
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
            :title="swatchLabel(swatch.key)"
            :disabled="effectivePolicy === 'disableTokens' && !tokenPassesContrast(swatch.key)"
            @click="selectedTokenKey = swatch.key"
          >
            <div
              class="w-8 h-8 rounded border transition-all"
              :class="{
                'border-blue-500 ring-2 ring-blue-500': selectedTokenKey === swatch.key,
                'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500': selectedTokenKey !== swatch.key,
                'opacity-40 cursor-not-allowed': effectivePolicy === 'disableTokens' && !tokenPassesContrast(swatch.key)
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
        <div
          v-if="isPreviewAdjusted"
          class="text-xs text-amber-600 dark:text-amber-400 rounded border border-amber-300/60 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-900/20 px-2 py-1.5"
        >
          Preview adjusted for accessibility: {{ effectivePreviewColor }}
        </div>
      </div>
    </div>
  </div>
</template>
