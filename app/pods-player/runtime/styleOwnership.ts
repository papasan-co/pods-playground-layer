import { canonicalContentRevision } from './isolation'

export const POD_STYLE_OWNERSHIP_CONTRACT = 'PodStyleOwnership.v1' as const

export const POD_STYLE_TARGET_PROFILES = ['story', 'website', 'social'] as const
export type PodStyleTargetProfile = (typeof POD_STYLE_TARGET_PROFILES)[number]
export type PodStyleTargetProfileState = 'populated' | 'declared_empty'

export const POD_COLOR_ROLES = [
  'surface',
  'on_surface',
  'surface_raised',
  'on_surface_raised',
  'border',
  'accent',
  'on_accent',
  'action',
  'on_action',
  'data_series',
] as const
export type PodColorRole = (typeof POD_COLOR_ROLES)[number]
export type PodBrandRole = PodColorRole | `x-${string}`

/** Generated compatibility mirror of the Story registry; read-only at runtime. */
export const POD_COLOR_ROLE_ALIASES = {
  page: 'surface',
  card_text: 'on_surface',
  cta_bg: 'action',
  cta_text: 'on_action',
  chart_series: 'data_series',
  'x-card-surface': 'surface_raised',
  'x-card-text': 'on_surface_raised',
  'x-card-border': 'border',
  'x-icon-pill': 'accent',
} as const satisfies Readonly<Record<string, PodColorRole>>

export function canonicalPodBrandRoleName(name: string): string {
  return POD_COLOR_ROLE_ALIASES[name as keyof typeof POD_COLOR_ROLE_ALIASES] ?? name
}

export type PodStyleOwner =
  | { readonly category: 'system'; readonly systemKey: string }
  | { readonly category: 'source'; readonly sourcePath: string }
  | { readonly category: 'brand_role'; readonly role: PodBrandRole }
  | { readonly category: 'field'; readonly fieldKey: string }
  | {
      readonly category: 'adaptation'
      readonly adaptationId: string
      readonly reason: string
      readonly gateReference: string
      readonly inputOwner: Exclude<PodStyleOwner, { category: 'adaptation' }>
      readonly beforeRevision: string
      readonly afterRevision: string
    }

export interface PodStyleSourceDefaultEvidence {
  readonly value: string
  readonly evidenceRevision: string
}

export interface PodStyleOwnershipEntryInput {
  readonly target_profile: PodStyleTargetProfile
  readonly designKey: string
  readonly property: string
  readonly cascadePoint: string
  readonly sourceDefault: PodStyleSourceDefaultEvidence
  readonly owner: PodStyleOwner
}

export interface PodStyleOwnershipInput {
  readonly contract: typeof POD_STYLE_OWNERSHIP_CONTRACT
  readonly artifactRevision: string
  readonly contractRevision: string
  readonly profileDeclarations: Readonly<Record<PodStyleTargetProfile, PodStyleTargetProfileState>>
  readonly entries: readonly PodStyleOwnershipEntryInput[]
}

export interface PodStyleOwnershipRuntimeSnapshot {
  readonly contract: typeof POD_STYLE_OWNERSHIP_CONTRACT
  readonly ownershipRevision: string
  readonly profileStates: Readonly<Record<PodStyleTargetProfile, PodStyleTargetProfileState>>
  readonly conflictCount: number
  readonly influenceRevision: string
  readonly conflictRevision: string
  readonly adaptationRevision: string
  readonly adaptationIds: readonly string[]
}

export interface PodStyleOwnershipManifest extends PodStyleOwnershipInput {
  readonly entries: readonly PodStyleOwnershipEntryInput[]
  readonly ownershipRevision: string
  readonly runtimeSnapshot: PodStyleOwnershipRuntimeSnapshot
}

export type PodStyleOwnershipFailureCode =
  | 'invalid-style-ownership'
  | 'unsupported-style-ownership'
  | 'unsupported-style-ownership-value'
  | 'profile-not-populated'
  | 'duplicate-style-owner'
  | 'incomplete-adaptation'
  | 'unowned-style-property'
  | 'source-default-mismatch'

/** Privacy-safe failure: paths and codes are exposed, customer/style values are not. */
export class PodStyleOwnershipFailure extends Error {
  readonly code: PodStyleOwnershipFailureCode
  readonly fields: string[]

  constructor(code: PodStyleOwnershipFailureCode, message: string, fields: string[] = []) {
    super(message)
    this.name = 'PodStyleOwnershipFailure'
    this.code = code
    this.fields = [...fields]
  }
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/
const TARGET_PROFILE_SET = new Set<string>(POD_STYLE_TARGET_PROFILES)
const COLOR_ROLE_SET = new Set<string>(POD_COLOR_ROLES)

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedKeys = new Set(allowed)
  const unknown = Object.keys(value).filter((key) => !allowedKeys.has(key))
  if (unknown.length > 0) {
    throw new PodStyleOwnershipFailure(
      'invalid-style-ownership',
      `Style ownership contains unsupported fields at ${path}.`,
      unknown.map((key) => `${path}.${key}`),
    )
  }
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PodStyleOwnershipFailure(
      'invalid-style-ownership',
      `Style ownership requires a non-empty string at ${path}.`,
      [path],
    )
  }
  return value.trim()
}

