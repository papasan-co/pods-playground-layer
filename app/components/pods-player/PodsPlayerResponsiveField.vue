<script setup lang="ts">
import type { FormField } from '#pods-player/formMapper'
import type { PodsPlayerViewport } from '#pods-player/types'

/**
 * pods-playground-layer.app.components.pods-player.PodsPlayerResponsiveField
 *
 * A form control wrapper for fields marked `responsive: true` in YAML.
 * It keeps three values (desktop/tablet/phone) and edits the one that matches
 * the active viewport, while storing the full object.
 */

const props = defineProps<{
  field: FormField
  modelValue: Record<string, unknown>
  viewport: PodsPlayerViewport
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', payload: { field: string; value: unknown }): void
  (e: 'update:viewport', value: PodsPlayerViewport): void
}>()

const viewportMap = {
  laptop: 'desktop',
  tablet: 'tablet',
  phone: 'phone',
} as const

type ResponsiveNumber = number | { desktop?: number; tablet?: number; phone?: number }

function rangeValue(key: 'min' | 'max' | 'step'): number | undefined {
  const raw = (props.field as any)?.[key] as ResponsiveNumber | undefined
  if (raw == null) return undefined
  if (typeof raw === 'number') return raw
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const vp = viewportMap[props.viewport]
    const v = (raw as any)[vp]
    if (typeof v === 'number') return v
  }
  return undefined
}

const currentMin = computed(() => rangeValue('min'))
const currentMax = computed(() => rangeValue('max'))
const currentStep = computed(() => rangeValue('step'))

const currentValue = computed(() => {
  const responsiveValue = props.modelValue[props.field.name] as Record<string, unknown> | undefined
  if (responsiveValue && typeof responsiveValue === 'object' && !Array.isArray(responsiveValue)) {
    const key = viewportMap[props.viewport]
    const value = responsiveValue[key]
    if (value !== undefined && value !== null) return value
    return props.field.default ?? (props.field.type === 'slider' || props.field.type === 'input-number' ? 0 : '')
  }
  return props.field.default ?? (props.field.type === 'slider' || props.field.type === 'input-number' ? 0 : '')
})

function sliderUnitFromLabel(label: unknown): 'ms' | 's' | '' {
  const l = String(label ?? '').toLowerCase()
  if (!l) return ''
  if (l.includes('(ms)') || /\bms\b/.test(l) || l.includes('millisecond')) return 'ms'
  if (l.includes('(s)') || /\bsec\b/.test(l) || l.includes('second')) return 's'
  return ''
}

function formatSliderValue(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  const unit = sliderUnitFromLabel((props.field as any)?.label)
  if (unit === 'ms') return `${Math.round(n)}ms`
  if (unit === 's') {
    const str =
      Number.isInteger(n)
        ? String(n)
        : n
            .toFixed(2)
            .replace(/0+$/, '')
            .replace(/\.$/, '')
    return `${str}s`
  }
  return String(n)
}

function normalizeValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

function updateValue(value: unknown) {
  const normalized = normalizeValue(value)
  const responsiveValue = (props.modelValue[props.field.name] as Record<string, unknown>) || {
    desktop: props.field.default ?? '',
    tablet: props.field.default ?? '',
    phone: props.field.default ?? '',
  }

  const key = viewportMap[props.viewport]
  const updated = { ...responsiveValue, [key]: normalized }
  emit('update:modelValue', { field: props.field.name, value: updated })
}

const tabItems = [
  { value: 'laptop', icon: 'i-stash-desktop' },
  { value: 'tablet', icon: 'i-stash-tablet' },
  { value: 'phone', icon: 'i-stash-smartphone' },
]

function handleTabChange(value: string | number) {
  emit('update:viewport', value as PodsPlayerViewport)
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <label class="text-sm font-medium text-gray-700 dark:text-gray-200">
        {{ field.label }}
      </label>
      <UTabs
        :model-value="viewport"
        :items="tabItems"
        size="xs"
        variant="pill"
        :content="false"
        @update:model-value="handleTabChange"
      >
        <template #trigger="{ item }">
          <UIcon :name="item.icon" class="w-4 h-4" />
        </template>
      </UTabs>
    </div>

    <div>
      <div v-if="field.type === 'slider'" class="space-y-2">
        <div class="flex justify-end">
          <span class="text-xs text-gray-500 tabular-nums">{{ formatSliderValue(currentValue) }}</span>
        </div>
        <USlider
          class="w-full"
          size="sm"
          :model-value="Number(currentValue) || 0"
          :min="currentMin ?? 0"
          :max="currentMax ?? 100"
          :step="currentStep ?? 1"
          :tooltip="true"
          @update:model-value="(val) => updateValue(Array.isArray(val) ? val[0] : val)"
        />
      </div>

      <UInputNumber
        v-else-if="field.type === 'input-number'"
        class="w-full"
        size="sm"
        :model-value="Number(currentValue) || 0"
        :min="currentMin ?? undefined"
        :max="currentMax ?? undefined"
        :step="currentStep ?? 1"
        @update:model-value="updateValue"
      />

      <UInput
        v-else
        class="w-full"
        size="sm"
        :model-value="currentValue"
        :type="field.type === 'number' ? 'number' : 'text'"
        @update:model-value="updateValue"
      />
    </div>
  </div>
</template>

