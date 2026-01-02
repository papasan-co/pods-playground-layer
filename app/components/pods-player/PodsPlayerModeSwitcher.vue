<script setup lang="ts">
import type { PodsPlayerMode } from '#pods-player/types'

const props = defineProps<{
  modelValue: PodsPlayerMode
  /**
   * If the host only supports one mode, we hide the switcher automatically.
   */
  supportedModes?: PodsPlayerMode[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PodsPlayerMode]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const visible = computed(() => (props.supportedModes ?? ['sfc', 'wc']).length > 1)
</script>

<template>
  <URadioGroup
    v-if="visible"
    v-model="value"
    :options="[
      { label: 'SFC', value: 'sfc', disabled: !(supportedModes || []).includes('sfc') },
      { label: 'Web Component', value: 'wc', disabled: !(supportedModes || []).includes('wc') },
    ]"
    size="sm"
  />
</template>

