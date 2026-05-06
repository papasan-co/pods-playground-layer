<script setup lang="ts">
defineProps<{
  packs: { id: string; label: string }[]
  activePackId: string
}>()

const emit = defineEmits<{
  selectPack: [id: string]
}>()

const colorMode = useColorMode()

function letter(label: string) {
  return label.trim().charAt(0).toUpperCase() || '?'
}
</script>

<template>
  <div
    class="flex w-[52px] shrink-0 flex-col items-center gap-1 py-3.5"
    style="background: var(--pg-bg)"
  >
    <div class="mb-2 flex h-8 w-8 items-center justify-center">
      <slot name="logo">
        <img
          :src="colorMode.value === 'dark' ? '/autumn-icon-dark.svg' : '/autumn-default-icon.svg'"
          alt="Autumn"
          class="h-5 w-5"
        >
      </slot>
    </div>

    <button
      v-for="p in packs"
      :key="p.id"
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-semibold transition-colors duration-[var(--pg-duration-quick)]"
      :style="
        p.id === activePackId
          ? {
              background: 'var(--pg-fg-primary)',
              color: 'var(--pg-bg-soft)',
              border: 'none',
            }
          : {
              background: 'var(--pg-surface)',
              color: 'var(--pg-fg-secondary)',
              border: '1px solid var(--pg-border)',
            }
      "
      :title="p.label"
      @click="emit('selectPack', p.id)"
    >
      {{ letter(p.label) }}
    </button>

    <div class="my-1.5 h-px w-5" style="background: var(--pg-border)" />

    <button
      type="button"
      disabled
      class="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-lg opacity-40"
      style="color: var(--pg-icon-muted)"
      title="New pack (coming soon)"
    >
      <UIcon name="i-lucide-plus" class="h-3.5 w-3.5" />
    </button>

    <div class="min-h-0 flex-1" />

    <button
      type="button"
      disabled
      class="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-lg opacity-40"
      style="color: var(--pg-icon-muted)"
      title="Settings"
    >
      <UIcon name="i-lucide-settings" class="h-4 w-4" />
    </button>

    <div
      class="mt-1 flex h-[30px] w-[30px] shrink-0 cursor-default items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style="
        background: linear-gradient(
          135deg,
          var(--pg-brand-grad-start),
          var(--pg-brand-grad-end)
        );
      "
      title="Account"
    >
      <slot name="avatar">?</slot>
    </div>
  </div>
</template>
