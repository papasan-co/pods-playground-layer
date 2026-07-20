<script setup lang="ts">
import { createApp, h } from 'vue'
import type { PodsPlayerViewport } from '#pods-player/types'
import {
  hasRuntimeAssetScripts,
  installPreviewShellStyles,
  type RuntimeAssetLoadIdentity,
} from '#pods-player/runtime/isolation'

/**
 * pods-playground-layer.app.components.pods-player.PodsPlayerPreviewDevice
 *
 * A lightweight iframe host that:
 * - isolates previews (avoids custom-element collisions)
 * - mirrors styles into the iframe (for consistent UI)
 * - optionally injects external scripts (e.g., runtime bundles)
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
   * Module scripts (ESM) to inject into the iframe.
   * Used by the Vue-CDN runtime bundle.
   */
  moduleScripts?: string[]
  /**
   * If false, the slot will not be mounted (useful when waiting on script readiness).
   */
  ready?: boolean
  /**
   * If true, allow the iframe document to scroll (used for StoryScrollyPage).
   * Default is false (pod previews are typically non-scrolling).
   */
  scrollable?: boolean
  /**
   * Optional CSS vars to apply to iframe root. Applied after base variable sync.
   */
  cssVars?: Record<string, string> | null
  /**
   * Additional stylesheet URLs injected directly into iframe head.
   */
  extraStylesheets?: string[]
  /** Immutable owner attached to every managed stylesheet/module node. */
  runtimeOwner?: string | null
  /**
   * Extra classes applied to iframe document root.
   */
  rootClasses?: string[]
  /** Dataset values applied explicitly to the iframe body. */
  bodyDataset?: Record<string, string> | null
  /**
   * The source preview or draft artifact currently rendered inside the iframe.
   * Parent readiness waits for this marker so it does not race the iframe mini-app render.
   */
  canvasArtifactId?: string | null
  /**
   * Debug-only fill diagnostic that makes unused space obvious without changing the normal preview chrome.
   */
  debugFill?: boolean
  /**
   * Preview-only override for source-preview activation. When enabled, existing
   * pod layer sequence attributes render their final visible state immediately.
   */
  settleLayerSequences?: boolean
  /**
   * Bumped by the parent after HMR props commits so layer final-state overrides
   * reapply after the pod component updates its own sequence attributes/styles.
   */
  settleLayerSequencesRevision?: number
  /**
   * Bumped when the parent slot mode or props change. The iframe mini-app is
   * intentionally stable, so it needs an explicit signal to refresh slot vnodes.
   */
  slotRevision?: number | string | null
}>()

const emit = defineEmits<{
  (e: 'scriptsLoaded', payload: RuntimeAssetLoadIdentity): void
  (e: 'scriptsFailed', payload: RuntimeAssetLoadIdentity & { error: unknown }): void
}>()

const frameSize = computed(
  () =>
    ({
      laptop: { width: 1662, height: 1066 },
      tablet: { width: 900, height: 1200 },
      phone: { width: 440, height: 860 },
    })[props.device],
)

const frameStyle = computed(() => ({
  width: `${frameSize.value.width}px`,
  height: `${frameSize.value.height}px`,
}))

const hostRef = ref<HTMLDivElement | null>(null)
const hostSize = ref({ width: 0, height: 0 })

let resizeObserver: ResizeObserver | null = null

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

const scale = computed(() => {
  const { width: hostW, height: hostH } = hostSize.value
  const { width: deviceW, height: deviceH } = frameSize.value
  if (!hostW || !hostH) return 1
  // Keep the device's aspect ratio, only shrinking (never upscaling).
  return Math.min(hostW / deviceW, hostH / deviceH, 1)
})

const scaledSize = computed(() => ({
  width: Math.round(frameSize.value.width * scale.value),
  height: Math.round(frameSize.value.height * scale.value),
}))

const iframeRef = ref<HTMLIFrameElement>()
const slotVNode = shallowRef()
const slots = useSlots()

let miniApp: ReturnType<typeof createApp> | null = null
let booting = false
let bootAgain = false

onBeforeUnmount(() => {
  miniApp?.unmount()
})