function requireRevision(value: unknown, path: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new PodStyleOwnershipFailure(
      'invalid-style-ownership',
      `Style ownership requires a SHA-256 revision at ${path}.`,
      [path],
    )
  }
  return value
}

function normalizeBaseOwner(
  value: unknown,
  path: string,
): Exclude<PodStyleOwner, { category: 'adaptation' }> {
  if (!isPlainRecord(value)) {
    throw new PodStyleOwnershipFailure(
      'invalid-style-ownership',
      `Style owner at ${path} is invalid.`,
      [path],
    )
  }
  const category = value.category
  if (category === 'system') {
    assertExactKeys(value, ['category', 'systemKey'], path)
    return {
      category,
      systemKey: requireNonEmptyString(value.systemKey, `${path}.systemKey`),
    }
  }
  if (category === 'source') {
    assertExactKeys(value, ['category', 'sourcePath'], path)
    return {
      category,
      sourcePath: requireNonEmptyString(value.sourcePath, `${path}.sourcePath`),
    }
  }
  if (category === 'brand_role') {
    assertExactKeys(value, ['category', 'role'], path)
    if (
      typeof value.role !== 'string' ||
      (!COLOR_ROLE_SET.has(value.role) && !/^x-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.role))
    ) {
      throw new PodStyleOwnershipFailure(
        'unsupported-style-ownership-value',
        `Style ownership role at ${path}.role is unsupported.`,
        [`${path}.role`],
      )
    }
    return { category, role: value.role as PodBrandRole }
  }
  if (category === 'field') {
    assertExactKeys(value, ['category', 'fieldKey'], path)
    return {
      category,
      fieldKey: requireNonEmptyString(value.fieldKey, `${path}.fieldKey`),
    }
  }
  throw new PodStyleOwnershipFailure(
    'unsupported-style-ownership-value',
    `Style ownership owner category at ${path}.category is unsupported.`,
    [`${path}.category`],
  )
}

function normalizeOwner(value: unknown, path: string): PodStyleOwner {
  if (!isPlainRecord(value) || value.category !== 'adaptation')
    return normalizeBaseOwner(value, path)

  assertExactKeys(
    value,
    [
      'category',
      'adaptationId',
      'reason',
      'gateReference',
      'inputOwner',
      'beforeRevision',
      'afterRevision',
    ],
    path,
  )
  const required = ['adaptationId', 'reason', 'gateReference'] as const
  const missing = required.filter(
    (field) => typeof value[field] !== 'string' || value[field].trim() === '',
  )
  if (missing.length > 0) {
    throw new PodStyleOwnershipFailure(
      'incomplete-adaptation',
      `Adaptation ownership at ${path} is incomplete.`,
      missing.map((field) => `${path}.${field}`),
    )
  }
  return {
    category: 'adaptation',
    adaptationId: (value.adaptationId as string).trim(),
    reason: (value.reason as string).trim(),
    gateReference: (value.gateReference as string).trim(),
    inputOwner: normalizeBaseOwner(value.inputOwner, `${path}.inputOwner`),
    beforeRevision: requireRevision(value.beforeRevision, `${path}.beforeRevision`),
    afterRevision: requireRevision(value.afterRevision, `${path}.afterRevision`),
  }
}

function normalizeEntry(value: unknown, index: number): PodStyleOwnershipEntryInput {
  const path = `entries[${index}]`
  if (!isPlainRecord(value)) {
    throw new PodStyleOwnershipFailure(
      'invalid-style-ownership',
      `Style entry at ${path} is invalid.`,
      [path],
    )
  }
  assertExactKeys(
    value,
    ['target_profile', 'designKey', 'property', 'cascadePoint', 'sourceDefault', 'owner'],
    path,
  )
  if (typeof value.target_profile !== 'string' || !TARGET_PROFILE_SET.has(value.target_profile)) {
    throw new PodStyleOwnershipFailure(
      'unsupported-style-ownership-value',
      `Style target profile at ${path}.target_profile is unsupported.`,
      [`${path}.target_profile`],
    )
  }
  if (!isPlainRecord(value.sourceDefault)) {
    throw new PodStyleOwnershipFailure(
      'invalid-style-ownership',
      `Source-default evidence at ${path}.sourceDefault is invalid.`,
      [`${path}.sourceDefault`],
    )
  }
  assertExactKeys(value.sourceDefault, ['value', 'evidenceRevision'], `${path}.sourceDefault`)
  return {
    target_profile: value.target_profile as PodStyleTargetProfile,
    designKey: requireNonEmptyString(value.designKey, `${path}.designKey`),
    property: requireNonEmptyString(value.property, `${path}.property`).toLowerCase(),
    cascadePoint: requireNonEmptyString(value.cascadePoint, `${path}.cascadePoint`),
    sourceDefault: {
      value: requireNonEmptyString(value.sourceDefault.value, `${path}.sourceDefault.value`),
      evidenceRevision: requireRevision(
        value.sourceDefault.evidenceRevision,
        `${path}.sourceDefault.evidenceRevision`,
      ),
    },
    owner: normalizeOwner(value.owner, `${path}.owner`),
  }
}

