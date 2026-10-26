import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'vitest'
import { known, unknown } from '@delaypilot/contracts'
import {
  classifyFreshness,
  compareSegmentIdentities,
  isUtcInstant,
  representItineraryTime,
  representTime,
  segmentIdentity,
} from '../src/index.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'))
const timeFixtures = fixture.time
const facts = (changes = {}) => ({
  ...Object.fromEntries(
    Object.entries(fixture.identity).map(([key, value]) => [key, known(value)]),
  ),
  ...changes,
})
const observation = (changes = {}) => ({
  sourceId: fixture.observation.sourceId,
  observedAt: known(fixture.observation.observedAt),
  providerGeneratedAt: known(fixture.observation.providerGeneratedAt),
  origin: 'licensed_provider',
  delivery: 'response',
  ...changes,
})
const policy = (changes) => known({ ...fixture.policy, ...changes })
const atAge = (seconds) =>
  new Date(Date.parse(fixture.observation.observedAt) + seconds * 1000).toISOString()
const time = (instant, zone, airport = 'DM1') => ({
  instant: known(instant),
  zone: known(zone),
  airport,
})
const value = (datum) => {
  assert.equal(datum.known, true)
  return datum.value
}

test('identity: same-number flights on different origin-local dates have different keys', () => {
  const first = segmentIdentity(facts())
  const next = segmentIdentity(facts({ originLocalServiceDate: known('2026-03-15') }))
  assert.equal(first.state, 'complete')
  assert.equal(next.state, 'complete')
  assert.notEqual(first.key, next.key)
})

test('identity: object insertion order does not alter a complete key', () => {
  assert.equal(
    segmentIdentity(facts()).key,
    segmentIdentity(Object.fromEntries(Object.entries(facts()).reverse())).key,
  )
})

test('identity: namespaces prevent collisions between provider-local IDs', () => {
  assert.notEqual(
    segmentIdentity(facts()).key,
    segmentIdentity(facts({ providerNamespace: known('another-synthetic-source') })).key,
  )
})

test('identity: unknown carrier is explicit and no partial key is asserted', () => {
  const result = segmentIdentity(
    facts({ operatingCarrier: unknown('Operating carrier was not supplied.') }),
  )
  assert.equal(result.state, 'incomplete')
  assert.equal('key' in result, false)
  assert.deepEqual(result.issues, [
    { field: 'operatingCarrier', reason: 'Operating carrier was not supplied.' },
  ])
})

test('identity: invalid service dates cannot roll over silently', () => {
  assert.equal(
    segmentIdentity(facts({ originLocalServiceDate: known('2026-02-30') })).state,
    'incomplete',
  )
})

test('identity: the same provider ID with disagreeing endpoints remains a conflict', () => {
  const result = compareSegmentIdentities(facts(), facts({ origin: known('DM3') }))
  assert.equal(result.state, 'conflict')
  assert.deepEqual(result.differences, ['origin'])
  assert.equal(result.left.facts.origin.value, 'DM1')
  assert.equal(result.right.facts.origin.value, 'DM3')
})

test('identity: a known disagreement remains explicit even when another identity field is missing', () => {
  const result = compareSegmentIdentities(
    facts({ operatingCarrier: unknown('Unknown operator.') }),
    facts({ destination: known('DM3') }),
  )
  assert.equal(result.state, 'conflict')
  assert.deepEqual(result.differences, ['destination'])
})

test('identity: matching incomplete facts do not establish sameness', () => {
  const partial = facts({ providerCanonicalId: unknown('Provider ID unavailable.') })
  assert.equal(compareSegmentIdentities(partial, partial).state, 'unknown')
  assert.equal(compareSegmentIdentities(facts(), facts()).state, 'same')
})

test('identity: exact flight-number spelling is preserved rather than silently normalized', () => {
  assert.notEqual(
    segmentIdentity(facts()).key,
    segmentIdentity(facts({ flightNumber: known('1') })).key,
  )
  assert.equal(segmentIdentity(facts({ flightNumber: known(' 001') })).state, 'incomplete')
})

test('freshness: missing observed-at never falls back to a known provider-generated-at', () => {
  const result = classifyFreshness(
    observation({ observedAt: unknown('No source observation timestamp.') }),
    fixture.evaluationInstant,
    policy(),
  )
  assert.equal(result.state, 'unknown')
  assert.equal(result.ageSeconds.known, false)
  assert.equal(result.weight.known, false)
  assert.equal(result.provenance.kind, 'unavailable')
  assert.equal(value(result.source.providerGeneratedAt), fixture.observation.providerGeneratedAt)
})

test('freshness: missing policy retains observed age but no invented threshold or weight', () => {
  const result = classifyFreshness(
    observation(),
    fixture.evaluationInstant,
    unknown('Policy not supplied.'),
  )
  assert.equal(result.state, 'unknown')
  assert.equal(value(result.ageSeconds), 60)
  assert.equal(result.weight.known, false)
  assert.match(result.reason, /Policy not supplied/)
})

