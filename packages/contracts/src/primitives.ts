import { z } from 'zod'

/** Strict UTC ISO seconds, with up to millisecond precision and calendar round-trip validation. */
export function isUtcInstant(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value)
  if (!match?.[1]) return false
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return false
  return new Date(time).toISOString() === `${match[1]}.${(match[2] ?? '').padEnd(3, '0')}Z`
}

export function isAvailableIanaZone(value: string): boolean {
  if (value.trim() !== value || (value !== 'UTC' && !value.includes('/'))) return false
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value }).resolvedOptions()
    return true
  } catch {
    return false
  }
}

const exactText = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value)
export const utcInstantSchema = z
  .string()
  .refine(isUtcInstant, 'A valid UTC ISO instant is required.')
export const serviceDateSchema = z.string().refine((value) => isUtcInstant(`${value}T00:00:00Z`))
export const ianaZoneSchema = z
  .string()
  .refine(isAvailableIanaZone, 'A supplied available IANA zone is required.')
export const unknownValueSchema = z.object({ known: z.literal(false), reason: z.string().min(1) })
export type UnknownValue = Readonly<z.infer<typeof unknownValueSchema>>
export type Maybe<T> = { readonly known: true; readonly value: T } | UnknownValue
export const known = <T>(value: T): Maybe<T> => ({ known: true, value })
export const unknown = (reason: string): UnknownValue => ({ known: false, reason })

export function maybeSchema<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('known', [
    z.object({ known: z.literal(true), value }),
    unknownValueSchema,
  ])
}

export const provenanceKindSchema = z.enum([
  'live',
  'cached',
  'stale',
  'demo',
  'unavailable',
  'heuristic',
])
export type ProvenanceKind = z.infer<typeof provenanceKindSchema>
export const provenanceSchema = z
  .object({
    kind: provenanceKindSchema,
    freshness: z.string().optional(),
    fixture: z.literal(true).optional(),
  })
  .readonly()
export type Provenance = z.infer<typeof provenanceSchema>

export const zonedTimeSchema = z
  .object({
    instant: utcInstantSchema,
    zone: ianaZoneSchema,
    airport: exactText,
  })
  .readonly()
export type ZonedTime = z.infer<typeof zonedTimeSchema>

export const segmentIdentityFactsSchema = z
  .object({
    marketingCarrier: maybeSchema(exactText),
    operatingCarrier: maybeSchema(exactText),
    flightNumber: maybeSchema(exactText),
    providerNamespace: maybeSchema(exactText),
    providerCanonicalId: maybeSchema(exactText),
    origin: maybeSchema(exactText),
    destination: maybeSchema(exactText),
    originLocalServiceDate: maybeSchema(serviceDateSchema),
  })
  .readonly()
export type SegmentIdentityFacts = z.infer<typeof segmentIdentityFactsSchema>
export type IdentityField = keyof SegmentIdentityFacts
export type SegmentIdentity =
  | { readonly state: 'complete'; readonly key: string; readonly facts: SegmentIdentityFacts }
  | {
      readonly state: 'incomplete'
      readonly issues: readonly { readonly field: IdentityField; readonly reason: string }[]
      readonly facts: SegmentIdentityFacts
    }
export type IdentityComparison =
  | { readonly state: 'same'; readonly key: string }
  | {
      readonly state: 'conflict'
      readonly differences: readonly IdentityField[]
      readonly left: SegmentIdentity
      readonly right: SegmentIdentity
    }
  | {
      readonly state: 'unknown'
      readonly reason: string
      readonly left: SegmentIdentity
      readonly right: SegmentIdentity
    }

/** All durations use seconds. There are deliberately no default thresholds or permissions. */
export const freshnessPolicySchema = z
  .object({
    freshForSeconds: z.number().nonnegative(),
    halfLifeSeconds: z.number().positive(),
    displayForSeconds: z.number().nonnegative(),
    permitsFreshResponse: z.boolean(),
    permitsCache: z.boolean(),
    permitsStaleDisplay: z.boolean(),
  })
  .refine((value) => value.displayForSeconds >= value.freshForSeconds)
  .readonly()
export type FreshnessPolicy = z.infer<typeof freshnessPolicySchema>
export const sourceObservationSchema = z
  .object({
    sourceId: exactText,
    observedAt: maybeSchema(utcInstantSchema),
    providerGeneratedAt: maybeSchema(utcInstantSchema),
    origin: z.enum(['fixture', 'licensed_provider', 'unverified']),
    delivery: z.enum(['response', 'cache']),
  })
  .readonly()
export type SourceObservation = z.infer<typeof sourceObservationSchema>
export interface FreshnessAssessment {
  readonly state: 'fresh' | 'stale' | 'expired' | 'unknown'
  readonly reason: string
  readonly source: SourceObservation
  readonly evaluationInstant: string
  readonly ageSeconds: Maybe<number>
  readonly weight: Maybe<number>
  readonly provenance: Provenance
}

export const timeEvidenceSchema = z
  .object({
    airport: exactText,
    instant: maybeSchema(utcInstantSchema),
    zone: maybeSchema(ianaZoneSchema),
  })
  .readonly()
export type TimeEvidence = z.infer<typeof timeEvidenceSchema>
export interface TimeRepresentation extends TimeEvidence {
  readonly local: Maybe<{
    readonly date: string
    readonly clock: string
    readonly zoneName: string
  }>
  readonly displayTime: Maybe<ZonedTime>
}
export interface ItineraryTimeRepresentation {
  readonly from: TimeRepresentation
  readonly to: TimeRepresentation
  readonly elapsedMinutes: Maybe<number>
  readonly crossesLocalDate: Maybe<boolean>
}
