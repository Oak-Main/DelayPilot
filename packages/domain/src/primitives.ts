/** Pure functions over explicit inputs; no clock reads, network, storage, or provider calls. */
import { isUtcInstant, isAvailableIanaZone, known, unknown } from '@delaypilot/contracts'
export { isUtcInstant } from '@delaypilot/contracts'
import { clockTime, localIsoDate, minutesBetween, zoneName } from './time.ts'
import type {
  FreshnessAssessment,
  FreshnessPolicy,
  IdentityComparison,
  IdentityField,
  ItineraryTimeRepresentation,
  Maybe,
  Provenance,
  SegmentIdentity,
  SegmentIdentityFacts,
  SourceObservation,
  TimeEvidence,
  TimeRepresentation,
} from '@delaypilot/contracts'

const identityFields = Object.freeze([
  'marketingCarrier',
  'operatingCarrier',
  'flightNumber',
  'providerNamespace',
  'providerCanonicalId',
  'origin',
  'destination',
  'originLocalServiceDate',
] as const)

/** Provider-scoped exact-fact key. No normalization, schedule time or codeshare merging. */
export function segmentIdentity(facts: SegmentIdentityFacts): SegmentIdentity {
  const issues: { field: IdentityField; reason: string }[] = []
  const values: string[] = []
  for (const field of identityFields) {
    const fact = facts[field]
    if (!fact.known) {
      issues.push({ field, reason: fact.reason })
    } else if (fact.value.length === 0 || fact.value.trim() !== fact.value) {
      issues.push({
        field,
        reason: 'A nonempty exact value without surrounding whitespace is required.',
      })
    } else if (field === 'originLocalServiceDate' && !isUtcInstant(`${fact.value}T00:00:00Z`)) {
      issues.push({ field, reason: 'A valid origin-local YYYY-MM-DD calendar date is required.' })
    } else {
      values.push(fact.value)
    }
  }
  if (issues.length > 0) return { state: 'incomplete', issues, facts }
  return { state: 'complete', key: `segment-identity:v1:${JSON.stringify(values)}`, facts }
}

/** No winner is chosen when any supplied identity fact disagrees. */
export function compareSegmentIdentities(
  leftFacts: SegmentIdentityFacts,
  rightFacts: SegmentIdentityFacts,
): IdentityComparison {
  const left = segmentIdentity(leftFacts)
  const right = segmentIdentity(rightFacts)
  const differences = identityFields.filter((field) => {
    const a = leftFacts[field]
    const b = rightFacts[field]
    return a.known && b.known && a.value !== b.value
  })
  if (differences.length > 0) return { state: 'conflict', differences, left, right }
  if (left.state === 'complete' && right.state === 'complete')
    return { state: 'same', key: left.key }
  return {
    state: 'unknown',
    reason: 'Identity evidence is incomplete; matching known fields do not establish sameness.',
    left,
    right,
  }
}

function baseProvenance(source: SourceObservation): Provenance {
  return source.origin === 'fixture' ? { kind: 'demo', fixture: true } : { kind: 'unavailable' }
}

