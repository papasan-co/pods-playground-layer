<script setup lang="ts">
import Sortable from 'sortablejs'
import type { FormField } from '#pods-player/formMapper'
import type { PodsPlayerViewport } from '#pods-player/types'
import PodsPlayerResponsiveField from './PodsPlayerResponsiveField.vue'
import PodsPlayerBrandColorPicker from './PodsPlayerBrandColorPicker.vue'
import PodsPlayerMediaPicker from './PodsPlayerMediaPicker.vue'

/**
 * pods-player-layer.app.components.pods-player.PodsPlayerBlockForm
 *
 * YAML-driven form renderer for pods. This powers the “Form” tab in the right
 * panel. It is promoted from the `cms-story-components` playground so the CMS
 * and the playground share the same authoring controls.
 */

defineOptions({ name: 'PodsPlayerBlockForm' })

const props = defineProps<{
  fields: FormField[]
  modelValue: Record<string, unknown>
  viewport?: PodsPlayerViewport
}>()

interface UpdatePayload {
  field: string
  value: unknown
}

const emit = defineEmits<{
  (e: 'update:modelValue', value: UpdatePayload): void
  (e: 'update:viewport', value: PodsPlayerViewport): void
}>()

function updateField(name: string, value: unknown, type: string) {
  const v = type === 'number' ? Number(value) : value
  emit('update:modelValue', { field: name, value: v })
}

interface Condition {
  field: string
  equals: unknown
}

function isVisible(field: FormField) {
  const cond = (field as { when?: Condition | Condition[] }).when
  if (!cond) return true
  const conditions = Array.isArray(cond) ? cond : [cond]
  return conditions.every((c) => props.modelValue[c.field] === c.equals)
}

function isHidden(field: FormField): boolean {
  const ui = (field as any)?.['x-ui']
  return Boolean(ui && typeof ui === 'object' && ui.hidden === true)
}

function isReadOnly(field: FormField): boolean {
  const ui = (field as any)?.['x-ui']
  return Boolean(ui && typeof ui === 'object' && ui.readonly === true)
}

function selectItems(field: FormField & { options?: Record<string, string> | string[] }) {
  if (field.type === 'color-select') {
    const keys = Array.isArray(field.options) ? field.options : Object.keys(field.options ?? {})
    return keys.map((key) => ({
      value: key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      chip: { style: `background: var(--color-${key}-500)` },
    }))
  }

  if (field.options && typeof field.options === 'object') {
    return Object.entries(field.options).map(([value, label]) => ({ value, label }))
  }

  return []
}

function sliderValue(name: string | undefined): string {
  if (!name) return ''
  const v = props.modelValue[name]
  if (v === undefined || v === null || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : String(v)
}

function makeKey() {
  // stable-enough for UI lists; fixture data can also include its own keys
  return Math.random().toString(36).slice(2, 8)
}

type RepeaterItem = Record<string, unknown> & { _key?: string; _removing?: boolean }

function normaliseRepeater(value: unknown): RepeaterItem[] {
  return (Array.isArray(value) ? value : []).map((v) => ({
    _key: (v as any)?._key ?? makeKey(),
    ...(v as Record<string, unknown>),
  }))
}

const repeaterOpen = reactive<Record<string, Record<string, boolean>>>({})
function itemKey(item: RepeaterItem, idx: number): string {
  return String((item as any)?._key ?? idx)
}
function isItemOpen(block: string, key: string): boolean {
  return Boolean(repeaterOpen[block]?.[key])
}
function setItemOpen(block: string, key: string, open: boolean) {
  repeaterOpen[block] ??= {}
  repeaterOpen[block]![key] = open
}
function toggleItemOpen(block: string, key: string) {
  setItemOpen(block, key, !isItemOpen(block, key))
}

function summarizeRepeaterItem(item: RepeaterItem, idx: number): string {
  const label = typeof item.label === 'string' ? item.label : ''
  const prefix = typeof item.prefix === 'string' ? item.prefix : ''
  const suffix = typeof item.suffix === 'string' ? item.suffix : ''
  const value = item.value ?? item.end ?? item.start
  const valueStr =
    typeof value === 'number' || typeof value === 'string'
      ? String(value)
      : ''

  if (label && valueStr) return `${label} — ${prefix}${valueStr}${suffix}`
  if (label) return label
  if (valueStr) return `${prefix}${valueStr}${suffix}`
  return `Item #${idx + 1}`
}

const lists = new Map<string, ReturnType<typeof shallowRef<RepeaterItem[]>>>()
function listFor(block: string) {
  if (!lists.has(block)) lists.set(block, shallowRef(normaliseRepeater(props.modelValue[block])))
  return lists.get(block)!
}

function saveLocal(block: string) {
  const data = JSON.stringify(listFor(block).value)
  localStorage.setItem(`PodsPlayerBlockForm:${block}`, data)
}

function initSortable(el: HTMLElement, name: string) {
  if ((el as any)._podsPlayerSortable) return
  ;(el as any)._podsPlayerSortable = true

  const list = listFor(name)
  Sortable.create(el, {
    animation: 150,
    handle: '.repeater-handle',
    draggable: '.repeater-card',
    ghostClass: 'opacity-40',
    filter: 'input, textarea, select, button, [contenteditable]',
    preventOnFilter: false,
    onEnd(evt) {
      if (evt.oldIndex == null || evt.newIndex == null) return
      const arr = [...list.value]
      const [moved] = arr.splice(evt.oldIndex, 1)
      arr.splice(evt.newIndex, 0, moved)
      list.value = arr
      emit('update:modelValue', { field: name, value: arr })
      saveLocal(name)
    },
  })
}

function initializeRepeater(field: FormField) {
  if (field.type !== 'repeater') return
  const modelValue = props.modelValue[field.name]

  if (modelValue && Array.isArray(modelValue) && modelValue.length > 0) {
    listFor(field.name).value = normaliseRepeater(modelValue)
    localStorage.removeItem(`PodsPlayerBlockForm:${field.name}`)
  } else {
    const cached = localStorage.getItem(`PodsPlayerBlockForm:${field.name}`)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        listFor(field.name).value = normaliseRepeater(parsed)
        emit('update:modelValue', { field: field.name, value: parsed })
      } catch {
        // ignore
      }
    }
  }
}

