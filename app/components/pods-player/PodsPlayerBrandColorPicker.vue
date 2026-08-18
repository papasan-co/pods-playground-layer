<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDesignTokens } from '../../composables/pods-player/useDesignTokens'
import { contrastRatio, ensureAaTextOnBackground, isHexColor } from '../../utils/colorA11y'

type PreviewMode = 'swatch' | 'cta-primary' | 'cta-secondary'

const props = defineProps<{
  modelValue?: string
  outputMode?: 'hex' | 'token' | 'mixed'
  tokenOptions?: string[]
  contrastAgainst?: string
  enforceAaForText?: boolean
  minRatio?: number
  policy?: 'warn' | 'disableTokens'
  allowAuto?: boolean
  allowCustom?: boolean
  autoLabel?: string
  previewMode?: PreviewMode
  previewText?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const { tokens } = useDesignTokens()

const isExpanded = ref(false)
const colorMode = ref<'token' | 'custom'>('token')

const DEFAULT_BRAND_SWATCH_500: Record<string, string> = {
  primary: '#0F172A',
  secondary: '#4A70A9',
  tertiary: '#EFECE3',
  quaternary: '#8FABD4',
}

const effectiveOutputMode = computed(() => props.outputMode ?? 'hex')
const effectiveAllowAuto = computed(() => props.allowAuto ?? false)
const effectiveAllowCustom = computed(() => props.allowCustom ?? true)
const effectiveAutoLabel = computed(() => props.autoLabel ?? 'Pack default')
const effectivePreviewMode = computed<PreviewMode>(() => props.previewMode ?? 'swatch')
const effectivePreviewText = computed(() => props.previewText ?? 'Button')
const tabItems = computed(() =>
  effectiveAllowCustom.value
    ? [
        { label: 'Brand Colors', value: 'token' },
        { label: 'Custom Color', value: 'custom' },
      ]
    : [{ label: 'Brand Colors', value: 'token' }],
)
const effectiveMinRatio = computed(() => {
  if (typeof props.minRatio === 'number') return props.minRatio
  return props.enforceAaForText ? 4.5 : 3
})
const effectivePolicy = computed(() => props.policy ?? 'disableTokens')

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

const selectedTokenKey = ref<string>(effectiveAllowAuto.value ? 'auto' : 'primary')
const customColor = ref<string>('#000000')

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

function swatchLabel(key: string): string {
  if (key === 'tertiary') return 'Support 1'
  if (key === 'quaternary') return 'Support 2'
  return key.charAt(0).toUpperCase() + key.slice(1)
}

function resolveAutoPreviewColor(): string {
  return effectivePreviewMode.value === 'cta-secondary'
    ? 'var(--pods-cta-btn-secondary-text,var(--pods-v2-accent,#4F46E5))'
    : 'var(--pods-cta-btn-primary-bg,var(--pods-v2-accent,#4F46E5))'
}

const contrastBackgroundHex = computed(() => resolveInputToHex(props.contrastAgainst))
const selectedColorHex = computed(() => {
  if (colorMode.value === 'token') {
    if (selectedTokenKey.value === 'auto') return null
    return resolveInputToHex(selectedTokenKey.value)
  }
  return resolveInputToHex(customColor.value)
})

function tokenPassesContrast(tokenKey: string): boolean {
  if (!props.enforceAaForText) return true
  if (!contrastBackgroundHex.value) return true
  const candidate = resolveInputToHex(tokenKey)
  if (!candidate) return true
  return contrastRatio(contrastBackgroundHex.value, candidate) >= effectiveMinRatio.value
}

const currentColor = computed(() => {
  if (colorMode.value === 'token') {
    if (selectedTokenKey.value === 'auto') return resolveAutoPreviewColor()
    return getGroupColor500(selectedTokenKey.value)
  }
  return customColor.value
})

const effectivePreviewColor = computed(() => {
  if (effectivePreviewMode.value !== 'swatch') return currentColor.value
  if (!props.enforceAaForText) return currentColor.value
  if (!contrastBackgroundHex.value) return currentColor.value
  return ensureAaTextOnBackground(contrastBackgroundHex.value, currentColor.value)
})

const ctaPreviewTextColor = computed(() => {
  if (effectivePreviewMode.value !== 'cta-primary') {
    return effectivePreviewMode.value === 'cta-secondary'
      ? (colorMode.value === 'token' && selectedTokenKey.value === 'auto'
          ? 'var(--pods-cta-btn-secondary-text,var(--pods-v2-accent,#4F46E5))'
          : currentColor.value)
      : '#FFFFFF'
  }

  if (colorMode.value === 'token' && selectedTokenKey.value === 'auto') {
    return 'var(--pods-cta-btn-primary-text,#FFFFFF)'
  }

  return selectedColorHex.value
    ? ensureAaTextOnBackground(selectedColorHex.value, '#FFFFFF')
    : '#FFFFFF'
})

const ctaPreviewStyle = computed<Record<string, string>>(() => {
  if (effectivePreviewMode.value === 'cta-primary') {
    return {
      height: '56px',
      backgroundColor: currentColor.value,
      borderColor: currentColor.value,
      color: ctaPreviewTextColor.value,
    }
  }

  if (effectivePreviewMode.value === 'cta-secondary') {
    return {
      height: '56px',
      backgroundColor: 'transparent',
      borderColor: currentColor.value,
      color: ctaPreviewTextColor.value,
    }
  }

  return {}
})

const isPreviewAdjusted = computed(() => {
  if (effectivePreviewMode.value === 'cta-primary') {
    if (!selectedColorHex.value) return false
    return ctaPreviewTextColor.value.toUpperCase() !== '#FFFFFF'
  }
  if (effectivePreviewMode.value !== 'swatch') return false
  if (!props.enforceAaForText) return false
  if (!contrastBackgroundHex.value) return false
  const current = currentColor.value
  if (!isHexColor(current)) return false
  return effectivePreviewColor.value.toUpperCase() !== current.toUpperCase()
})

const collapsedDisplayColor = computed(() => effectivePreviewMode.value === 'swatch' ? effectivePreviewColor.value : currentColor.value)
const collapsedDisplayLabel = computed(() =>
  colorMode.value === 'token' && selectedTokenKey.value === 'auto'
    ? effectiveAutoLabel.value
    : collapsedDisplayColor.value,
)

watch(
  () => props.modelValue,
  (newValue) => {
    if (!effectiveAllowCustom.value) colorMode.value = 'token'
    if (!newValue) {
      colorMode.value = 'token'
      selectedTokenKey.value = effectiveAllowAuto.value ? 'auto' : (tokenSwatches.value[0]?.key ?? 'primary')
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
      if (hasToken || (effectiveAllowAuto.value && key === 'auto')) {
        selectedTokenKey.value = key
        colorMode.value = 'token'
        return
      }
      if (!effectiveAllowCustom.value) {
        selectedTokenKey.value = effectiveAllowAuto.value ? 'auto' : (tokenSwatches.value[0]?.key ?? 'primary')
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
    if (!effectiveAllowCustom.value) {
      colorMode.value = 'token'
      selectedTokenKey.value = effectiveAllowAuto.value ? 'auto' : (tokenSwatches.value[0]?.key ?? 'primary')
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
</script>

<template>
  <div class="rounded-md border border-default">
    <button
      type="button"
      class="w-full px-4 py-3 flex items-center justify-between hover:bg-elevated transition-colors"
      @click="isExpanded = !isExpanded"
    >
      <div class="flex items-center gap-2">
        <div
          class="w-8 h-8 rounded border border-accented"
          :style="{ backgroundColor: collapsedDisplayColor }"
        />
        <div class="min-w-0">
          <div class="text-xs text-muted text-dimmed font-mono truncate">{{ collapsedDisplayLabel }}</div>
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
        class="w-5 h-5 text-dimmed"
      />
    </button>

    <div v-if="isExpanded" class="p-4 space-y-3 border-t border-default">
      <UTabs
        v-if="effectiveAllowCustom"
        :model-value="colorMode"
        :items="tabItems"
        size="sm"
        variant="pill"
        :content="false"
        @update:model-value="colorMode = $event as 'token' | 'custom'"
      />

      <div v-if="colorMode === 'token' || !effectiveAllowCustom" class="space-y-3">
        <div class="flex gap-1.5 flex-wrap">
          <button
            v-if="effectiveAllowAuto"
            type="button"
            class="rounded-md border px-2.5 py-2 text-xs font-medium transition-colors"
            :class="selectedTokenKey === 'auto'
              ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
              : 'border-accented text-muted hover:border-accented'"
            @click="selectedTokenKey = 'auto'"
          >
            {{ effectiveAutoLabel }}
          </button>
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
                'border-accented hover:border-accented': selectedTokenKey !== swatch.key,
                'opacity-40 cursor-not-allowed': effectivePolicy === 'disableTokens' && !tokenPassesContrast(swatch.key)
              }"
              :style="{ backgroundColor: swatch.color }"
            />
          </button>
        </div>
        <p v-if="tokenSwatches.length === 0" class="text-xs text-muted">
          No brand colors available.
        </p>
        <div
          v-if="effectivePreviewMode !== 'swatch'"
          class="rounded-md border border-default px-3 py-3"
        >
          <div class="text-[11px] uppercase tracking-[0.16em] text-muted text-dimmed mb-2">
            CTA Preview
          </div>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-md border px-6 text-[15px] leading-none font-medium tracking-[0.01em] no-underline"
            :class="effectivePreviewMode === 'cta-primary' ? 'border-transparent' : 'bg-transparent'"
            :style="ctaPreviewStyle"
          >
            {{ effectivePreviewText }}
          </button>
        </div>
        <div
          v-if="isPreviewAdjusted && effectivePreviewMode === 'cta-primary'"
          class="text-xs text-amber-600 dark:text-amber-400 rounded border border-amber-300/60 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-900/20 px-2 py-1.5"
        >
          Preview adjusted CTA label color for accessibility.
        </div>
      </div>

      <div v-else class="space-y-2">
        <label
          class="relative block rounded-md border border-default px-3 py-2 cursor-pointer hover:bg-elevated transition-colors"
        >
          <div class="flex items-center gap-2 min-w-0">
            <div
              class="w-8 h-8 rounded border border-accented shrink-0"
              :style="{ backgroundColor: customColor }"
            />
            <div class="min-w-0">
              <div class="text-sm font-medium text-toned text-default">Custom</div>
              <div class="text-xs text-muted text-dimmed font-mono truncate">{{ customColor }}</div>
            </div>
          </div>

          <input
            v-model="customColor"
            type="color"
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Pick a custom color"
          />
        </label>
        <div
          v-if="effectivePreviewMode !== 'swatch'"
          class="rounded-md border border-default px-3 py-3"
        >
          <div class="text-[11px] uppercase tracking-[0.16em] text-muted text-dimmed mb-2">
            CTA Preview
          </div>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-md border px-6 text-[15px] leading-none font-medium tracking-[0.01em] no-underline"
            :class="effectivePreviewMode === 'cta-primary' ? 'border-transparent' : 'bg-transparent'"
            :style="ctaPreviewStyle"
          >
            {{ effectivePreviewText }}
          </button>
        </div>
        <div
          v-if="isPreviewAdjusted"
          class="text-xs text-amber-600 dark:text-amber-400 rounded border border-amber-300/60 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-900/20 px-2 py-1.5"
        >
          <span v-if="effectivePreviewMode === 'swatch'">Preview adjusted for accessibility: {{ effectivePreviewColor }}</span>
          <span v-else>Preview adjusted CTA label color for accessibility.</span>
        </div>
      </div>
    </div>
  </div>
</template>