// Vite represents explicitly imported shell CSS and scoped component CSS as
// style nodes in development. Copy only the known preview-shell sources; the
// previous catch-all copied every host style (including unrelated CMS chrome)
// into every preview frame.
const SHELL_STYLE_SELECTOR = [
  'style[data-vite-dev-id*="/assets/css/"]',
  'style[data-vite-dev-id*="/.nuxt/ui.css"]',
  'style[data-vite-dev-id*="/.nuxt/nuxt-fonts-global.css"]',
  'style[data-vite-dev-id*="/pods-playground-layer/app/components/pods-player/"]',
  'style[data-vite-dev-id*="/cms-story-pods/src/pods/"]',
  'style[data-vite-dev-id*="/cms-story-pods/.pod-studio/"]',
  'style[data-vite-dev-id*="/scroll-runtime-layer/"]',
  'style[data-vite-dev-id*="/story-scroll-layer/"]',
].join(',')
const SYNCED_HEAD_SELECTOR = '[data-pods-shell-style="1"]'

function syncShellStyles(from: Document, to: Document) {
  to.head.querySelectorAll(SYNCED_HEAD_SELECTOR).forEach((n) => n.remove())
  from.head.querySelectorAll(SHELL_STYLE_SELECTOR).forEach((node) => {
    const cloned = node.cloneNode(true) as HTMLElement
    cloned.dataset.podsShellStyle = '1'
    to.head.appendChild(cloned)
  })
}

function syncCSSVars(to: Document) {
  to.documentElement.style.cssText = ''

  const vars = props.cssVars
  if (vars && typeof vars === 'object') {
    for (const [key, value] of Object.entries(vars)) {
      if (typeof key !== 'string' || !key.trim()) continue
      if (typeof value !== 'string' || !value.trim()) continue
      to.documentElement.style.setProperty(key, value)
    }
  }

  const classSet = new Set<string>()

  for (const className of props.rootClasses ?? []) {
    if (typeof className !== 'string') continue
    const trimmed = className.trim()
    if (!trimmed) continue
    classSet.add(trimmed)
  }

  to.documentElement.className = Array.from(classSet).join(' ')
}

const appliedBodyDatasetKeys = new Set<string>()

function syncBodyDataset(to: Document) {
  for (const key of appliedBodyDatasetKeys) {
    delete to.body.dataset[key]
  }
  appliedBodyDatasetKeys.clear()

  for (const [key, value] of Object.entries(props.bodyDataset ?? {})) {
    if (!key || typeof value !== 'string') continue
    to.body.dataset[key] = value
    appliedBodyDatasetKeys.add(key)
  }
}

function syncRuntime(fromWin: Window, toWin: Window) {
  try {
    const rt = (fromWin as any).__AUTUMN_RUNTIME__
    if (!rt || typeof rt !== 'object') return
    // Copy-by-value so the iframe can't accidentally mutate the parent runtime config.
    const cloned =
      typeof (fromWin as any).structuredClone === 'function'
        ? (fromWin as any).structuredClone(rt)
        : JSON.parse(JSON.stringify(rt))
    ;(toWin as any).__AUTUMN_RUNTIME__ = cloned
  } catch {
    // ignore
  }
}

function applyScrollMode(doc: Document, scrollable: boolean) {
  const html = doc.documentElement
  const body = doc.body
  if (!html || !body) return

  if (scrollable) {
    // IMPORTANT: don't force a scroll container on html/body.
    // Browsers handle iframe document scrolling naturally; forcing overflow
    // can break `position: sticky` inside the scrolly layout.
    html.style.overflow = ''
    body.style.overflow = ''
    html.style.height = ''
    body.style.height = ''
  } else {
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    html.style.height = '100%'
    body.style.height = '100%'
  }

  body.style.margin = '0'
  body.style.padding = '0'
}