test('freshness: supplied half-life in seconds yields one half at one half-life', () => {
  const result = classifyFreshness(observation(), atAge(60), policy())
  assert.ok(Math.abs(value(result.weight) - 0.5) < 1e-12)
  assert.equal(value(result.ageSeconds), 60)
})

test('freshness: explicit policy boundaries preserve fresh, stale and expired distinctions', () => {
  for (const [seconds, expected] of [
    [59, 'fresh'],
    [60, 'fresh'],
    [61, 'stale'],
    [600, 'stale'],
    [601, 'expired'],
  ]) {
    assert.equal(classifyFreshness(observation(), atAge(seconds), policy()).state, expected)
  }
})

test('freshness: timestamps alone never establish licensed Live or Cached', () => {
  for (const delivery of ['response', 'cache']) {
    const result = classifyFreshness(
      observation({ origin: 'unverified', delivery }),
      atAge(0),
      policy(),
    )
    assert.equal(result.state, 'fresh')
    assert.equal(result.provenance.kind, 'unavailable')
  }
})

test('freshness: Live and Cached require the explicit matching permission and licensed-origin attestation', () => {
  assert.equal(classifyFreshness(observation(), atAge(0), policy()).provenance.kind, 'live')
  assert.equal(
    classifyFreshness(observation({ delivery: 'cache' }), atAge(0), policy()).provenance.kind,
    'cached',
  )
  assert.equal(
    classifyFreshness(observation(), atAge(0), policy({ permitsFreshResponse: false })).provenance
      .kind,
    'unavailable',
  )
  assert.equal(
    classifyFreshness(observation({ delivery: 'cache' }), atAge(0), policy({ permitsCache: false }))
      .provenance.kind,
    'unavailable',
  )
})

test('freshness: stale display and cache permissions are enforced independently of age weight', () => {
  const allowed = classifyFreshness(observation(), atAge(120), policy())
  assert.equal(allowed.provenance.kind, 'stale')
  assert.equal(allowed.state, 'stale')
  assert.equal(
    classifyFreshness(observation(), atAge(120), policy({ permitsStaleDisplay: false })).provenance
      .kind,
    'unavailable',
  )
  assert.equal(
    classifyFreshness(
      observation({ delivery: 'cache' }),
      atAge(120),
      policy({ permitsCache: false }),
    ).provenance.kind,
    'unavailable',
  )
  assert.equal(
    classifyFreshness(observation(), atAge(601), policy()).provenance.kind,
    'unavailable',
  )
})

test('freshness: fixtures retain Demo origin with old or missing observation evidence', () => {
  for (const observedAt of [
    known(fixture.observation.observedAt),
    unknown('Synthetic observation missing.'),
  ]) {
    const result = classifyFreshness(
      observation({ origin: 'fixture', observedAt }),
      atAge(999),
      policy(),
    )
    assert.deepEqual(result.provenance, { kind: 'demo', fixture: true })
  }
})

test('freshness: invalid policy values fail closed without silently repairing units or bounds', () => {
  for (const patch of [
    { halfLifeSeconds: 0 },
    { halfLifeSeconds: NaN },
    { freshForSeconds: -1 },
    { displayForSeconds: 0 },
    { displayForSeconds: Infinity },
    { permitsCache: undefined },
  ]) {
    const result = classifyFreshness(observation(), atAge(60), policy(patch))
    assert.equal(result.state, 'unknown')
    assert.equal(result.weight.known, false)
  }
})

test('freshness: future or invalid observation/evaluation instants are explicit unknown states', () => {
  assert.equal(classifyFreshness(observation(), atAge(-1), policy()).state, 'unknown')
  assert.equal(
    classifyFreshness(
      observation({ observedAt: known('2026-02-30T15:00:00Z') }),
      atAge(0),
      policy(),
    ).state,
    'unknown',
  )
  assert.equal(classifyFreshness(observation(), 'invalid', policy()).state, 'unknown')
})

test('time: validated output is compatible with the existing ZonedTime display shape', () => {
  const evidence = time('2026-03-14T15:20:00Z', 'America/Los_Angeles')
  assert.deepEqual(value(representTime(evidence).displayTime), {
    airport: 'DM1',
    instant: evidence.instant.value,
    zone: evidence.zone.value,
  })
})

test('time: origin-local service date differs from the UTC date when evidence requires it', () => {
  const result = representTime(time('2026-03-15T00:30:00Z', 'America/Los_Angeles'))
  assert.equal(value(result.local).date, '2026-03-14')
  const identity = segmentIdentity(
    facts({ originLocalServiceDate: known(value(result.local).date) }),
  )
  assert.equal(identity.state, 'complete')
})

