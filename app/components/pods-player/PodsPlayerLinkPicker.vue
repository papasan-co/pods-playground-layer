<script setup lang="ts">
import { computed, ref } from 'vue'
import { calBookingPath } from '@papasan-co/autumn-web-primitives'
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
// Choosing a new destination should not destroy the current one until a
// replacement is picked. "Change" opens the search over the top; leaving it
// puts the existing destination back.
const replacing = ref(false)
const cursor = ref(-1)
// Imported content can carry a bare href string; only a link object has a section.
const wantsSection = ref(Boolean(typeof props.modelValue === 'object' && props.modelValue && 'section' in props.modelValue && props.modelValue.section))

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
  { kind: 'modal', label: 'Content modals' },
  { kind: 'booking', label: 'Booking links' },
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
  if (v.kind === 'form') {
    // A form by the zone that draws it, or by its own id.
    return v.zone
      ? targets.value.find(t => t.kind === 'form' && t.zone === v.zone)
      : targets.value.find(t => t.kind === 'form' && !t.zone && t.id === v.form)
  }
  const id = v.kind === 'page' ? v.page : v.kind === 'modal' ? v.modalUuid : v.kind === 'booking' ? v.link : v.entry
  return targets.value.find(t => t.kind === v.kind && t.id === id)
})

const isBroken = computed(() =>
  Boolean(props.modelValue && props.modelValue.kind !== 'url' && !target.value))

const sections = computed<LinkSection[]>(() => target.value?.sections ?? [])

/** What each kind of destination looks like and is called, when the host gives no name of its own. */
const KINDS: Record<LinkTarget['kind'] | 'url', { icon: string, label: string }> = {
  page: { icon: 'i-lucide-file-text', label: 'Page' },
  entry: { icon: 'i-lucide-list', label: 'Collection entry' },
  form: { icon: 'i-lucide-clipboard-list', label: 'Form' },
  modal: { icon: 'i-lucide-panel-top', label: 'Content modal' },
  booking: { icon: 'i-lucide-calendar', label: 'Booking link' },
  url: { icon: 'i-lucide-external-link', label: 'External address' },
}

function kindOf(t: Pick<LinkTarget, 'kind' | 'kindLabel'>): { icon: string, label: string } {
  return { icon: KINDS[t.kind].icon, label: t.kindLabel ?? KINDS[t.kind].label }
}

/**
 * The chosen destination as the field shows it: the title in full, where it
 * goes underneath, and an icon saying what kind of thing it is. A form says
 * how it opens instead of an address, since it has none.
 */
const display = computed(() => {
  const v = props.modelValue
  if (!v) return null
  if (v.kind === 'url') return { title: v.url, detail: 'External address', icon: KINDS.url.icon, kindLabel: KINDS.url.label, url: v.url }
  if (isBroken.value) return { title: 'Missing destination', detail: 'This was deleted', icon: 'i-lucide-triangle-alert', kindLabel: 'Missing', url: undefined }
  const t = target.value!
  return {
    title: t.title,
    detail: t.kind === 'form'
      ? (v.kind === 'form' && v.presentation === 'modal' ? 'Opens as a dialog' : 'Opens in place')
      : (t.path ?? t.detail ?? ''),
    icon: kindOf(t).icon,
    kindLabel: kindOf(t).label,
    url: t.url,
  }
})

/** Change, open and remove, behind one menu so the destination keeps the width. */
const menuItems = computed(() => [[
  { label: 'Change', icon: 'i-lucide-arrow-left-right', onSelect: beginReplace },
  ...(display.value?.url ? [{ label: 'Open page', icon: 'i-lucide-external-link', onSelect: () => { window.open(display.value!.url, '_blank', 'noopener') } }] : []),
  { label: 'Remove', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: clear },
]])

function setBookingPopup(on: boolean) {
  const value = props.modelValue
  if (value?.kind !== 'url' || props.readOnly) return
  const { presentation: _previous, ...rest } = value
  emit('update:modelValue', on ? { ...rest, newTab: false, presentation: 'booking-modal' } : rest)
}

function setModalFallback(url: string) {
  const value = props.modelValue
  if (value?.kind !== 'modal' || props.readOnly) return
  emit('update:modelValue', { ...value, fallback: { kind: 'url', url } })
}

