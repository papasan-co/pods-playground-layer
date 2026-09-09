import type { PodDetails, PodsPlayerRuntime } from '../../../app/pods-player/types'

export const podRequests: Array<{ slug: string; subjectId: string }> = []
export const pendingPods: Array<(pod: PodDetails | null) => void> = []

export function resetSourcePreviewRuntime(): void {
  podRequests.length = 0
  pendingPods.length = 0
}

export function usePodsPlayerRuntime(): PodsPlayerRuntime {
  return {
    supportedModes: ['vue', 'sfc'],
    listPods: async () => [],
    getPod: (slug, options) => {
      podRequests.push({ slug, subjectId: options?.session?.identity.subjectId || '' })
      return new Promise((resolve) => pendingPods.push(resolve))
    },
  }
}
