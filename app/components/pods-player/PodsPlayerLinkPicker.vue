<script setup lang="ts">
import { computed, ref } from 'vue'
import type { LinkSection, LinkTarget, LinkValue } from '#pods-player/linkTarget'

/**
 * pods-playground-layer.app.components.pods-player.PodsPlayerLinkPicker
 *
 * The one control for choosing where a link goes.
 *
 * A link is stored as a typed reference rather than a URL — a page, a
 * collection entry, a form, or an external address — and the host resolves it
 * to a real URL per locale at render. That is what lets a link survive a slug
 * rename, render correctly in every language, and be reported broken before it
 * is published rather than 404ing quietly afterwards.
 *
 * The form has no idea what a site is, so the candidates arrive by prop the
 * same way the media picker's catalogue does.
 */

const props = defineProps<{
  modelValue?: LinkValue | null
  targets?: LinkTarget[]
  readOnly?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: LinkValue | null): void
}>()

const query = ref('')
const open = ref(false)
const cursor = ref(-1)
const wantsSection = ref(Boolean(props.modelValue && 'section' in props.modelValue && props.modelValue.section))

const targets = computed(() => props.targets ?? [])

/** A pasted address is recognised on sight, so there is no type to pick. */
function looksLikeUrl(value: string): boolean {
  const v = value.trim()
  return /^(https?:\/\/|mailto:|tel:)\S+$/i.test(v) || /^www\.\S+\.\S+$/i.test(v)
}

const GROUPS: Array<{ kind: LinkTarget['kind'], label: string }> = [
  { kind: 'page', label: 'Pages' },
  { kind: 'entry', label: 'Entries' },
  { kind: 'form', label: 'Forms' },
]

const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  const hit = (t: LinkTarget) =>
    t.title.toLowerCase().includes(q) || (t.path ?? '').toLowerCase().includes(q)
  return GROUPS
    .map(g => ({ ...g, items: targets.value.filter(t => t.kind === g.kind && hit(t)) }))
    .filter(g => g.items.length > 0)
})

const flat = computed(() => groups.value.flatMap(g => g.items))

/** The record a reference points at, or undefined once it has been deleted. */
const target = computed<LinkTarget | undefined>(() => {
  const v = props.modelValue
  if (!v || v.kind === 'url') return undefined
  const id = v.kind === 'page' ? v.page : v.kind === 'entry' ? v.entry : v.form
  return targets.value.find(t => t.id === id)
})

const isBroken = computed(() =>
  Boolean(props.modelValue && props.modelValue.kind !== 'url' && !target.value))

const sections = computed<LinkSection[]>(() => target.value?.sections ?? [])

const display = computed(() => {
  const v = props.modelValue
  if (!v) return null
  if (v.kind === 'url') return { title: 'External address', detail: v.url, glyph: '↗' }
  if (isBroken.value) return { title: 'Missing target', detail: 'This was deleted', glyph: '!' }
  const t = target.value!
  return {
    title: t.title,
    detail: t.kind === 'form' ? 'Opens in place' : (t.path ?? ''),
    glyph: t.kind === 'page' ? 'P' : t.kind === 'entry' ? 'E' : 'F',
  }
})

function choose(t: LinkTarget) {
  if (props.readOnly) return
  wantsSection.value = false
  query.value = ''
  open.value = false
  if (t.kind === 'page') emit('update:modelValue', { kind: 'page', page: t.id })
  else if (t.kind === 'entry') emit('update:modelValue', { kind: 'entry', collection: t.collection ?? '', entry: t.id })
  else emit('update:modelValue', { kind: 'form', form: t.id })
}

function chooseUrl() {
  if (props.readOnly) return
  const url = query.value.trim()
  query.value = ''
  open.value = false
  emit('update:modelValue', { kind: 'url', url, newTab: true })
}

function clear() {
  if (props.readOnly) return
  wantsSection.value = false
  emit('update:modelValue', null)
}

function setSection(id: string) {
  const v = props.modelValue
  if (!v || v.kind !== 'page' || props.readOnly) return
  emit('update:modelValue', id ? { ...v, section: id } : { kind: 'page', page: v.page })
}

function toggleSection(on: boolean) {
  wantsSection.value = on
  if (!on) setSection('')
  else if (sections.value[0]) setSection(sections.value[0].id)
}

function setNewTab(on: boolean) {
  const v = props.modelValue
  if (!v || v.kind !== 'url' || props.readOnly) return
  emit('update:modelValue', { ...v, newTab: on })
}

function onInput(value: string) {
  query.value = value
  cursor.value = -1
  open.value = value.trim().length > 0
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { open.value = false; return }
  const total = looksLikeUrl(query.value) ? 1 : flat.value.length
  if (!total) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const step = event.key === 'ArrowDown' ? 1 : -1
    cursor.value = (cursor.value + step + total) % total
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    if (looksLikeUrl(query.value)) chooseUrl()
    else if (cursor.value > -1) choose(flat.value[cursor.value]!)
  }
}

function indexOf(item: LinkTarget): number {
  return flat.value.indexOf(item)
}
</script>

