<script setup lang="ts">
import type { PodsPlayerViewport } from '#pods-player/types'

const props = defineProps<{
  modelValue: PodsPlayerViewport
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PodsPlayerViewport]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})
</script>

<template>
  <UTabs
    v-model="value"
    :items="[
      { label: 'Laptop', value: 'laptop' },
      { label: 'Tablet', value: 'tablet' },
      { label: 'Phone', value: 'phone' },
    ]"
    size="sm"
    variant="pill"
  />
</template>