onMounted(() => {
  for (const field of props.fields) initializeRepeater(field)
})

watch(
  () => props.modelValue,
  (newValue) => {
    for (const field of props.fields) {
      if (field.type === 'repeater') {
        const mv = newValue[field.name]
        if (mv && Array.isArray(mv) && mv.length > 0) {
          listFor(field.name).value = normaliseRepeater(mv)
          localStorage.removeItem(`PodsPlayerBlockForm:${field.name}`)
        }
      }
    }
  },
  { deep: true, immediate: false },
)

function updateRepeaterItem(block: string, idx: number, child: string, value: unknown) {
  const list = listFor(block)
  list.value = list.value.map((it, i) => (i === idx ? { ...it, [child]: value } : it))
  emit('update:modelValue', { field: block, value: list.value })
  saveLocal(block)
}

function addRepeaterItem(block: string, blueprint = {}) {
  const list = listFor(block)
  const newItem = { _key: makeKey(), ...(blueprint as any) }
  list.value = [...list.value, newItem]
  emit('update:modelValue', { field: block, value: list.value })
  saveLocal(block)
}

function removeRepeaterItem(block: string, idx: number) {
  const list = listFor(block)
  list.value = list.value.map((it, i) => (i === idx ? { ...it, _removing: true } : it))
  setTimeout(() => {
    list.value = list.value.filter((_, i) => i !== idx)
    emit('update:modelValue', { field: block, value: list.value })
    saveLocal(block)
  }, 300)
}
</script>

