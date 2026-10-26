import assert from 'node:assert/strict'
import { test } from 'vitest'
import { z } from 'zod'
import {
  freshnessPolicySchema,
  ianaZoneSchema,
  known,
  maybeSchema,
  provenanceKindSchema,
  segmentIdentityFactsSchema,
  sourceObservationSchema,
  unknown,
  zonedTimeSchema,
} from '../src/index.ts'

test('unknown evidence requires a reason and differs from a known zero', () => {
  const schema = maybeSchema(z.number())
  assert.equal(schema.safeParse({ known: false }).success, false)
  assert.equal(schema.safeParse({ known: false, reason: '' }).success, false)
  assert.deepEqual(schema.parse(known(0)), { known: true, value: 0 })
  assert.deepEqual(schema.parse(unknown('Not supplied.')), {
    known: false,
    reason: 'Not supplied.',
  })
})

test('provenance preserves the six existing internal kinds without synonyms', () => {
  assert.deepEqual(provenanceKindSchema.options, [
    'live',
    'cached',
    'stale',
    'demo',
    'unavailable',
    'heuristic',
  ])
  assert.equal(provenanceKindSchema.safeParse('fresh').success, false)
})

test('display times require an airport, valid UTC instant and an available IANA zone', () => {
  assert.equal(
    zonedTimeSchema.safeParse({
      airport: 'DM1',
      instant: '2026-03-14T15:20:00Z',
      zone: 'America/Los_Angeles',
    }).success,
    true,
  )
  for (const zone of ['+01:00', 'PST', 'Missing/Zone'])
    assert.equal(ianaZoneSchema.safeParse(zone).success, false)
  assert.equal(
    zonedTimeSchema.safeParse({ airport: '', instant: '2026-02-30T00:00:00Z', zone: 'UTC' })
      .success,
    false,
  )
})

test('identity schema requires explicit evidence for each identity field', () => {
  assert.equal(segmentIdentityFactsSchema.safeParse({ flightNumber: known('001') }).success, false)
  const facts = Object.fromEntries(
    [
      'marketingCarrier',
      'operatingCarrier',
      'flightNumber',
      'providerNamespace',
      'providerCanonicalId',
      'origin',
      'destination',
      'originLocalServiceDate',
    ].map((field) => [field, unknown('Not supplied.')]),
  )
  assert.equal(segmentIdentityFactsSchema.safeParse(facts).success, true)
  assert.equal(
    segmentIdentityFactsSchema.safeParse({ ...facts, originLocalServiceDate: known('2026-02-30') })
      .success,
    false,
  )
})

test('freshness requires an explicit valid policy and preserves distinct timestamp evidence', () => {
  const policy = {
    freshForSeconds: 60,
    halfLifeSeconds: 60,
    displayForSeconds: 600,
    permitsFreshResponse: false,
    permitsCache: false,
    permitsStaleDisplay: false,
  }
  assert.equal(freshnessPolicySchema.safeParse(policy).success, true)
  assert.equal(freshnessPolicySchema.safeParse({ ...policy, halfLifeSeconds: 0 }).success, false)
  assert.equal(freshnessPolicySchema.safeParse({ ...policy, displayForSeconds: 59 }).success, false)
  const observation = sourceObservationSchema.parse({
    sourceId: 'synthetic',
    observedAt: unknown('No observation time.'),
    providerGeneratedAt: known('2026-03-14T15:00:00Z'),
    origin: 'fixture',
    delivery: 'response',
  })
  assert.equal(observation.observedAt.known, false)
  assert.equal(observation.providerGeneratedAt.known, true)
})
