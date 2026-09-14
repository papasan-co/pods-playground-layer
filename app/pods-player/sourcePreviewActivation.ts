import type { InjectionKey, Ref } from 'vue'
import { inject, provide } from 'vue'

export type PodsPlayerSourcePreviewActivation = {
  id: Ref<string>
  podSlug: Ref<string>
  draftPackId: Ref<string>
  revision: Ref<number>
}

const sourcePreviewActivationKey: InjectionKey<PodsPlayerSourcePreviewActivation> = Symbol(
  'pods-player-source-preview-activation',
)

export function providePodsPlayerSourcePreviewActivation(
  activation: PodsPlayerSourcePreviewActivation,
): PodsPlayerSourcePreviewActivation {
  provide(sourcePreviewActivationKey, activation)

  return activation
}

export function injectPodsPlayerSourcePreviewActivation(): PodsPlayerSourcePreviewActivation | null {
  return inject(sourcePreviewActivationKey, null)
}

export function sourcePreviewIdForSubject(
  activation: PodsPlayerSourcePreviewActivation | null,
  podSlug: string | null | undefined,
  draftPackId: string | null | undefined,
): string {
  if (
    !activation?.id.value ||
    !podSlug ||
    activation.podSlug.value !== podSlug ||
    activation.draftPackId.value !== draftPackId
  ) {
    return ''
  }

  return activation.id.value
}
