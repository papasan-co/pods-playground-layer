<script setup lang="ts">
import { createApp, h } from 'vue'
import type { PodsPlayerViewport } from '#pods-player/types'

/**
 * pods-player-layer.app.components.pods-player.PodsPlayerPreviewDevice
 *
 * A lightweight iframe host that:
 * - isolates previews (avoids custom-element collisions)
 * - mirrors styles into the iframe (for consistent UI)
 * - optionally injects external scripts (e.g., PodPack bundle.js)
 *
 * This is a shared primitive used by both preview modes.
 */

const props = defineProps<{
  device: PodsPlayerViewport
  /**
   * Scripts to inject into the iframe.
   * The component dedupes by URL and awaits load before emitting `scriptsLoaded`.
   */
  scripts?: string[]
  /**
   * If false, the slot will not be mounted (useful when waiting on script readiness).
   */
  ready?: boolean
}>()

const emit = defineEmits<{
  (e: 'scriptsLoaded'): void
}>()

const frameStyle = computed(
  () =>
    ({
      laptop: { width: '1280px', height: '800px' },
      tablet: { width: '768px', height: '1024px' },
      phone: { width: '390px', height: '844px' },
    })[props.device],
)

const iframeRef = ref<HTMLIFrameElement>()
const slotVNode = shallowRef()
const slots = useSlots()

let obs: MutationObserver | null = null
let miniApp: ReturnType<typeof createApp> | null = null

onBeforeUnmount(() => {
  obs?.disconnect()
  miniApp?.unmount()
})

const STYLE_SELECTOR = 'style,link[rel="stylesheet"]'
function syncHead(from: Document, to: Document) {
  to.head.querySelectorAll(STYLE_SELECTOR).forEach((n) => n.remove())
  from.head.querySelectorAll(STYLE_SELECTOR).forEach((node) => {
    to.head.appendChild(node.cloneNode(true))
  })
}

function syncCSSVars(to: Document) {
  to.documentElement.style.cssText = document.documentElement.style.cssText
}

async function ensureScripts(doc: Document, urls: string[]) {
  const unique = [...new Set(urls)].filter(Boolean)
  if (unique.length === 0) return

  const existing = new Set(
    Array.from(doc.querySelectorAll('script[data-pods-player-script="1"]')).map((s) =>
      (s as HTMLScriptElement).src,
    ),
  )

  for (const url of unique) {
    if (existing.has(url)) continue
    await new Promise<void>((resolve, reject) => {
      const s = doc.createElement('script')
      s.type = 'text/javascript'
      s.src = url
      s.async = false
      s.dataset.podsPlayerScript = '1'
      s.onload = () => resolve()
      s.onerror = () => reject(new Error(`Failed to load script: ${url}`))
      doc.head.appendChild(s)
    })
  }
}

async function bootIframe() {
  const iframe = iframeRef.value
  if (!iframe) return

  const doc = iframe.contentDocument
  if (!doc) return

  if (!miniApp) {
    doc.open()
    doc.write(`
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <style>html,body{margin:0;height:100%;width:100%;overflow:hidden}</style>
        </head>
        <body></body>
      </html>
    `)
    doc.close()
    await nextTick()

    syncHead(document, doc)
    syncCSSVars(doc)

    obs = new MutationObserver(() => syncHead(document, doc))
    obs.observe(document.head, { childList: true })

    doc.documentElement.style.overflow = 'hidden'
    doc.documentElement.style.height = '100%'
    doc.body.style.overflow = 'hidden'
    doc.body.style.height = '100%'
    doc.body.style.margin = '0'
    doc.body.style.padding = '0'

    miniApp = createApp({ render: () => slotVNode.value || null })
    miniApp.mount(doc.body)
  }

  if (props.scripts?.length) {
    await ensureScripts(doc, props.scripts)
    emit('scriptsLoaded')
  }
}

watchEffect(() => {
  void props.device
  // Ensure script injection runs when the script list changes (WC mode).
  void props.scripts
  void props.ready
  slotVNode.value = props.ready === false ? null : h('div', { class: 'w-full h-full overflow-hidden' }, slots.default?.())
  void bootIframe()
})
</script>

<template>
  <div
    class="preview-device self-start transition-all duration-300 ease-in-out rounded-md shadow-lg bg-gray-100 dark:bg-gray-800 max-w-full"
    :style="frameStyle"
  >
    <iframe
      ref="iframeRef"
      class="w-full h-full border-none rounded-md"
      sandbox="allow-same-origin allow-scripts"
      title="Pod preview"
    />
  </div>
</template>

<style scoped>
.preview-device {
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>