<template>
  <div class="relative flex flex-col gap-1.5">
    <!-- picked -->
    <div
      v-if="modelValue"
      class="flex items-center gap-2 rounded-md border px-2 py-1.5"
      :class="isBroken
        ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40'
        : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40'"
    >
      <span
        class="grid h-5 w-5 flex-none place-items-center rounded border text-[10px] font-bold"
        :class="isBroken
          ? 'border-red-300 text-red-600 dark:border-red-800 dark:text-red-400'
          : 'border-gray-300 text-gray-500 dark:border-gray-600 dark:text-gray-400'"
      >{{ display?.glyph }}</span>

      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-xs font-medium text-gray-900 dark:text-gray-100">{{ display?.title }}</span>
        <span class="truncate font-mono text-[10px] text-gray-500 dark:text-gray-400">{{ display?.detail }}</span>
      </span>

      <span
        v-if="target?.status === 'draft'"
        class="flex-none rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950 dark:text-amber-400"
      >Draft</span>
      <span
        v-else-if="isBroken"
        class="flex-none rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950 dark:text-red-400"
      >Broken</span>

      <button
        v-if="!readOnly"
        type="button"
        class="flex-none rounded border border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-600 hover:text-gray-900 dark:border-gray-600 dark:text-gray-400 dark:hover:text-gray-100"
        @click="clear"
      >Change</button>
    </div>

    <!-- searching -->
    <input
      v-else
      type="text"
      autocomplete="off"
      :disabled="readOnly"
      :value="query"
      :placeholder="placeholder || 'Search pages and entries, or paste a URL…'"
      class="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      @input="onInput(($event.target as HTMLInputElement).value)"
      @keydown="onKey"
      @focus="open = query.trim().length > 0"
    >

    <!-- results -->
    <div
      v-if="open && !modelValue"
      class="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-gray-300 bg-white p-1 shadow-lg dark:border-gray-600 dark:bg-gray-900"
    >
      <button
        v-if="looksLikeUrl(query)"
        type="button"
        class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
        @click="chooseUrl"
      >
        <span class="grid h-5 w-5 flex-none place-items-center rounded border border-gray-300 text-[10px] font-bold text-gray-500 dark:border-gray-600 dark:text-gray-400">↗</span>
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-xs font-medium text-gray-900 dark:text-gray-100">Link to this address</span>
          <span class="truncate font-mono text-[10px] text-gray-500 dark:text-gray-400">{{ query.trim() }}</span>
        </span>
      </button>

      <template v-else-if="groups.length">
        <template v-for="group in groups" :key="group.kind">
          <div class="px-2 pb-1 pt-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {{ group.label }}
          </div>
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left"
            :class="indexOf(item) === cursor ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
            @click="choose(item)"
          >
            <span class="grid h-5 w-5 flex-none place-items-center rounded border border-gray-300 text-[10px] font-bold text-gray-500 dark:border-gray-600 dark:text-gray-400">
              {{ item.kind === 'page' ? 'P' : item.kind === 'entry' ? 'E' : 'F' }}
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-xs font-medium text-gray-900 dark:text-gray-100">{{ item.title }}</span>
              <span class="truncate font-mono text-[10px] text-gray-500 dark:text-gray-400">
                {{ item.kind === 'form' ? 'Opens in place' : item.path }}
              </span>
            </span>
            <span
              v-if="item.status === 'draft'"
              class="flex-none rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950 dark:text-amber-400"
            >Draft</span>
          </button>
        </template>
      </template>

      <div v-else class="px-2 py-3 text-[11px] text-gray-500 dark:text-gray-400">
        Nothing matches “{{ query.trim() }}”. Paste a web address to link outside this site.
      </div>
    </div>

    <!-- a draft target ships a link the public cannot follow -->
    <p
      v-if="target?.status === 'draft'"
      class="text-[11px] leading-snug text-amber-700 dark:text-amber-400"
    >
      This page is a draft. The link will be hidden until it is published.
    </p>
    <p
      v-else-if="isBroken"
      class="text-[11px] leading-snug text-red-700 dark:text-red-400"
    >
      What this pointed at no longer exists. Choose a new destination, or this link will not render.
    </p>

    <!-- jumping to a section on the chosen page -->
    <template v-if="modelValue?.kind === 'page' && !isBroken">
      <label
        class="flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-400"
        :class="sections.length ? '' : 'opacity-60'"
      >
        <input
          type="checkbox"
          :checked="wantsSection"
          :disabled="readOnly || sections.length === 0"
          @change="toggleSection(($event.target as HTMLInputElement).checked)"
        >
        Jump to a section on this page
      </label>
      <select
        v-if="wantsSection && sections.length"
        :value="modelValue.section || ''"
        :disabled="readOnly"
        class="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        @change="setSection(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="section in sections" :key="section.id" :value="section.id">{{ section.label }}</option>
      </select>
      <p v-if="!sections.length" class="text-[11px] text-gray-500 dark:text-gray-400">
        This page has no headed sections to jump to.
      </p>
    </template>

    <label
      v-if="modelValue?.kind === 'url'"
      class="flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-400"
    >
      <input
        type="checkbox"
        :checked="modelValue.newTab !== false"
        :disabled="readOnly"
        @change="setNewTab(($event.target as HTMLInputElement).checked)"
      >
      Open in a new tab
    </label>
  </div>
</template>