function choose(t: LinkTarget) {
  if (props.readOnly) return
  wantsSection.value = false
  query.value = ''
  open.value = false
  replacing.value = false
  if (t.kind === 'page') emit('update:modelValue', { kind: 'page', page: t.id })
  else if (t.kind === 'entry') emit('update:modelValue', { kind: 'entry', collection: t.collection ?? '', entry: t.id })
  else if (t.kind === 'modal') emit('update:modelValue', { kind: 'modal', modalUuid: t.id, fallback: { kind: 'url', url: t.fallbackUrl || '' } })
  else if (t.kind === 'booking') emit('update:modelValue', { kind: 'booking', link: t.id })
  else if (t.zone) emit('update:modelValue', { kind: 'form', zone: t.zone })
  else emit('update:modelValue', { kind: 'form', form: t.id })
}
/** A form opens in place, or as a dialog over the page. */
function setModal(on: boolean) {
  const v = props.modelValue
  if (!v || v.kind !== 'form' || props.readOnly) return
  const { presentation: _previous, ...rest } = v
  emit('update:modelValue', on ? { ...rest, presentation: 'modal' } : rest)
}

function chooseUrl() {
  if (props.readOnly) return
  const url = query.value.trim()
  query.value = ''
  open.value = false
  replacing.value = false
  emit('update:modelValue', { kind: 'url', url, newTab: true })
}

/** Open the search over the current destination, keeping it until replaced. */
function beginReplace() {
  if (props.readOnly) return
  replacing.value = true
  query.value = ''
  open.value = false
}

/** Abandon the search and keep what was already chosen. */
function cancelReplace() {
  replacing.value = false
  query.value = ''
  open.value = false
}