function entryTuple(entry: PodStyleOwnershipEntryInput): string {
  return [entry.target_profile, entry.designKey, entry.property, entry.cascadePoint].join('\u0000')
}

function compareEntries(
  left: PodStyleOwnershipEntryInput,
  right: PodStyleOwnershipEntryInput,
): number {
  return entryTuple(left).localeCompare(entryTuple(right))
}

function normalizeProfiles(
  value: unknown,
): Record<PodStyleTargetProfile, PodStyleTargetProfileState> {
  if (!isPlainRecord(value)) {
    throw new PodStyleOwnershipFailure(
      'invalid-style-ownership',
      'Style ownership profile declarations are invalid.',
      ['profileDeclarations'],
    )
  }
  assertExactKeys(value, POD_STYLE_TARGET_PROFILES, 'profileDeclarations')
  const profileStates = {} as Record<PodStyleTargetProfile, PodStyleTargetProfileState>
  for (const profile of POD_STYLE_TARGET_PROFILES) {
    const state = value[profile]
    if (state !== 'populated' && state !== 'declared_empty') {
      throw new PodStyleOwnershipFailure(
        'invalid-style-ownership',
        `Style ownership profile declaration for ${profile} is invalid.`,
        [`profileDeclarations.${profile}`],
      )
    }
    profileStates[profile] = state
  }
  if (
    profileStates.story !== 'populated' ||
    profileStates.website !== 'declared_empty' ||
    profileStates.social !== 'declared_empty'
  ) {
    throw new PodStyleOwnershipFailure(
      'unsupported-style-ownership-value',
      'PodStyleOwnership.v1 requires Story populated and website/social declared empty.',
      ['profileDeclarations'],
    )
  }
  return profileStates
}

export async function createPodStyleOwnership(
  input: PodStyleOwnershipInput,
): Promise<PodStyleOwnershipManifest> {
  if (!isPlainRecord(input)) {
    throw new PodStyleOwnershipFailure(
      'invalid-style-ownership',
      'Style ownership input must be an object.',
      ['$'],
    )
  }
  assertExactKeys(
    input,
    ['contract', 'artifactRevision', 'contractRevision', 'profileDeclarations', 'entries'],
    '$',
  )
  if (input.contract !== POD_STYLE_OWNERSHIP_CONTRACT) {
    throw new PodStyleOwnershipFailure(
      'unsupported-style-ownership',
      'Unsupported style ownership contract.',
      ['contract'],
    )
  }

  const artifactRevision = requireRevision(input.artifactRevision, 'artifactRevision')
  const contractRevision = requireRevision(input.contractRevision, 'contractRevision')
  const profileDeclarations = normalizeProfiles(input.profileDeclarations)
  if (!Array.isArray(input.entries)) {
    throw new PodStyleOwnershipFailure(
      'invalid-style-ownership',
      'Style ownership entries must be an array.',
      ['entries'],
    )
  }
  const indexedEntries = input.entries.map((entryValue, index) => ({
    index,
    entry: normalizeEntry(entryValue, index),
  }))
  for (const { entry, index } of indexedEntries) {
    if (profileDeclarations[entry.target_profile] !== 'populated') {
      throw new PodStyleOwnershipFailure(
        'profile-not-populated',
        'Style ownership cannot borrow values from a declared-empty target profile.',
        [`entries[${index}].target_profile`],
      )
    }
  }

  const firstIndexByTuple = new Map<string, number>()
  for (const { entry, index } of indexedEntries) {
    const tuple = entryTuple(entry)
    const previous = firstIndexByTuple.get(tuple)
    if (previous !== undefined) {
      throw new PodStyleOwnershipFailure(
        'duplicate-style-owner',
        'More than one owner claims a governed style tuple.',
        [`entries[${previous}]`, `entries[${index}]`],
      )
    }
    firstIndexByTuple.set(tuple, index)
  }

  const entries = indexedEntries.map(({ entry }) => entry).sort(compareEntries)
  const revisionInput = {
    contract: POD_STYLE_OWNERSHIP_CONTRACT,
    artifactRevision,
    contractRevision,
    profileDeclarations,
    entries,
  }
  const ownershipRevision = await canonicalContentRevision(revisionInput)
  const adaptationIds = entries
    .flatMap((entry) => (entry.owner.category === 'adaptation' ? [entry.owner.adaptationId] : []))
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort()
  const [influenceRevision, conflictRevision, adaptationRevision] = await Promise.all([
    canonicalContentRevision([]),
    canonicalContentRevision([]),
    canonicalContentRevision(adaptationIds),
  ])

  return {
    ...revisionInput,
    ownershipRevision,
    runtimeSnapshot: {
      contract: POD_STYLE_OWNERSHIP_CONTRACT,
      ownershipRevision,
      profileStates: profileDeclarations,
      conflictCount: 0,
      influenceRevision,
      conflictRevision,
      adaptationRevision,
      adaptationIds,
    },
  }
}

