<script setup lang="ts">
import type { PodsPlayerViewport } from '#pods-player/types'

const props = defineProps<{
  artifactReady?: boolean
  viewport?: PodsPlayerViewport
}>()

const hostRef = ref<HTMLDivElement | null>(null)
const hostSize = ref({ width: 0, height: 0 })

let resizeObserver: ResizeObserver | null = null

const frameSize = computed(() => ({
  laptop: { width: 1662, height: 1066 },
  tablet: { width: 900, height: 1200 },
  phone: { width: 440, height: 860 },
})[props.viewport || 'laptop'])

const framePadding = 32
const canvasFrameStyle = computed<Record<string, string>>(() => {
  const hostW = hostSize.value.width
  const hostH = hostSize.value.height
  const device = frameSize.value
  if (!hostW || !hostH) {
    return {
      width: '100%',
      height: '100%',
    }
  }

  const availableW = Math.max(0, hostW - framePadding)
  const availableH = Math.max(0, hostH - framePadding)
  const scale = Math.min(availableW / device.width, availableH / device.height, 1)
  const width = Math.round(device.width * scale + framePadding)
  const height = Math.round(device.height * scale + framePadding)

  return {
    width: `${width}px`,
    height: `${height}px`,
  }
})

onMounted(() => {
  if (!hostRef.value || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    hostSize.value = {
      width: entry.contentRect.width,
      height: entry.contentRect.height,
    }
  })
  resizeObserver.observe(hostRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <div
    ref="hostRef"
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
      class="relative flex max-h-full max-w-full flex-col overflow-hidden rounded-xl border"
      :style="[
        canvasFrameStyle,
        {
          borderColor: 'var(--pg-border)',
          boxShadow: 'var(--pg-shadow-canvas)',
        },
      ]"
    >
      <slot />
    </div>
  </div>
</template>
