import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, getCurrentInstance, h, onMounted } from 'vue'

import PodsPlayerPreviewDevice from '../../app/components/pods-player/PodsPlayerPreviewDevice.vue'

async function iframeDocument(wrapper: ReturnType<typeof mount>): Promise<Document> {
  await vi.waitFor(() => {
    expect(wrapper.get('iframe').element).toBeInstanceOf(HTMLIFrameElement)
    expect((wrapper.get('iframe').element as HTMLIFrameElement).contentDocument).not.toBeNull()
  })

  return (wrapper.get('iframe').element as HTMLIFrameElement).contentDocument!
}

describe('PodsPlayerPreviewDevice artifact stylesheet ownership', () => {
  it('installs exact artifact CSS before mounting iframe slot children', async () => {
    const source = '/workspace/cms-story-pods/.tmp/source-previews/initial/components/Pod.vue'
    const style = document.createElement('style')
    style.dataset.viteDevId = `${source}?vue&type=style&scoped=initial`
    style.textContent = '[data-v-initial] { display: grid; }'
    document.head.appendChild(style)
    let stylePresentOnMount = false
    const Child = defineComponent({
      setup() {
        const instance = getCurrentInstance()
        onMounted(() => {
          const element = instance?.proxy?.$el as Element | undefined
          stylePresentOnMount = Boolean(
            element?.ownerDocument.querySelector('style[data-pods-artifact-style="1"]'),
          )
        })

        return () => h('div', 'Preview')
      },
    })

    const wrapper = mount(PodsPlayerPreviewDevice, {
      attachTo: document.body,
      props: {
        device: 'laptop',
        ready: true,
        runtimeOwner: 'artifact-initial',
        canvasArtifactId: 'initial',
        sfcStylesheetSource: source,
      },
      slots: { default: () => h(Child) },
    })
    await iframeDocument(wrapper)
    await vi.waitFor(() => expect(stylePresentOnMount).toBe(true))

    wrapper.unmount()
    style.remove()
  })

  it('clones only the exact source-preview SFC stylesheet into the iframe', async () => {
    const current = document.createElement('style')
    current.dataset.viteDevId = '/workspace/cms-story-pods/.tmp/source-previews/current/components/WhatStart.vue?vue&type=style&scoped=abc'
    current.textContent = '[data-v-current] { font-size: 48px; }'
    const previous = document.createElement('style')
    previous.dataset.viteDevId = '/workspace/cms-story-pods/.tmp/source-previews/previous/components/WhatStart.vue?vue&type=style&scoped=old'
    previous.textContent = '[data-v-previous] { font-size: 12px; }'
    const unrelated = document.createElement('style')
    unrelated.dataset.viteDevId = '/workspace/cms-frontend/.tmp/unrelated.vue?vue&type=style'
    unrelated.textContent = '.cms-chrome { display: none; }'
    document.head.append(current, previous, unrelated)

    const wrapper = mount(PodsPlayerPreviewDevice, {
      attachTo: document.body,
      props: {
        device: 'laptop',
        ready: true,
        runtimeOwner: 'artifact-current',
        canvasArtifactId: 'current',
        sfcStylesheetSource: '/workspace/cms-story-pods/.tmp/source-previews/current/components/WhatStart.vue',
      },
    })
    const doc = await iframeDocument(wrapper)

    await vi.waitFor(() => {
      expect(doc.querySelectorAll('style[data-pods-artifact-style="1"]')).toHaveLength(1)
    })
    const cloned = doc.querySelector<HTMLElement>('style[data-pods-artifact-style="1"]')
    expect(cloned?.textContent).toContain('[data-v-current]')
    expect(cloned?.dataset.podsCanvasArtifactId).toBe('current')
    expect(cloned?.dataset.podsRuntimeOwner).toBe('artifact-current')
    expect(doc.head.textContent).not.toContain('[data-v-previous]')
    expect(doc.head.textContent).not.toContain('.cms-chrome')

    wrapper.unmount()
    current.remove()
    previous.remove()
    unrelated.remove()
  })

  it('switches from a direct preview source to an exact stable preview source', async () => {
    const first = document.createElement('style')
    first.dataset.viteDevId = '/workspace/cms-story-pods/.tmp/source-previews/first/components/Pod.vue?vue&type=style'
    first.textContent = '[data-v-first] { color: red; }'
    const stable = document.createElement('style')
    stable.dataset.viteDevId = '/workspace/cms-story-pods/.tmp/source-preview-live/base__pod__draft/components/Pod.vue?vue&type=style'
    stable.textContent = '[data-v-stable] { color: blue; }'
    document.head.append(first, stable)

    const wrapper = mount(PodsPlayerPreviewDevice, {
      attachTo: document.body,
      props: {
        device: 'phone',
        ready: true,
        runtimeOwner: 'artifact-first',
        canvasArtifactId: 'first',
        sfcStylesheetSource: '/workspace/cms-story-pods/.tmp/source-previews/first/components/Pod.vue',
      },
    })
    const doc = await iframeDocument(wrapper)
    await vi.waitFor(() => expect(doc.head.textContent).toContain('color: red'))

    await wrapper.setProps({
      runtimeOwner: 'artifact-stable',
      canvasArtifactId: 'second',
      sfcStylesheetSource: '/workspace/cms-story-pods/.tmp/source-preview-live/base__pod__draft/components/Pod.vue',
    })
    await vi.waitFor(() => expect(doc.head.textContent).toContain('color: blue'))
    expect(doc.head.textContent).not.toContain('color: red')
    expect(doc.querySelectorAll('style[data-pods-artifact-style="1"]')).toHaveLength(1)

    await wrapper.setProps({ sfcStylesheetSource: null })
    await vi.waitFor(() => {
      expect(doc.querySelector('style[data-pods-artifact-style="1"]')).toBeNull()
    })
    wrapper.unmount()
    first.remove()
    stable.remove()
  })

  it('tracks delayed insertion, text updates, and removal for the active exact source', async () => {
    const source = '/workspace/cms-story-pods/.tmp/source-previews/delayed/components/Pod.vue'
    const wrapper = mount(PodsPlayerPreviewDevice, {
      attachTo: document.body,
      props: {
        device: 'tablet',
        ready: true,
        runtimeOwner: 'artifact-delayed',
        canvasArtifactId: 'delayed',
        sfcStylesheetSource: source,
      },
    })
    const doc = await iframeDocument(wrapper)
    expect(doc.querySelector('style[data-pods-artifact-style="1"]')).toBeNull()

    const style = document.createElement('style')
    style.dataset.viteDevId = `${source}?vue&type=style&scoped=delayed`
    style.textContent = '[data-v-delayed] { display: grid; }'
    document.head.appendChild(style)
    await vi.waitFor(() => expect(doc.head.textContent).toContain('display: grid'))

    style.textContent = '[data-v-delayed] { display: flex; }'
    await vi.waitFor(() => expect(doc.head.textContent).toContain('display: flex'))

    style.remove()
    await vi.waitFor(() => {
      expect(doc.querySelector('style[data-pods-artifact-style="1"]')).toBeNull()
    })
    wrapper.unmount()
  })

  it('does not reinsert active artifact CSS from queued observer work after unmount', async () => {
    const source = '/workspace/cms-story-pods/.tmp/source-previews/teardown/components/Pod.vue'
    const style = document.createElement('style')
    style.dataset.viteDevId = `${source}?vue&type=style&scoped=teardown`
    style.textContent = '[data-v-teardown] { color: red; }'
    document.head.appendChild(style)

    const wrapper = mount(PodsPlayerPreviewDevice, {
      attachTo: document.body,
      props: {
        device: 'phone',
        ready: true,
        runtimeOwner: 'artifact-teardown',
        canvasArtifactId: 'teardown',
        sfcStylesheetSource: source,
      },
    })
    const doc = await iframeDocument(wrapper)
    await vi.waitFor(() => expect(doc.head.textContent).toContain('color: red'))

    style.remove()
    style.textContent = '[data-v-teardown] { color: green; }'
    document.head.appendChild(style)
    wrapper.unmount()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(doc.querySelector('style[data-pods-artifact-style="1"]')).toBeNull()
    style.remove()
  })
})
