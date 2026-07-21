export const POD_SWITCH_TIMING_CONTRACT = 'PodSwitchTiming.v1' as const
export const POD_SWITCH_TIMING_EVENT = 'autumn:pod-switch-timing' as const
export const POD_SWITCH_TIMING_MAX_MARKS = 512

export const POD_SWITCH_TIMING_STAGES = [
  'selectionAccepted',
  'metadataReady',
  'artifactRequested',
  'artifactReady',
  'componentRegistered',
  'frameShellReady',
  'mountAccepted',
  'firstStableMeaningfulPaint',
  'fieldsReady',
] as const

export type PodSwitchTimingStage = (typeof POD_SWITCH_TIMING_STAGES)[number]

export type PodSwitchTimingIdentity = Readonly<{
  sessionFingerprint: string
  renderFingerprint: string
  selectionSequence: number
  runtimeBoundaryKey: string
  podSlug: string
}>

export type PodSwitchTimingMark = Readonly<{
  contract: typeof POD_SWITCH_TIMING_CONTRACT
  stage: PodSwitchTimingStage
  owner: string
  atMs: number | null
  epochMs: number | null
  unavailableReason: string | null
  identity: PodSwitchTimingIdentity
}>

export type CreatePodSwitchTimingMarkInput = {
  stage: PodSwitchTimingStage
  owner: string
  identity: PodSwitchTimingIdentity
  atMs: number | null
  timeOriginMs: number
  unavailableReason?: string | null
}

export type PodSwitchTimingWindow = Window & {
  __POD_SWITCH_TIMINGS__?: PodSwitchTimingMark[]
  __POD_SWITCH_TIMING_DISABLED__?: boolean
}

export function createPodSwitchTimingMark(
  input: CreatePodSwitchTimingMarkInput,
): PodSwitchTimingMark {
  if (!POD_SWITCH_TIMING_STAGES.includes(input.stage)) {
    throw new Error(`Unknown pod switch timing stage: ${String(input.stage)}`)
  }
  if (!input.owner.trim()) throw new Error('Pod switch timing owner is required.')
  assertIdentity(input.identity)
  if (!Number.isFinite(input.timeOriginMs) || input.timeOriginMs < 0) {
    throw new Error('Pod switch timing time origin must be a non-negative number.')
  }
  if (input.atMs === null) {
    if (!input.unavailableReason?.trim()) {
      throw new Error(`Unavailable ${input.stage} timing requires a reason.`)
    }
  } else if (!Number.isFinite(input.atMs) || input.atMs < 0) {
    throw new Error(`${input.stage} timing must be a non-negative number.`)
  }

  return Object.freeze({
    contract: POD_SWITCH_TIMING_CONTRACT,
    stage: input.stage,
    owner: input.owner.trim(),
    atMs: input.atMs,
    epochMs: input.atMs === null ? null : input.timeOriginMs + input.atMs,
    unavailableReason: input.atMs === null ? input.unavailableReason!.trim() : null,
    identity: Object.freeze({ ...input.identity }),
  })
}

export function appendPodSwitchTimingMark(
  existing: readonly PodSwitchTimingMark[],
  mark: PodSwitchTimingMark,
  maxMarks = POD_SWITCH_TIMING_MAX_MARKS,
): PodSwitchTimingMark[] {
  if (!Number.isInteger(maxMarks) || maxMarks < 1) {
    throw new Error('Pod switch timing ring size must be a positive integer.')
  }
  return [...existing, mark].slice(-maxMarks)
}

export function podSwitchTimingTransactionKey(
  identity: PodSwitchTimingIdentity,
  stage: PodSwitchTimingStage,
): string {
  assertIdentity(identity)
  if (!POD_SWITCH_TIMING_STAGES.includes(stage)) {
    throw new Error(`Unknown pod switch timing stage: ${String(stage)}`)
  }
  return [
    identity.sessionFingerprint,
    identity.renderFingerprint,
    identity.selectionSequence,
    stage,
  ].join(':')
}

/**
 * Append one exact transaction stage to the bounded diagnostic ring.
 * Repeated callbacks for the same stage return the retained mark without
 * dispatching another event.
 */
export function recordPodSwitchTimingMark(
  target: PodSwitchTimingWindow,
  input: Omit<CreatePodSwitchTimingMarkInput, 'atMs' | 'timeOriginMs'> & {
    atMs?: number | null
  },
): PodSwitchTimingMark {
  const existing = (target.__POD_SWITCH_TIMINGS__ ?? []).find(candidate =>
    podSwitchTimingTransactionKey(candidate.identity, candidate.stage) ===
    podSwitchTimingTransactionKey(input.identity, input.stage))
  if (existing) return existing

  const mark = createPodSwitchTimingMark({
    ...input,
    atMs: input.atMs === undefined ? target.performance.now() : input.atMs,
    timeOriginMs: target.performance.timeOrigin,
  })
  target.__POD_SWITCH_TIMINGS__ = appendPodSwitchTimingMark(
    target.__POD_SWITCH_TIMINGS__ ?? [],
    mark,
  )
  target.dispatchEvent(new CustomEvent(POD_SWITCH_TIMING_EVENT, { detail: mark }))
  return mark
}

function assertIdentity(identity: PodSwitchTimingIdentity): void {
  for (const key of ['sessionFingerprint', 'renderFingerprint', 'runtimeBoundaryKey', 'podSlug'] as const) {
    if (!identity[key]?.trim()) throw new Error(`Pod switch timing ${key} is required.`)
  }
  if (!Number.isInteger(identity.selectionSequence) || identity.selectionSequence < 0) {
    throw new Error('Pod switch timing selectionSequence must be a non-negative integer.')
  }
}
