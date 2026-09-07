<script setup lang="ts">
/**
 * A select drawn as option cards: one card per value with its label, a
 * one-line description and a "default" tag on the pod's own choice — for
 * axes a person reads rather than scans (a header's placement, what it does
 * when the page scrolls). Reka's Select stays the fallback; a host that asks
 * for role=option will not find one here, it finds radios.
 */
const props = defineProps<{
  modelValue?: unknown
  items: Array<{ value: string; label: string; description?: string }>
  defaultValue?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

function isChosen(value: string): boolean {
  return props.modelValue === value
}
</script>

<template>
  <div
    role="radiogroup"
    class="grid gap-2"
    data-au-option-cards
  >
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      role="radio"
      :aria-checked="isChosen(item.value) ? 'true' : 'false'"
      :disabled="disabled"
      class="flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors"
      :class="isChosen(item.value)
        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
        : 'border-default hover:bg-elevated'"
      :data-au-option-card="item.value"
      @click="emit('update:modelValue', item.value)"
    >
      <span
        class="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border"
        :class="isChosen(item.value) ? 'border-blue-500 bg-blue-500' : 'border-accented'"
        aria-hidden="true"
      />
      <span class="min-w-0">
        <span class="block text-sm font-medium text-default">
          {{ item.label }}
          <span
            v-if="defaultValue !== undefined && defaultValue === item.value"
            class="ml-1.5 rounded bg-elevated px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted"
          >default</span>
        </span>
        <span
          v-if="item.description"
          class="block text-xs text-muted"
        >{{ item.description }}</span>
      </span>
    </button>
  </div>
</template>
