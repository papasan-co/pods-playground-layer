<script setup lang="ts">
const props = defineProps<{
  vertical?: string
  horizontal?: string
  disabled?: boolean
  mode?: 'text' | 'block'
}>()

const emit = defineEmits<{
  (e: 'update', value: { verticalPosition: 'top' | 'middle' | 'bottom'; horizontalPosition: 'left' | 'center' | 'right' }): void
}>()

type PositionOption = {
  key: string
  label: string
  vertical: 'top' | 'middle' | 'bottom'
  horizontal: 'left' | 'center' | 'right'
}

const options: PositionOption[] = [
  { key: 'top-left', label: 'Top left', vertical: 'top', horizontal: 'left' },
  { key: 'top-center', label: 'Top center', vertical: 'top', horizontal: 'center' },
  { key: 'top-right', label: 'Top right', vertical: 'top', horizontal: 'right' },
  { key: 'middle-left', label: 'Middle left', vertical: 'middle', horizontal: 'left' },
  { key: 'middle-center', label: 'Center', vertical: 'middle', horizontal: 'center' },
  { key: 'middle-right', label: 'Middle right', vertical: 'middle', horizontal: 'right' },
  { key: 'bottom-left', label: 'Bottom left', vertical: 'bottom', horizontal: 'left' },
  { key: 'bottom-center', label: 'Bottom center', vertical: 'bottom', horizontal: 'center' },
  { key: 'bottom-right', label: 'Bottom right', vertical: 'bottom', horizontal: 'right' },
]

const selectedKey = computed(() => `${props.vertical || 'middle'}-${props.horizontal || 'center'}`)
const selectedLabel = computed(() => options.find((option) => option.key === selectedKey.value)?.label ?? 'Center')
const markerMode = computed(() => props.mode ?? 'text')

function anchorClass(option: PositionOption): string[] {
  const verticalClass =
    option.vertical === 'top'
      ? 'top-1'
      : option.vertical === 'middle'
        ? 'top-1/2 -translate-y-1/2'
        : 'bottom-1'
  const horizontalClass =
    option.horizontal === 'left'
      ? 'left-1'
      : option.horizontal === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : 'right-1'

  return [verticalClass, horizontalClass]
}

function alignmentIcon(option: PositionOption): string {
  return option.horizontal === 'center'
    ? 'i-lucide-align-center'
    : option.horizontal === 'right'
      ? 'i-lucide-align-right'
      : 'i-lucide-align-left'
}

function choose(option: PositionOption) {
  emit('update', {
    verticalPosition: option.vertical,
    horizontalPosition: option.horizontal,
  })
}
</script>

<template>
  <div class="space-y-1.5">
    <div class="grid w-full grid-cols-3 gap-1.5">
      <UButton
        v-for="option in options"
        :key="option.key"
        type="button"
        color="neutral"
        :variant="selectedKey === option.key ? 'solid' : 'outline'"
        :disabled="disabled"
        :title="option.label"
        class="relative h-9 w-full justify-center rounded-md px-0"
        @click="choose(option)"
      >
        <span class="sr-only">{{ option.label }}</span>
        <span
          class="relative block h-5 w-5 rounded-[4px] border"
          :class="selectedKey === option.key ? 'border-white/45' : 'border-gray-300 dark:border-gray-600'"
        >
          <span
            class="absolute transition-all"
            :class="anchorClass(option)"
          >
            <UIcon
              v-if="markerMode === 'text'"
              :name="alignmentIcon(option)"
              class="block h-3 w-3"
              :class="selectedKey === option.key ? 'text-white' : 'text-gray-500 dark:text-gray-300'"
            />
            <span
              v-else
              class="block h-2.5 w-2.5 rounded-[3px]"
              :class="selectedKey === option.key ? 'bg-white' : 'bg-gray-500 dark:bg-gray-300'"
            />
          </span>
        </span>
      </UButton>
    </div>
    <p class="text-[11px] leading-none text-gray-500 dark:text-gray-400">
      {{ selectedLabel }}
    </p>
  </div>
</template>