function clearLayerSequenceSettleOverrides(doc: Document) {
  doc
    .querySelectorAll<HTMLElement>('[data-pods-preview-sequence-root-settled="1"]')
    .forEach((sequenceRoot) => {
      if (sequenceRoot.dataset.podsPreviewHadSequenceSettled !== '1') {
        sequenceRoot.classList.remove('sequence-settled')
      }

      const previousState = sequenceRoot.dataset.podsPreviewPreviousSequenceState
      if (sequenceRoot.dataset.podsPreviewHadSequenceState === '1') {
        sequenceRoot.dataset.sequenceState = previousState
      } else {
        sequenceRoot.removeAttribute('data-sequence-state')
      }

      sequenceRoot.removeAttribute('data-pods-preview-had-sequence-settled')
      sequenceRoot.removeAttribute('data-pods-preview-had-sequence-state')
      sequenceRoot.removeAttribute('data-pods-preview-previous-sequence-state')
      sequenceRoot.removeAttribute('data-pods-preview-sequence-root-settled')
    })
  doc
    .querySelectorAll<HTMLElement>('[data-pods-preview-layer-settled-inline="1"]')
    .forEach((element) => {
      element.style.removeProperty('animation')
      element.style.removeProperty('opacity')
      element.style.removeProperty('pointer-events')
      element.style.removeProperty('transform')
      element.style.removeProperty('visibility')
      element.removeAttribute('data-pods-preview-layer-settled-inline')
    })
}

function applyLayerSequenceSettleOverrides(doc: Document, enabled: boolean) {
  clearLayerSequenceSettleOverrides(doc)
  if (!enabled) return

  doc.querySelectorAll<HTMLElement>('[data-pod-layer-sequence="1"]').forEach((sequenceRoot) => {
    sequenceRoot.dataset.podsPreviewHadSequenceSettled = sequenceRoot.classList.contains(
      'sequence-settled',
    )
      ? '1'
      : '0'
    sequenceRoot.dataset.podsPreviewHadSequenceState = sequenceRoot.hasAttribute(
      'data-sequence-state',
    )
      ? '1'
      : '0'
    sequenceRoot.dataset.podsPreviewPreviousSequenceState = sequenceRoot.dataset.sequenceState || ''
    sequenceRoot.dataset.podsPreviewSequenceRootSettled = '1'
    sequenceRoot.classList.add('sequence-settled')
    sequenceRoot.dataset.sequenceState = 'settled'
  })

  doc
    .querySelectorAll<HTMLElement>('[data-pod-layer-sequence="1"] [data-layer]')
    .forEach((layer) => {
      const finalVisible = layer.dataset.layerFinalVisible === '1'
      layer.dataset.layerCurrentVisible = finalVisible ? '1' : '0'
      layer.setAttribute('aria-hidden', finalVisible ? 'false' : 'true')
      layer.setAttribute('data-pods-preview-layer-settled-inline', '1')
      layer.style.setProperty('animation', 'none', 'important')
      layer.style.setProperty('transform', 'none', 'important')

      if (finalVisible) {
        layer.style.setProperty('opacity', '1', 'important')
        layer.style.setProperty('visibility', 'visible', 'important')
        layer.style.setProperty('pointer-events', 'auto', 'important')
      } else {
        layer.style.setProperty('opacity', '0', 'important')
        layer.style.setProperty('visibility', 'hidden', 'important')
        layer.style.setProperty('pointer-events', 'none', 'important')
      }
    })
}

async function ensureScripts(doc: Document, urls: string[]) {
  const unique = [...new Set(urls)]
    .filter(Boolean)
    .map((url) => new URL(url, window.location.origin).href)
  if (unique.length === 0) return

  const existing = new Set(
    Array.from(doc.querySelectorAll('script[data-pods-player-script="1"]')).map(
      (s) => (s as HTMLScriptElement).src,
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
      s.dataset.podsRuntimeOwner = props.runtimeOwner || 'unowned'
      s.onload = () => resolve()
      s.onerror = () => {
        s.remove()
        reject(new Error(`Failed to load script: ${url}`))
      }
      doc.head.appendChild(s)
    })
  }
}

async function ensureModuleScripts(doc: Document, urls: string[]) {
  const unique = [...new Set(urls)]
    .filter(Boolean)
    .map((url) => new URL(url, window.location.origin).href)
  if (unique.length === 0) return

  const existing = new Set(
    Array.from(doc.querySelectorAll('script[data-pods-player-module="1"]')).map(
      (s) => (s as HTMLScriptElement).src,
    ),
  )

  for (const url of unique) {
    if (existing.has(url)) continue
    await new Promise<void>((resolve, reject) => {
      const s = doc.createElement('script')
      s.type = 'module'
      s.src = url
      s.async = false
      s.dataset.podsPlayerModule = '1'
      s.dataset.podsRuntimeOwner = props.runtimeOwner || 'unowned'
      s.onload = () => resolve()
      s.onerror = () => {
        s.remove()
        reject(new Error(`Failed to load module script: ${url}`))
      }
      doc.head.appendChild(s)
    })
  }
}