/** Temporal age and licensed display provenance are deliberately separate output fields. */
export function classifyFreshness(
  source: SourceObservation,
  evaluationInstant: string,
  policy: Maybe<FreshnessPolicy>,
): FreshnessAssessment {
  const unresolved = (
    reason: string,
    ageSeconds: Maybe<number> = unknown(reason),
  ): FreshnessAssessment => ({
    state: 'unknown',
    reason,
    source,
    evaluationInstant,
    ageSeconds,
    weight: unknown(reason),
    provenance: baseProvenance(source),
  })
  if (!isUtcInstant(evaluationInstant))
    return unresolved('Evaluation instant is not a valid UTC instant.')
  if (!source.observedAt.known)
    return unresolved(`Source observation time is unknown: ${source.observedAt.reason}`)
  if (!isUtcInstant(source.observedAt.value))
    return unresolved('Source observation time is not a valid UTC instant.')
  const age = (Date.parse(evaluationInstant) - Date.parse(source.observedAt.value)) / 1000
  if (age < 0)
    return unresolved(
      'Source observation is later than the evaluation instant; no skew tolerance was supplied.',
    )
  if (!policy.known) return unresolved(`Freshness policy is unknown: ${policy.reason}`, known(age))
  const p = policy.value
  if (
    !Number.isFinite(p.freshForSeconds) ||
    p.freshForSeconds < 0 ||
    !Number.isFinite(p.halfLifeSeconds) ||
    p.halfLifeSeconds <= 0 ||
    !Number.isFinite(p.displayForSeconds) ||
    p.displayForSeconds < p.freshForSeconds ||
    typeof p.permitsFreshResponse !== 'boolean' ||
    typeof p.permitsCache !== 'boolean' ||
    typeof p.permitsStaleDisplay !== 'boolean'
  ) {
    return unresolved(
      'Invalid freshness policy: finite seconds, positive half-life and ordered display window are required.',
      known(age),
    )
  }
  const state =
    age <= p.freshForSeconds ? 'fresh' : age <= p.displayForSeconds ? 'stale' : 'expired'
  let provenance = baseProvenance(source)
  if (source.origin === 'licensed_provider' && state !== 'expired') {
    const cacheAllowed = source.delivery !== 'cache' || p.permitsCache
    if (cacheAllowed && state === 'stale' && p.permitsStaleDisplay) provenance = { kind: 'stale' }
    if (cacheAllowed && state === 'fresh' && source.delivery === 'cache')
      provenance = { kind: 'cached' }
    if (state === 'fresh' && source.delivery === 'response' && p.permitsFreshResponse)
      provenance = { kind: 'live' }
  }
  return {
    state,
    reason: 'Classified from supplied observed-at, evaluation instant and explicit seconds policy.',
    source,
    evaluationInstant,
    ageSeconds: known(age),
    weight: known(Math.exp((-Math.LN2 * age) / p.halfLifeSeconds)),
    provenance,
  }
}

function verifiedZone(zone: Maybe<string>): Maybe<string> {
  if (!zone.known) return zone
  return isAvailableIanaZone(zone.value)
    ? zone
    : unknown(`A supplied available IANA airport zone is required: ${zone.value}`)
}

export function representTime(evidence: TimeEvidence): TimeRepresentation {
  const instant =
    evidence.instant.known && !isUtcInstant(evidence.instant.value)
      ? unknown('The supplied instant is not valid UTC ISO time.')
      : evidence.instant
  const zone = verifiedZone(evidence.zone)
  if (!instant.known || !zone.known) {
    const reason = !instant.known
      ? instant.reason
      : !zone.known
        ? zone.reason
        : 'Missing time evidence.'
    return {
      airport: evidence.airport,
      instant,
      zone,
      local: unknown(reason),
      displayTime: unknown(reason),
    }
  }
  return {
    airport: evidence.airport,
    instant,
    zone,
    local: known({
      date: localIsoDate(instant.value, zone.value),
      clock: clockTime(instant.value, zone.value),
      zoneName: zoneName(instant.value, zone.value),
    }),
    displayTime:
      evidence.airport.length > 0 && evidence.airport.trim() === evidence.airport
        ? known({ airport: evidence.airport, instant: instant.value, zone: zone.value })
        : unknown('An airport label is required before displaying this time.'),
  }
}

export function representItineraryTime(
  fromEvidence: TimeEvidence,
  toEvidence: TimeEvidence,
): ItineraryTimeRepresentation {
  const from = representTime(fromEvidence)
  const to = representTime(toEvidence)
  let elapsedMinutes: Maybe<number> = unknown('Both UTC instants are required for elapsed time.')
  if (from.instant.known && to.instant.known) {
    elapsedMinutes =
      Date.parse(to.instant.value) < Date.parse(from.instant.value)
        ? unknown('Arrival instant precedes departure; no valid elapsed interval is asserted.')
        : known(minutesBetween(from.instant.value, to.instant.value))
  }
  return {
    from,
    to,
    elapsedMinutes,
    crossesLocalDate:
      from.local.known && to.local.known
        ? known(from.local.value.date !== to.local.value.date)
        : unknown('Both airport-local dates require explicit, available zone evidence.'),
  }
}