/** Remove the destination outright. */
function clear() {
  if (props.readOnly) return
  wantsSection.value = false
  replacing.value = false
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
  if (event.key === 'Escape') {
    if (open.value) open.value = false
    else if (replacing.value) cancelReplace()
    return
  }
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
    <!-- picked: hover for the facts, the menu for what to do with it -->
    <div
      v-if="modelValue && !replacing"
      class="flex items-center gap-2 rounded-md border py-1.5 pl-2 pr-1"
      :class="isBroken
        ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40'
        : 'border-default bg-elevated'"
      data-testid="link-destination"
    >
      <UTooltip :text="display?.kindLabel">
        <span
          class="grid h-6 w-6 flex-none place-items-center rounded border"
          :class="isBroken ? 'border-red-300 text-red-600 dark:border-red-800 dark:text-red-400' : 'border-accented text-muted'"
          :aria-label="display?.kindLabel"
        >
          <UIcon :name="display?.icon ?? KINDS.url.icon" class="h-3.5 w-3.5" />
        </span>
      </UTooltip>

      <UPopover mode="hover" :open-delay="300" :close-delay="100" :content="{ side: 'left', align: 'start', sideOffset: 8 }">
        <span class="flex min-w-0 flex-1 cursor-default flex-col">
          <span class="line-clamp-2 break-words text-xs font-medium text-default">{{ display?.title }}</span>
          <span class="truncate font-mono text-[10px] text-muted">{{ display?.detail }}</span>
        </span>
        <template #content>
          <div class="flex w-72 flex-col gap-1.5 p-3 text-xs" data-testid="link-destination-card">
            <img v-if="target?.imageUrl" :src="target.imageUrl" alt="" class="mb-1 aspect-[1.91/1] w-full rounded object-cover">
            <span class="font-medium text-default">{{ display?.title }}</span>
            <span class="text-muted">
              {{ display?.kindLabel }}<template v-if="target?.status"> · {{ target.status === 'draft' ? 'Draft' : 'Published' }}</template>
            </span>
            <span v-if="target?.description" class="line-clamp-2 text-default">{{ target.description }}</span>
            <span v-if="display?.url" class="break-all font-mono text-[10px] text-muted">{{ display.url }}</span>
          </div>
        </template>
      </UPopover>

      <span
        v-if="target?.status === 'draft'"
        class="flex-none rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950 dark:text-amber-400"
      >Draft</span>
      <span
        v-else-if="isBroken"
        class="flex-none rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950 dark:text-red-400"
      >Broken</span>

      <UDropdownMenu v-if="!readOnly" :items="menuItems" :content="{ align: 'end' }">
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Destination actions"
          data-testid="link-destination-menu"
        />
      </UDropdownMenu>
    </div>

    <!-- searching -->
    <input
      v-if="!modelValue || replacing"
      type="text"
      autocomplete="off"
      :disabled="readOnly"
      :value="query"
      :placeholder="placeholder || 'Search pages and entries, or paste a URL…'"
      class="w-full rounded-md border border-accented px-2.5 py-1.5 text-xs text-default bg-default"
      @input="onInput(($event.target as HTMLInputElement).value)"
      @keydown="onKey"
      @focus="open = query.trim().length > 0"
    >

    <!-- keeping what is already there is one click away -->
    <button
      v-if="replacing && modelValue"
      type="button"
      class="self-start text-[11px] text-muted underline hover:text-default text-dimmed"
      @click="cancelReplace"
    >Keep {{ display?.title }}</button>

    <!-- results -->
    <div
      v-if="open"
      class="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-accented bg-white p-1 shadow-lg bg-default"
    >
      <button
        v-if="looksLikeUrl(query)"
        type="button"
        class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted hover:bg-elevated"
        @click="chooseUrl"
      >
        <span class="grid h-5 w-5 flex-none place-items-center rounded border border-accented text-muted"><UIcon :name="KINDS.url.icon" class="h-3 w-3" /></span>
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-xs font-medium text-default">Link to this address</span>
          <span class="truncate font-mono text-[10px] text-muted text-dimmed">{{ query.trim() }}</span>
        </span>
      </button>

      <template v-else-if="groups.length">
        <template v-for="group in groups" :key="group.kind">
          <div class="px-2 pb-1 pt-2 text-[9px] font-bold uppercase tracking-wider text-dimmed text-muted">
            {{ group.label }}
          </div>
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left"
            :class="indexOf(item) === cursor ? 'bg-accented' : 'hover:bg-accented'"
            @click="choose(item)"
          >
            <span class="grid h-5 w-5 flex-none place-items-center rounded border border-accented text-muted" :title="kindOf(item).label">
              <UIcon :name="kindOf(item).icon" class="h-3 w-3" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-xs font-medium text-default">{{ item.title }}</span>
              <span class="truncate font-mono text-[10px] text-muted text-dimmed">
                {{ item.kind === 'form' ? (item.detail ?? 'Opens in place') : (item.path ?? item.detail) }}
              </span>
            </span>
            <span
              v-if="item.status === 'draft'"
              class="flex-none rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950 dark:text-amber-400"
            >Draft</span>
          </button>
        </template>
      </template>

      <div v-else class="px-2 py-3 text-[11px] text-muted text-dimmed">
        Nothing matches “{{ query.trim() }}”. Paste a web address to link outside this site.
      </div>
    </div>

    <!-- a draft target ships a link the public cannot follow -->
    <p
      v-if="target?.status === 'draft'"
      class="text-[11px] leading-snug text-amber-700 dark:text-amber-400"
    >
      Publish this destination before publishing a page that links to it.
    </p>
    <p
      v-else-if="isBroken"
      class="text-[11px] leading-snug text-red-700 dark:text-red-400"
    >
      What this pointed at no longer exists. Choose a new destination, or this link will not render.
    </p>

    <!-- a form: in place, or as a dialog over the page -->
    <label v-if="modelValue?.kind === 'modal' && !replacing" class="flex flex-col gap-1 text-xs">
      Fallback destination
      <input type="text" :value="modelValue.fallback.url" :disabled="readOnly"
        placeholder="https:// or mailto:" class="rounded-md border px-2 py-1.5"
        @input="setModalFallback(($event.target as HTMLInputElement).value)">
      <span class="text-muted">Used when the dialog cannot open or the visitor opens the link in a new tab.</span>
    </label>
    <label
      v-if="modelValue?.kind === 'form' && !isBroken && !replacing"
      class="flex items-center gap-2 text-[11px] text-muted text-dimmed"
      data-testid="link-form-modal"
    >
      <input
        type="checkbox"
        :checked="modelValue.presentation === 'modal'"
        :disabled="readOnly"
        @change="setModal(($event.target as HTMLInputElement).checked)"
      >
      Open as a dialog instead of scrolling to it
    </label>

    <!-- jumping to a section on the chosen page -->
    <template v-if="modelValue?.kind === 'page' && !isBroken && !replacing">
      <label
        class="flex items-center gap-2 text-[11px] text-muted text-dimmed"
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
        class="w-full rounded-md border border-accented px-2.5 py-1.5 text-xs text-default bg-default"
        @change="setSection(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="section in sections" :key="section.id" :value="section.id">{{ section.label }}</option>
      </select>
      <p v-if="!sections.length" class="text-[11px] text-muted text-dimmed">
        This page has no headed sections to jump to.
      </p>
    </template>

    <label
      v-if="modelValue?.kind === 'url' && !replacing && !modelValue.presentation"
      class="flex items-center gap-2 text-[11px] text-muted text-dimmed"
    >
      <input
        type="checkbox"
        :checked="modelValue.newTab !== false"
        :disabled="readOnly"
        @change="setNewTab(($event.target as HTMLInputElement).checked)"
      >
      Open in a new tab
    </label>
    <label v-if="modelValue?.kind === 'url' && !replacing && calBookingPath(modelValue.url)" class="flex items-center gap-2 text-[11px] text-muted text-dimmed">
      <input type="checkbox" :checked="modelValue.presentation === 'booking-modal'" :disabled="readOnly" @change="setBookingPopup(($event.target as HTMLInputElement).checked)">
      Open booking popup
    </label>
  </div>
</template>