<template>
  <template v-for="(field, idx) in fields" :key="field.name || `${field.type}-${idx}`">
    <div v-if="field.type === 'group' && isVisible(field) && !isHidden(field)" class="mb-4 last:mb-0">
      <div class="rounded-md border border-gray-200 dark:border-gray-700 p-4 space-y-4">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {{ field.label }}
        </h3>

        <PodsPlayerBlockForm
          v-if="field.children?.length"
          :fields="field.children"
          :model-value="modelValue"
          :viewport="viewport"
          @update:model-value="(payload) => emit('update:modelValue', payload)"
          @update:viewport="(val) => emit('update:viewport', val)"
        />
      </div>
    </div>

    <!-- Row: UI/layout primitive (does not store data) -->
    <div v-else-if="field.type === 'row' && isVisible(field) && !isHidden(field)" class="flex gap-3 mb-4 last:mb-0">
      <template v-for="(child, ci) in field.fields || []" :key="child.name || `${child.type}-${ci}`">
        <div :class="(child.width as string) || 'flex-1'">
          <PodsPlayerResponsiveField
            v-if="child.responsive"
            :field="child"
            :model-value="modelValue"
            :viewport="viewport || 'laptop'"
            @update:model-value="({ field: name, value }) => updateField(name, value, child.type)"
            @update:viewport="(val) => emit('update:viewport', val)"
          />

          <UFormField
            v-else
            :label="child.type === 'slider' ? undefined : child.label"
            class="mb-2"
          >
            <template v-if="child.type === 'slider'" #label>
              <div class="flex items-center justify-between gap-2">
                <span>{{ child.label }}</span>
                <span class="text-xs text-gray-500 tabular-nums">{{ sliderValue(child.name as string) }}</span>
              </div>
            </template>
            <UInput
              v-if="child.type === 'input'"
              class="w-full"
              size="sm"
              :model-value="modelValue[child.name as string]"
              @update:model-value="(val) => updateField(child.name as string, val, child.type)"
            />
            <UTextarea
              v-else-if="child.type === 'textarea'"
              class="w-full"
              size="sm"
              :model-value="modelValue[child.name as string]"
              @update:model-value="(val) => updateField(child.name as string, val, child.type)"
            />
            <USelect
              v-else-if="child.type === 'select'"
              class="w-full"
              size="sm"
              :model-value="modelValue[child.name as string]"
              :placeholder="child.placeholder as any"
              :items="selectItems(child as any)"
              value-attribute="value"
              label-attribute="label"
              arrow
              @update:model-value="(val) => updateField(child.name as string, val, child.type)"
            />
            <UInputNumber
              v-else-if="child.type === 'input-number'"
              class="w-full"
              size="sm"
              :model-value="Number(modelValue[child.name as string]) || 0"
              :min="(child.min as number) ?? undefined"
              :max="(child.max as number) ?? undefined"
              :step="(child.step as number) ?? 1"
              @update:model-value="(val) => updateField(child.name as string, val, child.type)"
            />
            <USwitch
              v-else-if="child.type === 'toggle'"
              class="w-full"
              size="sm"
              :model-value="modelValue[child.name as string]"
              @update:model-value="(val) => updateField(child.name as string, val, child.type)"
            />
            <USlider
              v-else-if="child.type === 'slider'"
              class="w-full"
              size="sm"
              :model-value="Number(modelValue[child.name as string]) || 0"
              :min="(child.min as number) ?? 0"
              :max="(child.max as number) ?? 100"
              :step="(child.step as number) ?? 1"
              :tooltip="true"
              @update:model-value="(val) => updateField(child.name as string, Array.isArray(val) ? val[0] : val, child.type)"
            />
            <PodsPlayerBrandColorPicker
              v-else-if="child.type === 'background-color' || child.type === 'brand-color-picker'"
              :model-value="modelValue[child.name as string] as string"
              @update:model-value="(val) => updateField(child.name as string, val, child.type)"
            />
            <PodsPlayerMediaPicker
              v-else-if="child.type === 'medias'"
              :model-value="modelValue[child.name as string] as string"
              :constraint="(child as any)['x-ui']"
              @update:model-value="(val) => updateField(child.name as string, val, child.type)"
            />
            <UInput
              v-else
              class="w-full"
              size="sm"
              :model-value="modelValue[child.name as string]"
              @update:model-value="(val) => updateField(child.name as string, val, child.type)"
            />
          </UFormField>
        </div>
      </template>
    </div>

    <PodsPlayerResponsiveField
      v-else-if="field.responsive && !isHidden(field)"
      v-show="isVisible(field)"
      :field="field"
      :model-value="modelValue"
      :viewport="viewport || 'laptop'"
      @update:model-value="({ field: name, value }) => updateField(name, value, field.type)"
      @update:viewport="(val) => emit('update:viewport', val)"
    />

    <UFormField
      v-else-if="!isHidden(field)"
      v-show="isVisible(field)"
      :label="field.type === 'slider' ? undefined : field.label"
      class="mb-4 last:mb-0"
    >
      <template v-if="field.type === 'slider'" #label>
        <div class="flex items-center justify-between gap-2">
          <span>{{ field.label }}</span>
          <span class="text-xs text-gray-500 tabular-nums">{{ sliderValue(field.name as string) }}</span>
        </div>
      </template>
      <UInput
        v-if="field.type === 'input'"
        class="w-full"
        size="sm"
        :disabled="isReadOnly(field)"
        :model-value="modelValue[field.name]"
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      />
      <UTextarea
        v-else-if="field.type === 'textarea'"
        class="w-full"
        size="sm"
        :disabled="isReadOnly(field)"
        :model-value="modelValue[field.name]"
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      />
      <USelect
        v-else-if="field.type === 'select'"
        class="w-full"
        size="sm"
        :disabled="isReadOnly(field)"
        :model-value="modelValue[field.name]"
        :placeholder="field.placeholder as any"
        :items="selectItems(field as any)"
        value-attribute="value"
        label-attribute="label"
        arrow
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      />
      <USelect
        v-else-if="field.type === 'color-select'"
        class="w-full"
        size="sm"
        :disabled="isReadOnly(field)"
        :model-value="modelValue[field.name]"
        :items="selectItems(field as any)"
        value-attribute="value"
        label-attribute="label"
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      >
        <template #leading="{ modelValue: mv }">
          <span
            v-if="mv"
            class="inline-block h-3 w-3 rounded-full mr-1"
            :style="`background: var(--color-${mv}-500)`"
          />
        </template>
        <template #item="{ item }">
          <div class="flex items-center gap-2">
            <span class="inline-block h-3 w-3 rounded-full" :style="`background: var(--color-${item.value}-500)`" />
            <span>{{ item.label }}</span>
          </div>
        </template>
      </USelect>
      <UInputNumber
        v-else-if="field.type === 'input-number'"
        class="w-full"
        size="sm"
        :disabled="isReadOnly(field)"
        :model-value="Number(modelValue[field.name]) || 0"
        :min="(field.min as number) ?? undefined"
        :max="(field.max as number) ?? undefined"
        :step="(field.step as number) ?? 1"
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      />
      <UInput
        v-else-if="field.type === 'number'"
        class="w-full"
        type="number"
        size="sm"
        :disabled="isReadOnly(field)"
        :model-value="modelValue[field.name]"
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      />
      <USwitch
        v-else-if="field.type === 'toggle'"
        class="w-full"
        size="sm"
        :disabled="isReadOnly(field)"
        :model-value="modelValue[field.name]"
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      />
      <USlider
        v-else-if="field.type === 'slider'"
        class="w-full"
        size="sm"
        :disabled="isReadOnly(field)"
        :model-value="Number(modelValue[field.name]) || 0"
        :min="(field.min as number) ?? 0"
        :max="(field.max as number) ?? 100"
        :step="(field.step as number) ?? 1"
        :tooltip="true"
        @update:model-value="(val) => updateField(field.name, Array.isArray(val) ? val[0] : val, field.type)"
      />
      <PodsPlayerBrandColorPicker
        v-else-if="field.type === 'background-color' || field.type === 'brand-color-picker'"
        :model-value="modelValue[field.name] as string"
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      />
      <PodsPlayerMediaPicker
        v-else-if="field.type === 'medias'"
        :model-value="modelValue[field.name] as string"
        :constraint="(field as any)['x-ui']"
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      />

      <!-- Repeater -->
      <div v-else-if="field.type === 'repeater'">
        <div
          class="space-y-3"
          :ref="(el) => el && initSortable(el as HTMLElement, field.name)"
        >
          <div
            v-for="(item, idx) in listFor(field.name).value"
            :key="(item as any)._key || idx"
            class="repeater-card rounded-md border border-gray-200 dark:border-gray-700 p-3 transition-opacity"
            :class="{ 'opacity-30': (item as any)._removing }"
          >
            <UCollapsible
              :open="isItemOpen(field.name, itemKey(item as any, idx))"
              @update:open="(v) => setItemOpen(field.name, itemKey(item as any, idx), Boolean(v))"
              :unmount-on-hide="true"
            >
              <template #default="{ open }">
                <div class="flex items-start justify-between gap-2">
                  <span class="repeater-handle cursor-grab text-gray-400 pt-0.5" @click.stop>
                    <UIcon name="i-lucide-grip-vertical" class="w-4 h-4" />
                  </span>
                  <button
                    type="button"
                    class="flex-1 text-left min-w-0"
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <div class="min-w-0">
                        <div class="text-xs font-semibold text-gray-700 dark:text-gray-200">
                          {{ field.label }} #{{ idx + 1 }}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {{ summarizeRepeaterItem(item as any, idx) }}
                        </div>
                      </div>
                    </div>
                  </button>

                  <div class="flex items-center gap-1 shrink-0">
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-chevron-down"
                      :class="{ 'rotate-180': open }"
                      @click.stop="toggleItemOpen(field.name, itemKey(item as any, idx))"
                    />
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-trash"
                      @click.stop="removeRepeaterItem(field.name, idx)"
                    />
                  </div>
                </div>
              </template>

              <template #content>
                <div class="pt-3 space-y-3">
                  <PodsPlayerBlockForm
                    :fields="(field.fields || []) as any"
                    :model-value="(item as any)"
                    :viewport="viewport"
                    @update:model-value="({ field: child, value }) => updateRepeaterItem(field.name, idx, child, value)"
                    @update:viewport="(val) => emit('update:viewport', val)"
                  />
                </div>
              </template>
            </UCollapsible>
          </div>
        </div>

        <UButton
          class="mt-3"
          size="sm"
          variant="outline"
          icon="i-lucide-plus"
          @click="addRepeaterItem(field.name, (field.blueprint as any) || {})"
        >
          Add {{ field.label }}
        </UButton>
      </div>
    </UFormField>
  </template>
</template>

<style scoped>
.repeater-card {
  transition: opacity 0.3s ease;
}
</style>