function stylesheetLoaded(link: HTMLLinkElement): boolean {
  if (link.dataset.podsExtraStyleLoaded === '1') return true

  try {
    return Boolean(link.sheet)
  } catch {
    return false
  }
}

function waitForStylesheet(link: HTMLLinkElement): Promise<void> {
  if (stylesheetLoaded(link)) {
    link.dataset.podsExtraStyleLoaded = '1'

    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      if (stylesheetLoaded(link)) {
        link.dataset.podsExtraStyleLoaded = '1'
      }
      resolve()
    }, 5000)
    const cleanup = () => {
      window.clearTimeout(timeout)
      link.removeEventListener('load', handleLoad)
      link.removeEventListener('error', handleError)
    }
    const handleLoad = () => {
      cleanup()
      link.dataset.podsExtraStyleLoaded = '1'
      resolve()
    }
    const handleError = () => {
      cleanup()
      const url = link.href
      link.remove()
      reject(new Error(`Failed to load stylesheet: ${url}`))
    }

    link.addEventListener('load', handleLoad, { once: true })
    link.addEventListener('error', handleError, { once: true })
  })
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false

  return left.every((value, index) => value === right[index])
}

async function syncExtraStylesheets(doc: Document, urls: string[]) {
  const wanted = [...new Set(urls)]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => new URL(value.trim(), window.location.origin).href)

  const existingNodes = Array.from(
    doc.querySelectorAll('link[data-pods-extra-style="1"]'),
  ) as HTMLLinkElement[]
  const existingMap = new Map(existingNodes.map((node) => [node.href, node]))

  for (const node of existingNodes) {
    if (!wanted.includes(node.href)) {
      node.remove()
    }
  }

  for (const href of wanted) {
    if (existingMap.has(href)) continue
    const link = doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.podsExtraStyle = '1'
    link.dataset.podsRuntimeOwner = props.runtimeOwner || 'unowned'
    doc.head.appendChild(link)
  }

  const activeLinks = Array.from(
    doc.querySelectorAll('link[data-pods-extra-style="1"]'),
  ) as HTMLLinkElement[]
  await Promise.all(
    activeLinks.filter((node) => wanted.includes(node.href)).map((node) => waitForStylesheet(node)),
  )
}

async function bootIframe() {
  if (booting) {
    bootAgain = true
    return
  }

  booting = true
  const assetLoad: RuntimeAssetLoadIdentity = {
    runtimeOwner: props.runtimeOwner || null,
    moduleScripts: [...(props.moduleScripts ?? [])],
    scripts: [...(props.scripts ?? [])],
    extraStylesheets: [...(props.extraStylesheets ?? [])],
  }
  try {
    await bootIframeNow(assetLoad)
  } catch (error) {
    emit('scriptsFailed', { ...assetLoad, error })
  } finally {
    booting = false
    if (bootAgain) {
      bootAgain = false
      void bootIframe()
    }
  }
}