function ownerIdentity(owner: PodStyleOwner): string {
  if (owner.category === 'system') return `system:${owner.systemKey}`
  if (owner.category === 'source') return `source:${owner.sourcePath}`
  if (owner.category === 'brand_role') return `brand_role:${owner.role}`
  if (owner.category === 'field') return `field:${owner.fieldKey}`
  return `adaptation:${owner.adaptationId}`
}

export interface PodStyleWriterClaim {
  readonly targetProfile: PodStyleTargetProfile
  readonly designKey: string
  readonly property: string
  readonly cascadePoint: string
  readonly writerId: string
  readonly claimedOwner: PodStyleOwner
  readonly specificity?: readonly number[]
  readonly sourceOrder?: number
}

export interface PodStyleWriterDiagnostic {
  readonly code: 'unowned-writer'
  readonly writerId: string
  readonly tuple: string
  readonly activeOwner: string | null
}

export function diagnoseOwnershipWriters(
  manifest: PodStyleOwnershipManifest,
  writers: readonly PodStyleWriterClaim[],
): PodStyleWriterDiagnostic[] {
  const entries = new Map(manifest.entries.map((entry) => [entryTuple(entry), entry]))
  return writers.flatMap((writer) => {
    const tuple = entryTuple({
      target_profile: writer.targetProfile,
      designKey: writer.designKey,
      property: writer.property,
      cascadePoint: writer.cascadePoint,
      sourceDefault: {
        value: 'diagnostic-only',
        evidenceRevision: manifest.ownershipRevision,
      },
      owner: writer.claimedOwner,
    })
    const active = entries.get(tuple)
    if (active && ownerIdentity(active.owner) === ownerIdentity(writer.claimedOwner)) return []
    return [
      {
        code: 'unowned-writer',
        writerId: writer.writerId,
        tuple,
        activeOwner: active ? ownerIdentity(active.owner) : null,
      },
    ]
  })
}

export interface PodStyleOwnershipTransfer {
  readonly targetProfile: PodStyleTargetProfile
  readonly designKey: string
  readonly property: string
  readonly cascadePoint: string
  readonly owner: PodStyleOwner
  readonly copiedSourceDefault: string
}

export async function transferOwnership(
  manifest: PodStyleOwnershipManifest,
  transfer: PodStyleOwnershipTransfer,
): Promise<PodStyleOwnershipManifest> {
  const tuple = entryTuple({
    target_profile: transfer.targetProfile,
    designKey: transfer.designKey,
    property: transfer.property,
    cascadePoint: transfer.cascadePoint,
    owner: transfer.owner,
    sourceDefault: {
      value: transfer.copiedSourceDefault,
      evidenceRevision: manifest.ownershipRevision,
    },
  })
  const index = manifest.entries.findIndex((entry) => entryTuple(entry) === tuple)
  if (index < 0) {
    throw new PodStyleOwnershipFailure(
      'unowned-style-property',
      'Ownership transfer requires one existing governed tuple.',
      ['transfer'],
    )
  }
  const existing = manifest.entries[index]!
  if (existing.sourceDefault.value !== transfer.copiedSourceDefault) {
    throw new PodStyleOwnershipFailure(
      'source-default-mismatch',
      'Ownership transfer must copy the exact accepted source default.',
      ['transfer.copiedSourceDefault'],
    )
  }
  const entries = manifest.entries.map((entry, entryIndex) =>
    entryIndex === index ? { ...entry, owner: transfer.owner } : entry,
  )
  return createPodStyleOwnership({
    contract: POD_STYLE_OWNERSHIP_CONTRACT,
    artifactRevision: manifest.artifactRevision,
    contractRevision: manifest.contractRevision,
    profileDeclarations: manifest.profileDeclarations,
    entries,
  })
}

export interface PodStyleResolutionCandidates {
  readonly system?: string
  readonly source?: string
  readonly brandRole?: string
  readonly field?: string
  readonly previewOverride?: {
    readonly transactionId: string
    readonly value: string
  }
  readonly adaptation?: string
}

