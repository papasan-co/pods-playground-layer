import * as Vue from 'vue'
import { defineComponent, h, nextTick, onScopeDispose, reactive, ref, watch } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import {
  injectPodsPlayerSourcePreviewActivation,
  providePodsPlayerSourcePreviewActivation,
  sourcePreviewIdForSubject,
  type PodsPlayerSourcePreviewActivation,
} from '../../app/pods-player/sourcePreviewActivation'
import { usePodPlayer } from '../../app/composables/pods-player/usePodPlayer'
import {
  pendingPods,
  podRequests,
  resetSourcePreviewRuntime,
} from './fixtures/source-preview-runtime'

function activation(id: string): PodsPlayerSourcePreviewActivation {
  return {
    id: ref(id),
    podSlug: ref('arc-read'),
    draftPackId: ref('org-pack'),
    revision: ref(1),
  }
}

describe('source preview activation context', () => {
  it('delivers activation and compile revisions only inside its editor owner', async () => {
    const first = activation('arc-preview')
    const second = activation('other-preview')
    const firstReload = vi.fn()
    const secondReload = vi.fn()

    const Consumer = defineComponent({
      props: { reload: { type: Function, required: true } },
      setup(props) {
        const injected = injectPodsPlayerSourcePreviewActivation()
        const stop = watch(
          () => injected?.revision.value,
          () => props.reload(),
        )
        onScopeDispose(stop)
        return () => sourcePreviewIdForSubject(injected, 'arc-read', 'org-pack')
      },
    })
    const Owner = defineComponent({
      props: {
        owner: { type: Object, required: true },
        reload: { type: Function, required: true },
      },
      setup(props) {
        providePodsPlayerSourcePreviewActivation(props.owner as PodsPlayerSourcePreviewActivation)
        return () => h(Consumer, { reload: props.reload })
      },
    })

    const firstEditor = mount(Owner, {
      props: { owner: first, reload: firstReload },
    })
    const secondEditor = mount(Owner, {
      props: { owner: second, reload: secondReload },
    })
    expect(firstEditor.text()).toBe('arc-preview')
    expect(secondEditor.text()).toBe('other-preview')

    first.revision.value += 1
    await nextTick()
    expect(firstReload).toHaveBeenCalledOnce()
    expect(secondReload).not.toHaveBeenCalled()

    firstEditor.unmount()
    first.revision.value += 1
    await nextTick()
    expect(firstReload).toHaveBeenCalledOnce()
    secondEditor.unmount()
  })

  it('rejects stale pod and draft tuples instead of leaking another preview', () => {
    const current = activation('arc-preview')

    expect(sourcePreviewIdForSubject(current, 'arc-read', 'org-pack')).toBe('arc-preview')
    expect(sourcePreviewIdForSubject(current, 'what-start', 'org-pack')).toBe('')
    expect(sourcePreviewIdForSubject(current, 'arc-read', 'org-other')).toBe('')
    expect(sourcePreviewIdForSubject(null, 'arc-read', 'org-pack')).toBe('')
  })

  it('reloads the real player consumer on revision and rejects a stale async result', async () => {
    Object.assign(globalThis, Vue)
    const route = reactive({
      params: { packId: 'base', podId: 'arc-read' },
      query: { draftPack: 'org-pack' } as Record<string, string>,
    })
    Object.assign(globalThis, { useRoute: () => route })
    resetSourcePreviewRuntime()
    const current = activation('arc-preview')
    let player: ReturnType<typeof usePodPlayer> | null = null
    const Consumer = defineComponent({
      setup() {
        player = usePodPlayer(ref('arc-read'))
        return () => player?.pod.value?.label || ''
      },
    })
    const Owner = defineComponent({
      setup() {
        providePodsPlayerSourcePreviewActivation(current)
        return () => h(Consumer)
      },
    })
    const editor = mount(Owner)
    await nextTick()
    expect(podRequests).toEqual([{ slug: 'arc-read', subjectId: 'arc-preview' }])

    current.id.value = 'arc-preview-2'
    current.revision.value += 1
    await nextTick()
    expect(podRequests.at(-1)).toEqual({ slug: 'arc-read', subjectId: 'arc-preview-2' })

    pendingPods[1]?.({ slug: 'arc-read', label: 'Current Arc' } as never)
    await nextTick()
    pendingPods[0]?.({ slug: 'arc-read', label: 'Stale Arc' } as never)
    await nextTick()
    expect(editor.text()).toBe('Current Arc')
    editor.unmount()
  })

  it('reloads an unchanged preview identity on a compile revision only', async () => {
    Object.assign(globalThis, Vue)
    const route = reactive({
      params: { packId: 'base', podId: 'arc-read' },
      query: { draftPack: 'org-pack' } as Record<string, string>,
    })
    Object.assign(globalThis, { useRoute: () => route })
    resetSourcePreviewRuntime()
    const current = activation('arc-preview')
    const Consumer = defineComponent({
      setup() {
        const player = usePodPlayer(ref('arc-read'))
        return () => String(player.loading.value)
      },
    })
    const Owner = defineComponent({
      setup() {
        providePodsPlayerSourcePreviewActivation(current)
        return () => h(Consumer)
      },
    })
    const editor = mount(Owner)
    await nextTick()
    expect(podRequests).toEqual([{ slug: 'arc-read', subjectId: 'arc-preview' }])

    current.revision.value += 1
    await nextTick()
    expect(podRequests).toEqual([
      { slug: 'arc-read', subjectId: 'arc-preview' },
      { slug: 'arc-read', subjectId: 'arc-preview' },
    ])
    editor.unmount()
  })

  it('isolates and disposes two mounted real player consumers', async () => {
    Object.assign(globalThis, Vue)
    const route = reactive({
      params: { packId: 'base', podId: 'arc-read' },
      query: { draftPack: 'org-pack' } as Record<string, string>,
    })
    Object.assign(globalThis, { useRoute: () => route })
    resetSourcePreviewRuntime()
    const first = activation('arc-preview-first')
    const second = activation('arc-preview-second')
    const Consumer = defineComponent({
      setup() {
        const player = usePodPlayer(ref('arc-read'))
        return () => String(player.loading.value)
      },
    })
    const Owner = defineComponent({
      props: { owner: { type: Object, required: true } },
      setup(props) {
        providePodsPlayerSourcePreviewActivation(props.owner as PodsPlayerSourcePreviewActivation)
        return () => h(Consumer)
      },
    })
    const firstEditor = mount(Owner, { props: { owner: first } })
    const secondEditor = mount(Owner, { props: { owner: second } })
    await nextTick()
    expect(podRequests.map(({ subjectId }) => subjectId)).toEqual([
      'arc-preview-first',
      'arc-preview-second',
    ])

    first.revision.value += 1
    await nextTick()
    expect(podRequests.map(({ subjectId }) => subjectId)).toEqual([
      'arc-preview-first',
      'arc-preview-second',
      'arc-preview-first',
    ])

    firstEditor.unmount()
    first.revision.value += 1
    second.revision.value += 1
    await nextTick()
    expect(podRequests.map(({ subjectId }) => subjectId)).toEqual([
      'arc-preview-first',
      'arc-preview-second',
      'arc-preview-first',
      'arc-preview-second',
    ])
    secondEditor.unmount()
  })

  it('keeps standalone players on the explicit route-only fallback', async () => {
    Object.assign(globalThis, Vue)
    const route = reactive({
      params: { packId: 'base', podId: 'arc-read' },
      query: { draftPack: 'org-pack', sourcePreview: 'route-preview' },
    })
    Object.assign(globalThis, { useRoute: () => route })
    resetSourcePreviewRuntime()
    const Consumer = defineComponent({
      setup() {
        const standalone = usePodPlayer(ref('arc-read'))
        return () => String(standalone.loading.value)
      },
    })
    const player = mount(Consumer)
    await nextTick()
    expect(podRequests[0]).toEqual({ slug: 'arc-read', subjectId: 'route-preview' })
    player.unmount()
  })
})
