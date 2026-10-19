<script setup lang="ts">
import type { FieldReference, FieldSource } from '#pods-player/fieldSource'
import { referencedField } from '#pods-player/fieldSource'

/**
 * pods-playground-layer.app.components.pods-player.PodsPlayerBoundField
 *
 * A field filled from somewhere else, shown in place of its control.
 *
 * It rests quietly: "From the entry: Title" and, beneath, what that fills it
 * with on the page being shown. There is nothing to type into, so typing can
 * never turn the reference into text. The ⋯ menu changes where it is filled
 * from, or lets a person write their own text instead, on purpose.
 */

defineOptions({ name: 'PodsPlayerBoundField' })

const props = defineProps<{
  reference: FieldReference
  source?: FieldSource | null
  readOnly?: boolean
}>()

const emit = defineEmits<{
  (e: 'fill-from', name: string): void
  (e: 'write-own'): void
}>()

const filledFrom = computed(() => referencedField(props.source, props.reference))

/** "From the entry: Title", or the raw reference when the host can't name it. */
const title = computed(() => filledFrom.value
  ? `${props.source!.label}: ${filledFrom.value.label}`
  : `Filled from ${props.reference.$from}`)

const menuItems = computed(() => [[
  ...(props.source?.fields.length
    ? [{
        label: 'Fill from another field',
        icon: 'i-lucide-arrow-left-right',
        children: [props.source.fields.map(field => ({
          label: field.label,
          checked: field.name === filledFrom.value?.name,
          type: 'checkbox' as const,
          onSelect: () => emit('fill-from', field.name),
        }))],
      }]
    : []),
  { label: 'Write it here instead', icon: 'i-lucide-pencil', onSelect: () => emit('write-own') },
]])
</script>

<template>
  <div
    class="flex items-start gap-2 rounded-md border border-default bg-elevated py-1.5 pl-2 pr-1"
    data-testid="bound-field"
    :data-bound-from="reference.$from"
  >
    <span class="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded border border-accented text-muted">
      <UIcon name="i-lucide-database" class="h-3.5 w-3.5" />
    </span>
    <span class="flex min-w-0 flex-1 flex-col pt-0.5">
      <span class="text-xs font-medium text-default" data-testid="bound-field-label">{{ title }}</span>
      <span
        v-if="filledFrom?.sample"
        class="line-clamp-2 break-words text-[11px] text-muted"
        data-testid="bound-field-sample"
      >{{ filledFrom.sample }}</span>
      <span v-else-if="filledFrom && source?.sampled" class="text-[11px] italic text-muted">Empty on the page shown</span>
    </span>
    <UDropdownMenu v-if="!readOnly" :items="menuItems" :content="{ align: 'end' }">
      <UButton
        icon="i-lucide-ellipsis"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Change how this field is filled"
        data-testid="bound-field-menu"
      />
    </UDropdownMenu>
  </div>
</template>