export interface PodStylePreviewScope {
  readonly transactionId: string
}

export type PodStyleResolutionStage =
  | 'system'
  | 'source'
  | 'brand_role'
  | 'field'
  | 'preview_override'
  | 'adaptation'

export function resolveOwnershipValue(
  entry: PodStyleOwnershipEntryInput,
  candidates: PodStyleResolutionCandidates,
  previewScope: PodStylePreviewScope | null,
): { readonly value: string; readonly stage: PodStyleResolutionStage } {
  if (entry.owner.category === 'adaptation') {
    if (typeof candidates.adaptation === 'string') {
      return { value: candidates.adaptation, stage: 'adaptation' }
    }
    throw new PodStyleOwnershipFailure(
      'unowned-style-property',
      'The authorized adaptation did not produce a value.',
      ['candidates.adaptation'],
    )
  }

  if (
    previewScope &&
    candidates.previewOverride &&
    candidates.previewOverride.transactionId === previewScope.transactionId
  ) {
    return {
      value: candidates.previewOverride.value,
      stage: 'preview_override',
    }
  }

  const byOwner = {
    system: { value: candidates.system, stage: 'system' as const },
    source: { value: candidates.source, stage: 'source' as const },
    brand_role: { value: candidates.brandRole, stage: 'brand_role' as const },
    field: { value: candidates.field, stage: 'field' as const },
  }
  const resolved = byOwner[entry.owner.category]
  if (typeof resolved.value !== 'string') {
    throw new PodStyleOwnershipFailure(
      'unowned-style-property',
      'The manifest-authorized style owner did not produce a value.',
      [`candidates.${resolved.stage}`],
    )
  }
  return resolved as {
    readonly value: string
    readonly stage: PodStyleResolutionStage
  }
}

export type PodStyleInfluenceViolationCode =
  | 'no_effect'
  | 'wrong_target'
  | 'collateral_change'
  | 'failed_restoration'
  | 'wrong_receptor'
  | 'wrong_document'
  | 'unauthorized_important'

export interface PodStyleInfluenceProbeInput {
  readonly targetProfile: PodStyleTargetProfile
  readonly colorScheme: 'light' | 'dark'
  readonly receptor: {
    readonly designKey: string
    readonly property: string
    readonly cascadePoint: string
    readonly ownerDocumentId: string
  }
  readonly observed: {
    readonly ownerDocumentId: string
    readonly designKey: string
    readonly property: string
    readonly cascadePoint: string
    readonly before: string
    readonly sentinel: string
    readonly restored: string
  }
  readonly changed: readonly {
    readonly designKey: string
    readonly property: string
  }[]
  readonly protectedChanges: readonly {
    readonly designKey: string
    readonly property: string
  }[]
  readonly competingWriters: readonly {
    readonly writerId: string
    readonly important: boolean
    readonly authorized: boolean
  }[]
}

export interface PodStyleInfluenceViolation {
  readonly code: PodStyleInfluenceViolationCode
  readonly field: string
}

export interface PodStyleInfluenceResult {
  readonly reachable: boolean
  readonly targetProfile: PodStyleTargetProfile
  readonly colorScheme: 'light' | 'dark'
  readonly violations: readonly PodStyleInfluenceViolation[]
}

/**
 * Classifies browser-collected influence facts without inferring reachability
 * from a declared custom property. Values remain in the browser evidence; the
 * result exposes only revision-safe classifications and paths.
 */
export function evaluateStyleInfluenceProbe(
  input: PodStyleInfluenceProbeInput,
): PodStyleInfluenceResult {
  const violations: PodStyleInfluenceViolation[] = []
  const intendedChanged = input.changed.some(
    (change) =>
      change.designKey === input.receptor.designKey &&
      change.property.toLowerCase() === input.receptor.property.toLowerCase(),
  )
  const unintendedChanged = input.changed.some(
    (change) =>
      change.designKey !== input.receptor.designKey ||
      change.property.toLowerCase() !== input.receptor.property.toLowerCase(),
  )

  if (input.observed.ownerDocumentId !== input.receptor.ownerDocumentId) {
    violations.push({
      code: 'wrong_document',
      field: 'observed.ownerDocumentId',
    })
  }
  if (
    input.observed.designKey !== input.receptor.designKey ||
    input.observed.property.toLowerCase() !== input.receptor.property.toLowerCase() ||
    input.observed.cascadePoint !== input.receptor.cascadePoint
  ) {
    violations.push({ code: 'wrong_receptor', field: 'observed' })
  }
  if (input.observed.sentinel === input.observed.before || !intendedChanged) {
    violations.push({
      code: unintendedChanged ? 'wrong_target' : 'no_effect',
      field: 'observed.sentinel',
    })
  }
  if (input.protectedChanges.length > 0 || (intendedChanged && unintendedChanged)) {
    violations.push({ code: 'collateral_change', field: 'protectedChanges' })
  }
  if (input.observed.restored !== input.observed.before) {
    violations.push({ code: 'failed_restoration', field: 'observed.restored' })
  }
  if (input.competingWriters.some((writer) => writer.important && !writer.authorized)) {
    violations.push({
      code: 'unauthorized_important',
      field: 'competingWriters',
    })
  }

  return {
    reachable: violations.length === 0,
    targetProfile: input.targetProfile,
    colorScheme: input.colorScheme,
    violations,
  }
}

