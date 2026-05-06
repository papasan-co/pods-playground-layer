<script setup lang="ts">
defineProps<{
  packLabel: string
  packMeta?: string
  pods: { slug: string; label: string }[]
  activeSlug: string
  collapsed: boolean
}>()

const emit = defineEmits<{
  selectPod: [slug: string]
  back: []
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
        class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-[var(--pg-duration-quick)] hover:bg-[var(--pg-hover-surface)]"
        :class="
          p.slug === activeSlug
            ? '!bg-[var(--pg-surface)] font-semibold shadow-[var(--pg-shadow-active-row)] text-[var(--pg-fg-primary)]'
            : 'bg-transparent font-normal text-[var(--pg-fg-body)]'
        "
        @click="emit('selectPod', p.slug)"
      >
        <span class="truncate">{{ p.label || p.slug }}</span>
      </button>
    </div>
  </div>
</template>