async function bootIframeNow(assetLoad: RuntimeAssetLoadIdentity) {
  const iframe = iframeRef.value
  if (!iframe) return

  const moduleScripts = [...(assetLoad.moduleScripts ?? [])]
  const scripts = [...(assetLoad.scripts ?? [])]
  const extraStylesheets = [...(assetLoad.extraStylesheets ?? [])]
  const doc = iframe.contentDocument
  if (!doc) return
  const win = iframe.contentWindow

  if (!miniApp) {
    doc.open()
    doc.write(`
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <style>html,body{margin:0;width:100%;}</style>
        </head>
        <body></body>
      </html>
    `)
    doc.close()
    await nextTick()

    installPreviewShellStyles(doc)
    syncShellStyles(document, doc)
    syncCSSVars(doc)
    syncBodyDataset(doc)
    await syncExtraStylesheets(doc, extraStylesheets)
    if (win) syncRuntime(window, win)

    applyScrollMode(doc, !!props.scrollable)

    miniApp = createApp({ render: () => slotVNode.value || null })
    miniApp.mount(doc.body)
  }

  // IMPORTANT: `syncCSSVars()` overwrites `documentElement.style.cssText`, so it must run
  // BEFORE `applyScrollMode()` to avoid clobbering overflow/height rules required for
  // non-scroll previews (many pods rely on `h-full`).
  syncCSSVars(doc)
  syncBodyDataset(doc)
  await syncExtraStylesheets(doc, extraStylesheets)
  applyScrollMode(doc, !!props.scrollable)
  if (win) syncRuntime(window, win)

  if (moduleScripts.length) {
    await ensureModuleScripts(doc, moduleScripts)
  }

  if (scripts.length) {
    await ensureScripts(doc, scripts)
  }

  if (
    hasRuntimeAssetScripts(assetLoad) &&
    sameStringList(moduleScripts, props.moduleScripts ?? []) &&
    sameStringList(scripts, props.scripts ?? []) &&
    sameStringList(extraStylesheets, props.extraStylesheets ?? []) &&
    (assetLoad.runtimeOwner || null) === (props.runtimeOwner || null)
  ) {
    emit('scriptsLoaded', assetLoad)
  }

  await nextTick()
  applyLayerSequenceSettleOverrides(doc, props.settleLayerSequences === true)
}

watchEffect(() => {
  void props.device
  // Ensure script injection runs when the script list changes (WC mode).
  void props.scripts
  void props.moduleScripts
  void props.ready
  void props.scrollable
  void props.cssVars
  void props.extraStylesheets
  void props.runtimeOwner
  void props.rootClasses
  void props.bodyDataset
  void props.canvasArtifactId
  void props.debugFill
  void props.settleLayerSequences
  void props.settleLayerSequencesRevision
  void props.slotRevision
  if (props.ready === false && slotVNode.value) {
    void nextTick().then(() => bootIframe())
    return
  }

  slotVNode.value =
    props.ready === false
      ? null
      : h(
          'div',
          /**
           * Scroll mode: do NOT force a fixed height or overflow-hidden on the root wrapper.
           * The iframe document should be able to grow and scroll naturally.
           */
          {
            class: props.scrollable ? 'w-full min-h-full' : 'w-full h-full overflow-hidden',
            'data-pods-preview-root': '1',
            'data-pods-canvas-artifact-id': props.canvasArtifactId || '',
            'data-pods-debug-fill': props.debugFill ? '1' : '0',
            'data-pods-preview-settle-layer-sequences': props.settleLayerSequences ? '1' : '0',
            style: {
              width: '100%',
              ...(props.scrollable
                ? { minHeight: '100%' }
                : { height: '100%', overflow: 'hidden' }),
              ...(props.debugFill
                ? {
                    backgroundImage:
                      'repeating-linear-gradient(135deg, rgba(239,68,68,0.16) 0 18px, rgba(248,113,113,0.16) 18px 36px)',
                    outline: '2px solid rgba(220,38,38,0.7)',
                    outlineOffset: '-2px',
                  }
                : {}),
            },
          },
          slots.default?.(),
        )
  void nextTick().then(() => bootIframe())
})

defineExpose({
  iframeElement: () => iframeRef.value ?? null,
  iframeWindow: () => iframeRef.value?.contentWindow ?? null,
})
</script>

<template>
  <div ref="hostRef" class="preview-device-host w-full h-full flex items-start justify-center">
    <div
      class="preview-device-slot"
      :style="{
        width: `${scaledSize.width}px`,
        height: `${scaledSize.height}px`,
      }"
    >
      <div
        class="preview-device transition-all duration-300 ease-in-out rounded-md shadow-lg"
        :style="[
          frameStyle,
          {
            background: 'var(--pg-device-bg, #f8f6f4)',
            position: 'absolute',
            top: '0px',
            left: '0px',
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          },
        ]"
      >
        <iframe
          ref="iframeRef"
          class="w-full h-full border-none rounded-md"
          sandbox="allow-same-origin allow-scripts"
          title="Pod preview"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-device {
  overflow: hidden;
}
.preview-device-slot {
  position: relative;
}
</style>