export interface ResolvedStyleProjectionInput {
  readonly targetProfile: PodStyleTargetProfile
  readonly brandRoles: Readonly<Record<string, unknown>>
  readonly fields: Readonly<Record<string, unknown>>
  readonly system?: Readonly<Record<string, unknown>>
  readonly adaptations?: Readonly<Record<string, unknown>>
}

export interface HostStyleProjectionInput {
  readonly targetProfile: PodStyleTargetProfile
  readonly manifest: unknown
  readonly compiledContract: unknown
  readonly theme: unknown
  readonly fields: Readonly<Record<string, unknown>>
  readonly system?: Readonly<Record<string, unknown>>
  readonly adaptations?: Readonly<Record<string, unknown>>
}

export interface ResolvedStyleProjection {
  readonly targetProfile: PodStyleTargetProfile
  readonly ownershipRevision: string
  readonly themeRevision: string
  readonly fieldRevision: string
  readonly effectiveValues: Readonly<Record<string, unknown>>
}

export interface PodStyleProjectionCommitResult {
  readonly committed: boolean
  readonly current: ResolvedStyleProjection | null
  readonly failure: PodStyleOwnershipFailure | null
}

export interface PodStyleProjectionCommitGate {
  resolve(
    manifest: PodStyleOwnershipManifest,
    input: ResolvedStyleProjectionInput,
  ): Promise<PodStyleProjectionCommitResult>
  current(): ResolvedStyleProjection | null
}

function projectionValueKey(entry: PodStyleOwnershipEntryInput): string {
  return [entry.designKey, entry.property, entry.cascadePoint].join('\u0000')
}

/**
 * Resolves the one authoritative profile projection before render identity is
 * constructed. Missing active-owner values fail closed instead of allowing a
 * host-specific partial merge to produce a different fingerprint.
 */
export async function createResolvedStyleProjection(
  manifest: PodStyleOwnershipManifest,
  input: ResolvedStyleProjectionInput,
): Promise<ResolvedStyleProjection> {
  if (manifest.profileDeclarations[input.targetProfile] !== 'populated') {
    throw new PodStyleOwnershipFailure(
      'profile-not-populated',
      'The requested style target profile is declared empty.',
      ['targetProfile'],
    )
  }

  const themeValues: Record<string, unknown> = {}
  const fieldValues: Record<string, unknown> = {}
  const effectiveValues: Record<string, unknown> = {}
  for (const entry of manifest.entries.filter(
    (candidate) => candidate.target_profile === input.targetProfile,
  )) {
    const key = projectionValueKey(entry)
    let value: unknown
    let fieldPath = 'sourceDefault.value'
    if (entry.owner.category === 'brand_role') {
      fieldPath = `brandRoles.${entry.owner.role}`
      if (!Object.prototype.hasOwnProperty.call(input.brandRoles, entry.owner.role)) {
        throw new PodStyleOwnershipFailure(
          'unowned-style-property',
          'The authoritative brand role is missing from the resolved profile.',
          [fieldPath],
        )
      }
      value = input.brandRoles[entry.owner.role]
      themeValues[key] = value
    } else if (entry.owner.category === 'field') {
      fieldPath = `fields.${entry.owner.fieldKey}`
      if (!Object.prototype.hasOwnProperty.call(input.fields, entry.owner.fieldKey)) {
        throw new PodStyleOwnershipFailure(
          'unowned-style-property',
          'The authoritative field is missing from the resolved profile.',
          [fieldPath],
        )
      }
      value = input.fields[entry.owner.fieldKey]
      fieldValues[key] = value
    } else if (entry.owner.category === 'system') {
      fieldPath = `system.${entry.owner.systemKey}`
      value = input.system?.[entry.owner.systemKey] ?? entry.sourceDefault.value
      themeValues[key] = value
    } else if (entry.owner.category === 'adaptation') {
      fieldPath = `adaptations.${entry.owner.adaptationId}`
      if (
        !Object.prototype.hasOwnProperty.call(input.adaptations ?? {}, entry.owner.adaptationId)
      ) {
        throw new PodStyleOwnershipFailure(
          'unowned-style-property',
          'The authoritative adaptation is missing from the resolved profile.',
          [fieldPath],
        )
      }
      value = input.adaptations?.[entry.owner.adaptationId]
      themeValues[key] = value
    } else {
      value = entry.sourceDefault.value
      themeValues[key] = value
    }
    if (value === undefined) {
      throw new PodStyleOwnershipFailure(
        'unsupported-style-ownership-value',
        'Resolved style ownership values cannot be undefined.',
        [fieldPath],
      )
    }
    effectiveValues[key] = value
  }

  const [themeRevision, fieldRevision] = await Promise.all([
    canonicalContentRevision({
      ownershipRevision: manifest.ownershipRevision,
      targetProfile: input.targetProfile,
      values: themeValues,
    }),
    canonicalContentRevision({
      ownershipRevision: manifest.ownershipRevision,
      targetProfile: input.targetProfile,
      values: fieldValues,
    }),
  ])
  return {
    targetProfile: input.targetProfile,
    ownershipRevision: manifest.ownershipRevision,
    themeRevision,
    fieldRevision,
    effectiveValues,
  }
}