test('time: overnight itinerary preserves both local dates and UTC elapsed minutes', () => {
  const f = timeFixtures.overnight
  const result = representItineraryTime(
    time(f.from.instant, f.from.zone),
    time(f.to.instant, f.to.zone, 'DM2'),
  )
  assert.deepEqual([value(result.from.local).date, value(result.to.local).date], f.expectedDates)
  assert.equal(value(result.elapsedMinutes), f.expectedElapsedMinutes)
  assert.equal(value(result.crossesLocalDate), true)
})

test('time: date-line itinerary retains earlier arrival date with positive elapsed UTC time', () => {
  const f = timeFixtures.dateLine
  const result = representItineraryTime(
    time(f.from.instant, f.from.zone),
    time(f.to.instant, f.to.zone, 'DM2'),
  )
  assert.deepEqual([value(result.from.local).date, value(result.to.local).date], f.expectedDates)
  assert.equal(value(result.elapsedMinutes), 750)
  assert.equal(value(result.crossesLocalDate), true)
})

test('time: unavailable zone evidence retains the instant and elapsed time without a local-date fallback', () => {
  const from = {
    ...time('2026-03-14T15:20:00Z', 'UTC'),
    zone: unknown('Airport IANA evidence not supplied.'),
  }
  const result = representItineraryTime(from, time('2026-03-14T16:20:00Z', 'UTC', 'DM2'))
  assert.equal(value(result.from.instant), '2026-03-14T15:20:00Z')
  assert.equal(result.from.zone.known, false)
  assert.equal(result.from.local.known, false)
  assert.equal(result.from.displayTime.known, false)
  assert.equal(result.crossesLocalDate.known, false)
  assert.equal(value(result.elapsedMinutes), 60)
})

test('time: numeric offsets, ambiguous abbreviations and unavailable named zones never become airport zones', () => {
  for (const zone of ['+01:00', '-0700', 'UTC+1', 'GMT-7', 'PST', 'Missing/Timezone_Evidence']) {
    const result = representTime(time('2026-03-14T15:20:00Z', zone))
    assert.equal(result.zone.known, false)
    assert.equal(result.local.known, false)
    assert.equal(result.instant.known, true)
  }
})

test('time: DST gaps and folds preserve instants, labels and elapsed intervals in the representation', () => {
  for (const f of [timeFixtures.gap, timeFixtures.fold]) {
    const result = representItineraryTime(time(f.from, f.zone), time(f.to, f.zone, 'DM2'))
    assert.deepEqual(
      [value(result.from.local).clock, value(result.to.local).clock],
      f.expectedClocks,
    )
    assert.equal(value(result.elapsedMinutes), f === timeFixtures.gap ? 1 : 60)
  }
})

test('time: strict UTC validation rejects rolled dates, missing zones, offsets and unsupported precision', () => {
  for (const instant of [
    '2026-02-30T00:00:00Z',
    '2026-03-14T15:20:00',
    '2026-03-14T15:20:00+01:00',
    '2026-03-14T15:20:60Z',
    '2026-03-14T15:20:00.1234Z',
  ]) {
    assert.equal(isUtcInstant(instant), false)
    assert.equal(representTime(time(instant, 'UTC')).local.known, false)
  }
  assert.equal(isUtcInstant('2028-02-29T00:00:00.1Z'), true)
})

test('time: missing instants and reversed intervals do not become zero duration', () => {
  const from = time('2026-03-14T16:20:00Z', 'UTC')
  const to = time('2026-03-14T15:20:00Z', 'UTC', 'DM2')
  assert.equal(representItineraryTime(from, to).elapsedMinutes.known, false)
  const missing = representItineraryTime({ ...from, instant: unknown('No instant supplied.') }, to)
  assert.equal(missing.from.zone.known, true)
  assert.equal(missing.elapsedMinutes.known, false)
})

test('time: a displayable time requires the airport label already required by ZonedTime', () => {
  assert.equal(representTime(time('2026-03-14T15:20:00Z', 'UTC', '')).displayTime.known, false)
})

test('pure utilities preserve frozen inputs across identity, freshness and itinerary calls', () => {
  const deepFreeze = (input) => {
    for (const child of Object.values(input))
      if (child && typeof child === 'object') deepFreeze(child)
    return Object.freeze(input)
  }
  const identity = deepFreeze(facts())
  const source = deepFreeze(observation())
  const rules = deepFreeze(policy())
  const from = deepFreeze(time('2026-03-14T15:20:00Z', 'UTC'))
  const before = JSON.stringify({ identity, source, rules, from })
  segmentIdentity(identity)
  compareSegmentIdentities(identity, identity)
  classifyFreshness(source, fixture.evaluationInstant, rules)
  representItineraryTime(from, from)
  assert.equal(JSON.stringify({ identity, source, rules, from }), before)
})
