# Phase 2 identity, freshness and itinerary time

This slice implements only the three primitives authorized by `DIRECTIVE.md` Phase 2
(lines 143–152), not a provider adapter, lookup engine or passenger-rights engine.
Contracts and Zod schemas live in `@delaypilot/contracts`; pure functions live here.
UI compatibility exports retain the existing `Maybe`, `Provenance`, `ZonedTime` and time helpers.
The existing `Segment` and assessment models remain interim; they are not duplicated here.

Source basis: commit `bf5b49523a8b4c2bd965acff7181b7e26914c273`, dated
2026-10-05 09:19:34 UTC, inspected read-only on 2026-10-26. These dates are source evidence,
not a verified production revision or runtime observation. The filed migration handoff in
`docs/BUILD_PLAN.md:451–456` originated on 2026-09-12; it describes a role and future migration,
not an active competing writer. This task is the user-designated sole integrator for this slice.

## Plan rules and review choices

| Plan requirement                                                                                                                                          | Proposed implementation convention requiring review                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity includes marketing/operating carrier, number, provider namespace/canonical ID, endpoints and origin-local service date (`DIRECTIVE.md:477–485`). | Versioned exact-fact JSON tuple. All eight fields are needed for a key. Provider-scoped: canonical-ID changes alter the key. No spelling normalization, zero stripping, schedule dependence, codeshare equivalence or cross-provider merge is guessed.                                                          |
| Unknown and conflicting facts stay explicit (`AGENTS.md:25–48`).                                                                                          | Existing `Maybe<T>` carries a reason. Incomplete identities have no key; known disagreements return both assessments and differing field names; no winner is selected. Equal partial evidence cannot establish sameness.                                                                                        |
| Observed-at and provider-generated-at are distinct (`DIRECTIVE.md:485–488`).                                                                              | Never substitute generation time for absent observation time. Generation evidence is preserved separately. No future-time skew tolerance is invented.                                                                                                                                                           |
| Half-life weight is `exp(-ln(2) * age / halfLife)` in matching units (`DIRECTIVE.md:555–556`).                                                            | Caller supplies finite seconds policy, positive half-life and maximum display age. No defaults. Boundaries are inclusive (`age <= boundary`). Missing/invalid policy yields unknown state/weight and retains a valid observed age.                                                                              |
| Live/Cached/Stale require licence/cache/display evidence (`AGENTS.md:35–48`).                                                                             | Temporal state and existing provenance kind are separate. Licensed-origin attestation and matching explicit permissions are necessary for these kinds; the pure function cannot verify the caller's attestation. Fixture origin remains Demo. Unverified/nonpermitted display is Unavailable regardless of age. |
| UTC instants, separate IANA zones, origin-local service dates; offsets are not zones (`AGENTS.md:126–131`).                                               | Strict UTC ISO with seconds and at most milliseconds; calendar round-trip validation. Require an available slash-qualified zone or `UTC`; reject numeric offsets and bare abbreviations. No airport-to-zone inference. Availability alone does not prove the airport mapping.                                   |
| Existing interim types must migrate compatibly (`docs/BUILD_PLAN.md:455`).                                                                                | Move only common evidence/provenance/time primitives; preserve UI imports through re-exports. No new public `Segment` model. Existing pure time behavior has one implementation in domain, with UI compatibility exports.                                                                                       |
| Overnight, DST and date-line cases must be tested; verified IANA support (`AGENTS.md:126–131`, `docs/BUILD_PLAN.md:68`).                                  | Reuse existing Intl helpers after input validation. Missing zone retains UTC/elapsed time but local dates stay unknown. Reversed travel interval has unknown duration. UTC minute truncation retains existing behavior.                                                                                         |

All numbers, dates, carriers, airport tokens, IDs and permission flags in tests are synthetic;
they are not operational facts, recommended policy thresholds or licence assertions about a provider.
Callers should validate external JSON with the shared schemas before invoking the typed functions.
Use `provenance.kind` for display provenance; a temporal `fresh` state alone is not licensed Live.

## Validation

```sh
pnpm exec vitest run packages/contracts/test packages/domain/test
pnpm --filter @delaypilot/contracts typecheck
pnpm --filter @delaypilot/domain typecheck
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Focused tests include same-number/different-date identity, namespace separation, conflicts and
missing identity fields, missing observation/policy, half-life and boundary behavior, licence
permissions, unavailable timezone evidence, overnight/date-line crossings, DST gaps/folds, invalid
UTC input and frozen-input preservation. Passing these does not establish provider or live behavior.