function nestedValue(value: unknown, path: string): unknown {
  if (!isPlainRecord(value)) return undefined
  if (Object.prototype.hasOwnProperty.call(value, path)) return value[path]
  return path.split('.').reduce<unknown>((current, part) => {
    if (!isPlainRecord(current)) return undefined
    return current[part]
  }, value)
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== '')
}

const HOST_THEME_ROLE_KEYS: Readonly<Record<string, readonly string[]>> = {
  surface: ['surface', 'page', '--au-surface', '--story-visual-bg'],
  on_surface: ['on_surface', 'onSurface', 'pageText', '--au-text', '--story-visual-text'],
  surface_raised: [
    'surface_raised',
    'surfaceRaised',
    'card',
    '--au-surface-raised',
    '--story-card-bg',
  ],
  on_surface_raised: [
    'on_surface_raised',
    'onSurfaceRaised',
    'cardText',
    '--au-on-surface-raised',
  ],
  border: ['border', '--au-border', '--story-card-border'],
  accent: ['accent', '--au-accent', '--story-accent', '--color-primary-500'],
  on_accent: ['on_accent', 'onAccent', '--au-on-accent', '--story-cta-text'],
  action: ['action', 'accent', '--au-action', '--au-accent', '--story-cta-bg'],
  on_action: [
    'on_action',
    'onAction',
    'onAccent',
    '--au-on-action',
    '--au-on-accent',
    '--story-cta-text',
  ],
  data_series: [
    'data_series',
    'dataSeries',
    'accent',
    '--au-data-series',
    '--au-accent',
    '--pods-chart-accent',
  ],
}

function themeSources(theme: unknown): Record<string, unknown>[] {
  if (!isPlainRecord(theme)) return []
  return [theme, theme.cssVars, theme.roles].filter(isPlainRecord)
}

function themeRoleValue(theme: unknown, role: string): unknown {
  const keys = HOST_THEME_ROLE_KEYS[role] ?? [role]
  for (const source of themeSources(theme)) {
    const value = firstDefined(...keys.map((key) => source[key]))
    if (value !== undefined) return value
  }
  return undefined
}

function resolveThemeReference(value: unknown, theme: unknown): unknown {
  if (typeof value !== 'string') return value
  const match = value.trim().match(/^var\(\s*(--[a-zA-Z0-9-_]+)(?:\s*,\s*(.+))?\)$/)
  if (!match) return value
  const variable = match[1]!
  for (const source of themeSources(theme)) {
    const resolved = firstDefined(source[variable])
    if (resolved !== undefined) return resolved
  }
  return match[2]?.trim() || value
}

function canonicalBrandRoleBindings(
  compiledContract: unknown,
): Map<string, Record<string, unknown>> {
  if (!isPlainRecord(compiledContract)) return new Map()
  const raw = isPlainRecord(compiledContract.brand_roles)
    ? compiledContract.brand_roles
    : isPlainRecord(compiledContract.brandRoles)
      ? compiledContract.brandRoles
      : null
  if (!raw) return new Map()
  return new Map(
    Object.entries(raw).flatMap(([name, binding]) =>
      name !== 'unsupported' && isPlainRecord(binding)
        ? [[canonicalPodBrandRoleName(name), binding] as const]
        : [],
    ),
  )
}

/**
 * Recomputes a generated manifest instead of trusting its published revision.
 * Runtime snapshots are evidence mirrors; the governed identity is derived
 * only from the contract input fields.
 */
