<script setup lang="ts">
defineProps<{
  artifactReady?: boolean
}>()
</script>

<template>
  <div
    class="relative flex min-h-0 flex-1 flex-col items-center justify-center px-1 pb-1 pt-1"
  >
    <div
      v-if="artifactReady === false"
      class="mb-2 max-w-xl rounded-md px-3 py-2 text-xs"
      style="
        background: var(--pg-bg-soft);
        border: 1px solid var(--pg-border-dashed);
        color: var(--pg-fg-meta);
      "
    >
      Artifact mode unavailable. Run
      <code class="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">pnpm build:podpack</code>
      and reload.
    </div>

    <div
      class="relative flex min-h-0 w-full max-h-[580px] flex-1 flex-col overflow-hidden rounded-xl border"
      style="
        border-color: var(--pg-border);
        box-shadow: var(--pg-shadow-canvas);
      "
    >
      <slot />
    </div>
  </div>
</template>
