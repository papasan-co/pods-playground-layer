<script setup lang="ts">
import type { PodListItem } from '#pods-player/types'

defineProps<{
  packLabel: string
  packMeta?: string
  pods: PodListItem[]
  activeSlug: string
  collapsed: boolean
  /** Show the "New pod" affordance (editable draft packs only). */
  canCreatePod?: boolean
}>()

const emit = defineEmits<{
  selectPod: [slug: string]
  back: []
  expand: []
  newPod: []
}>()
</script>

<template>
  <div
    v-if="!collapsed"
    data-testid="playground-pod-list"
    class="flex w-[232px] shrink-0 flex-col overflow-hidden pt-3.5 pb-3.5 pl-1"
    style="background: transparent"
  >
    <div class="px-3.5 pb-3">
      <button
        type="button"
        class="flex items-center gap-1.5 text-[11px] font-medium transition-colors duration-[var(--pg-duration-quick)]"
        style="color: var(--pg-fg-muted-warm)"
        @click="emit('back')"
      >
        <UIcon name="i-lucide-chevron-left" class="h-3 w-3" />
        All packs
      </button>
      <div
        class="mt-2 font-semibold tracking-tight"
        style="
          font-family: var(--pg-font-display);
          font-size: 19px;
          color: var(--pg-fg-primary);
        "
      >
        {{ packLabel }}
      </div>
      <div v-if="packMeta" class="mt-0.5 text-[11.5px]" style="color: var(--pg-fg-muted-warm)">
        {{ packMeta }}
      </div>
    </div>

    <div class="min-h-0 flex-1 space-y-px overflow-y-auto px-1.5">
      <button
        v-for="p in pods"
        :key="p.slug"
        type="button"
        class="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-[var(--pg-duration-quick)] hover:bg-[var(--pg-hover-surface)]"
        :class="
          p.slug === activeSlug
            ? '!bg-[var(--pg-surface)] font-semibold shadow-[var(--pg-shadow-active-row)] text-[var(--pg-fg-primary)]'
            : 'bg-transparent font-normal text-[var(--pg-fg-body)]'
        "
        @click="emit('selectPod', p.slug)"
      >
        <span class="min-w-0 flex-1">
          <span class="block truncate">{{ p.label || p.slug }}</span>
          <span
            v-if="p.sourceLabel"
            class="mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            :style="{
              color: p.sourceLayer === 'org' ? '#166534' : 'var(--pg-fg-muted-warm)',
              background: p.sourceLayer === 'org' ? '#dcfce7' : 'var(--pg-hover-surface)',
            }"
          >
            {{ p.sourceLabel }}
          </span>
        </span>
      </button>

      <button
        v-if="canCreatePod"
        type="button"
        data-testid="playground-new-pod"
        class="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors duration-[var(--pg-duration-quick)] hover:bg-[var(--pg-hover-surface)]"
        style="color: var(--pg-accent)"
        @click="emit('newPod')"
      >
        <UIcon name="i-lucide-plus" class="h-3.5 w-3.5 shrink-0" />
        New pod
      </button>
    </div>
  </div>

  <div
    v-else
    class="flex w-9 shrink-0 flex-col items-center pt-3.5"
    style="background: transparent"
  >
    <button
      type="button"
      class="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
      style="color: var(--pg-icon-muted)"
      title="Expand pod list"
      @click="emit('expand')"
    >
      <UIcon name="i-lucide-panel-left" class="h-3.5 w-3.5" />
    </button>
  </div>
</template>