export async function normalizePodStyleOwnershipManifest(
  value: unknown,
): Promise<PodStyleOwnershipManifest> {
  if (!isPlainRecord(value)) {
    throw new PodStyleOwnershipFailure(
      'invalid-style-ownership',
      'The host style ownership manifest is missing.',
      ['manifest'],
    )
  }
  const normalized = await createPodStyleOwnership({
    contract: value.contract as typeof POD_STYLE_OWNERSHIP_CONTRACT,
    artifactRevision: value.artifactRevision as string,
    contractRevision: value.contractRevision as string,
    profileDeclarations: value.profileDeclarations as Record<
      PodStyleTargetProfile,
      PodStyleTargetProfileState
    >,
    entries: value.entries as PodStyleOwnershipEntryInput[],
  })
  if (value.ownershipRevision !== normalized.ownershipRevision) {
    throw new PodStyleOwnershipFailure(
      'invalid-style-ownership',
      'The published style ownership revision does not match its registry input.',
      ['manifest.ownershipRevision'],
    )
  }
  return normalized
}

/**
 * Builds the shared host projection from the generated role bindings, resolved
 * theme, and effective field props. Both Story Pods and CMS call this exact
 * function before constructing PodRenderIdentity.v1.
 */
export async function createHostResolvedStyleProjection(
  input: HostStyleProjectionInput,
): Promise<ResolvedStyleProjection> {
  const manifest = await normalizePodStyleOwnershipManifest(input.manifest)
  const bindings = canonicalBrandRoleBindings(input.compiledContract)
  const brandRoles: Record<string, unknown> = {}

  for (const entry of manifest.entries) {
    if (entry.target_profile !== input.targetProfile || entry.owner.category !== 'brand_role') {
      continue
    }
    const role = canonicalPodBrandRoleName(entry.owner.role)
    const binding = bindings.get(role)
    const propPath =
      typeof binding?.binds_prop === 'string' && binding.binds_prop.trim()
        ? binding.binds_prop.trim()
        : null
    const editablePath =
      typeof binding?.editable === 'string' && binding.editable.trim()
        ? binding.editable.trim()
        : null
    const fieldValue = firstDefined(
      propPath ? nestedValue(input.fields, propPath) : undefined,
      editablePath ? nestedValue(input.fields, editablePath) : undefined,
    )
    const value = firstDefined(
      resolveThemeReference(fieldValue, input.theme),
      themeRoleValue(input.theme, role),
      resolveThemeReference(binding?.default, input.theme),
      resolveThemeReference(entry.sourceDefault.value, input.theme),
    )
    if (value !== undefined) brandRoles[role] = value
  }

  return createResolvedStyleProjection(manifest, {
    targetProfile: input.targetProfile,
    brandRoles,
    fields: input.fields,
    system: input.system,
    adaptations: input.adaptations,
  })
}

/** Retains the last valid projection when current resolution fails closed. */
export function createPodStyleProjectionCommitGate(
  initial: ResolvedStyleProjection | null = null,
): PodStyleProjectionCommitGate {
  let active = initial
  return {
    async resolve(manifest, input) {
      try {
        active = await createResolvedStyleProjection(manifest, input)
        return { committed: true, current: active, failure: null }
      } catch (error) {
        if (!(error instanceof PodStyleOwnershipFailure)) throw error
        return { committed: false, current: active, failure: error }
      }
    },
    current() {
      return active
    },
  }
}

export interface PodStyleRuntimeEvidenceInput {
  readonly influences: readonly {
    readonly targetProfile: PodStyleTargetProfile
    readonly colorScheme: 'light' | 'dark'
    readonly reachable: boolean
    readonly violationCodes: readonly PodStyleInfluenceViolationCode[]
  }[]
  readonly conflicts: readonly {
    readonly code: string
    readonly tupleRevision: string
  }[]
}

/** Produces revision-only runtime evidence; no style values or customer payloads survive. */
export async function createPodStyleOwnershipRuntimeSnapshot(
  manifest: PodStyleOwnershipManifest,
  evidence: PodStyleRuntimeEvidenceInput,
): Promise<PodStyleOwnershipRuntimeSnapshot> {
  const influences = [...evidence.influences]
    .map((item) => ({
      targetProfile: item.targetProfile,
      colorScheme: item.colorScheme,
      reachable: item.reachable,
      violationCodes: [...item.violationCodes].sort(),
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  const conflicts = [...evidence.conflicts]
    .map((item) => ({ code: item.code, tupleRevision: item.tupleRevision }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  const adaptationIds = manifest.entries
    .flatMap((entry) => (entry.owner.category === 'adaptation' ? [entry.owner.adaptationId] : []))
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort()
  const [influenceRevision, conflictRevision, adaptationRevision] = await Promise.all([
    canonicalContentRevision(influences),
    canonicalContentRevision(conflicts),
    canonicalContentRevision(adaptationIds),
  ])
  return {
    contract: POD_STYLE_OWNERSHIP_CONTRACT,
    ownershipRevision: manifest.ownershipRevision,
    profileStates: manifest.profileDeclarations,
    conflictCount: conflicts.length,
    influenceRevision,
    conflictRevision,
    adaptationRevision,
    adaptationIds,
  }
}
