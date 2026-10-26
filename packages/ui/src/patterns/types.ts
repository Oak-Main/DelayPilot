import type { Maybe, Provenance, UnknownValue, ZonedTime } from '@delaypilot/contracts'
export { known, unknown } from '@delaypilot/contracts'
export type { Maybe, Provenance, ZonedTime } from '@delaypilot/contracts'
/** Interim pattern types. Common Maybe, Provenance and ZonedTime primitives now come from
 * @delaypilot/contracts. Segment and assessment migration remain future Phase 2 work;
 * this slice does not introduce a competing Segment model.
 */
import type { InterimSeverity, InterimStatusTone } from '../tokens/interim-contracts.ts'

/* ------------------------------------------------------------------------------------------- */
/* Unknown as a first-class value.                                                              */
/* ------------------------------------------------------------------------------------------- */

/**
 * A datum that is present, or explicitly absent WITH A NAMED REASON.
 *
 * `AGENTS.md §1.1`: "If the value is not present in a licensed provider response, a fixture
 * explicitly labelled as such, or user input, it is `unknown` — and `unknown` is a first-class,
 * designed UI state, never a blank or a zero." A bare `T | null` lets a caller render a dash; this
 * shape makes the reason a required field, so the renderer always has a sentence to print.
 */
export type InterimUnknown = UnknownValue

/* ------------------------------------------------------------------------------------------- */
/* Provenance.                                                                                  */
/* ------------------------------------------------------------------------------------------- */

/** Provenance as it reaches a component: the §1.2 kind plus the freshness sentence to print. */

/**
 * Does this datum come from a fixture — by its chip word, or by its own declaration?
 *
 * The one place the `§28` caption condition is written. Seven patterns gated on
 * `provenance.kind === 'demo'`, which is the same test spelled seven times and wrong in the one
 * case that mattered (`docs/VOICE.md §2.1`). `Demo` still implies it, because a `Demo` chip is by
 * definition fixture data; `fixture` adds the panels that chose another word.
 */
export const isFixtureSourced = (provenance: Provenance): boolean =>
  provenance.kind === 'demo' || provenance.fixture === true

/* ------------------------------------------------------------------------------------------- */
/* Time.                                                                                        */
/* ------------------------------------------------------------------------------------------- */

/** ZonedTime is re-exported from @delaypilot/contracts above. */

/* ------------------------------------------------------------------------------------------- */
/* Bands.                                                                                       */
/* ------------------------------------------------------------------------------------------- */

/** `DIRECTIVE.md §27` result bands. The rendered word is copy and comes from `bands.bandLabel`. */
export type Band = 'on_track' | 'watch' | 'at_risk' | 'disrupted' | 'unknown'

export const bands: readonly Band[] = ['on_track', 'watch', 'at_risk', 'disrupted', 'unknown']

/**
 * Band → status tone. Two bands share `critical`: the tone is reinforcement, the band word is the
 * signal (`DIRECTIVE.md §7`, "never colour alone"). Mapping `at_risk` to `watch` would understate
 * it, which is the direction that costs a traveler money.
 */
export const bandToStatusTone: Readonly<Record<Band, InterimStatusTone>> = {
  on_track: 'safe',
  watch: 'watch',
  at_risk: 'critical',
  disrupted: 'critical',
  unknown: 'unknown',
}

/* ------------------------------------------------------------------------------------------- */
/* Segments.                                                                                    */
/* ------------------------------------------------------------------------------------------- */

/** `DIRECTIVE.md §17` flight-data states that a segment itself can be in. */
export type SegmentStatus =
  'scheduled' | 'delayed' | 'canceled' | 'diverted' | 'returned' | 'departed' | 'landed' | 'unknown'

/** Low / Medium / High. Never a percentage: no calibrated artifact exists (`DIRECTIVE.md §13`). */
export type Confidence = 'low' | 'medium' | 'high'

export interface SegmentEndpoint {
  /** Airport code, e.g. `DM1`. */
  readonly code: string
  /** Airport name as text. Never a logo, never trade dress (`AGENTS.md §1.4`). */
  readonly name: string
  readonly scheduled: ZonedTime
  /**
   * The current time: actual where the provider reported one, otherwise the estimate. `estimated`
   * drives the "estimated" label; an estimate rendered as fact is a fabricated operational value.
   */
  readonly current: Maybe<{ readonly time: ZonedTime; readonly estimated: boolean }>
}

export interface Segment {
  readonly id: string
  /** Marketing airline name as text. */
  readonly airline: string
  /** Flight designator as text, e.g. `DEMO 101`. */
  readonly flightNumber: string
  readonly origin: SegmentEndpoint
  readonly destination: SegmentEndpoint
  readonly status: SegmentStatus
  /**
   * Departure delay in whole minutes, `(actualOrEstimatedDeparture − scheduledDeparture)/60000`,
   * computed by `segmentDelayMinutes`. Distinct from the journey delay to the final destination.
   */
  readonly departureDelayMinutes: Maybe<number>
  readonly confidence: Confidence
  readonly provenance: Provenance
  /** Named source, e.g. "Fixture provider". Rendered as "from <source>", never as a logo. */
  readonly source: string
  /**
   * Gate and terminal. Present ONLY when licensed data supplied them. In demo mode they are
   * always `unknown` — `DIRECTIVE.md §28` and `AGENTS.md §1.1` forbid a fabricated gate.
   */
  readonly gate: Maybe<string>
  readonly terminal: Maybe<string>
  /** Aircraft/operational rows for the expandable detail. Each is a label plus a `Maybe`. */
  readonly operationalDetail: readonly { readonly label: string; readonly value: Maybe<string> }[]
  /**
   * A second provider's disagreeing snapshot (`DIRECTIVE.md §17` "conflicting providers"). When
   * present the card shows BOTH, names the newest high-quality source, and lowers confidence —
   * it never silently picks a winner.
   */
  readonly conflicting?: {
    readonly source: string
    readonly status: SegmentStatus
    readonly freshness: string
    /** Which of the two snapshots is the newest high-quality one. Named, never implied. */
    readonly newestSource: string
  }
}

/* ------------------------------------------------------------------------------------------- */
/* Connection.                                                                                  */
/* ------------------------------------------------------------------------------------------- */

/** How a transfer minute figure was arrived at. Rendered beside every component, never hidden. */
export type DerivationClass = 'measured' | 'policy_derived' | 'airport_derived' | 'estimated'

/** The seven `T` terms, in the order they are summed. */
export type TransferComponentKey =
  'deplane' | 'walk' | 'security' | 'immigration' | 'bag' | 'mobility' | 'uncertainty'

export const transferComponentKeys: readonly TransferComponentKey[] = [
  'deplane',
  'walk',
  'security',
  'immigration',
  'bag',
  'mobility',
  'uncertainty',
]

export interface TransferComponent {
  readonly key: TransferComponentKey
  /** Visible label, e.g. "Walk between gates". Copy, so the caller supplies it. */
  readonly label: string
  /**
   * Minutes this term contributes, or `unknown` with its reason. `not_required` is expressed as
   * `known(0)` plus an `applies: false` note, so a zero is never mistaken for a missing value.
   */
  readonly minutes: Maybe<number>
  /** False when the step does not apply on this transfer; the row then reads as "Not required". */
  readonly applies: boolean
  readonly derivation: DerivationClass
}

export type ConnectionTopology = 'protected' | 'self_transfer' | 'mixed_ticket' | 'unknown'

export interface ConnectionAssessment {
  readonly id: string
  readonly topology: ConnectionTopology
  readonly airport: { readonly code: string; readonly name: string }
  /** Inbound gate-in estimate. */
  readonly gateIn: Maybe<{ readonly time: ZonedTime; readonly estimated: boolean }>
  /** Outbound gate-close estimate. */
  readonly gateClose: Maybe<{ readonly time: ZonedTime; readonly estimated: boolean }>
  /**
   * True when the airline's own gate-close rule is known. When false the cockpit renders the
   * gate-close figure as a LABELLED BUFFER ESTIMATE and never as policy.
   */
  readonly gateCloseRuleKnown: boolean
  /** `W = t_gateClose − t_gateIn`, whole minutes. */
  readonly availableMinutes: Maybe<number>
  /** `T = Σ components`, whole minutes. */
  readonly requiredMinutes: Maybe<number>
  /** `S = W − T`, whole minutes. Negative means the transfer does not fit. */
  readonly slackMinutes: Maybe<number>
  readonly components: readonly TransferComponent[]
  readonly band: Band
  /**
   * A probability is rendered ONLY when the payload marks its distribution calibrated
   * (`DIRECTIVE.md §13`, §18.5). Absent ⇒ the band, the three figures and the assumptions.
   */
  readonly calibrated: false
  readonly assumptions: readonly string[]
  readonly missingData: readonly string[]
  readonly provenance: Provenance
}

/* ------------------------------------------------------------------------------------------- */
/* Rights.                                                                                      */
/* ------------------------------------------------------------------------------------------- */

/** The five permitted statuses of `AGENTS.md §1.3`. A sixth is a release-blocking defect. */
export type RightsStatus =
  'likely_applies' | 'may_apply' | 'not_indicated' | 'cannot_determine' | 'future_rule_not_active'

export const rightsStatuses: readonly RightsStatus[] = [
  'likely_applies',
  'may_apply',
  'not_indicated',
  'cannot_determine',
  'future_rule_not_active',
]

/** Status → status tone for the pill. `future_rule_not_active` is deliberately `unknown`-toned. */
export const rightsStatusTone: Readonly<Record<RightsStatus, InterimStatusTone>> = {
  likely_applies: 'safe',
  may_apply: 'watch',
  not_indicated: 'unknown',
  cannot_determine: 'unknown',
  future_rule_not_active: 'unknown',
}

export type RightsEntitlementKey = 'refund' | 'rebooking' | 'care' | 'compensation' | 'deadline'

export interface RightsLine {
  readonly key: RightsEntitlementKey
  readonly label: string
  readonly status: RightsStatus
  /** One sentence of reasoning. Never a total, never an entitlement stated as settled (`§1.3`). */
  readonly detail: string
  /**
   * Amount text, VERBATIM from the assessment payload. Never composed in a component, never
   * summed into a total. Absent in demo mode: no rule set is in force.
   */
  readonly amount?: string
}

export interface RightsSourceLink {
  /** Registry id from `data/rights/sources/**`, e.g. `eu-your-europe-air`. */
  readonly id: string
  /** Authority name from the registry; the id itself when the registry file is absent. */
  readonly label: string
  readonly href?: string
  /**
   * Fixed literal. Every record in an "Official sources" list is a PRIMARY one, so the only value
   * this may take is `primary` and omitting it means the same thing.
   *
   * It exists to make `RightsContextSource` unassignable here (trust sweep F3). A press release is
   * structurally `{ id, label }` and was therefore accepted by this type, which is how the Council
   * of the EU's press release came to sit beside a regulator record under one heading. The registry
   * already knows the difference (`evidenceClass`, `citableForRuleValues`); this carries it into
   * the type so a reviewer does not have to be the one who notices.
   */
  readonly evidenceClass?: 'primary'
}

/**
 * A registry record that reports ON a rule without being it — a press release, a news summary.
 *
 * Two differences from `RightsSourceLink`, both deliberate:
 *
 * 1. **No `href`, at any value.** `apps/web/src/components/source-registry.ts` renders a context
 *    address as text and its `ResolvedContextSource` type has no `href` either. A news summary
 *    styled like a regulator link is the overclaim in `DIRECTIVE.md §3.5` wearing a hyperlink.
 * 2. **A required `evidenceClass: 'secondary'`.** That literal is what stops one of these being
 *    passed as a `RightsSourceLink`, and a `RightsSourceLink` being passed as one of these.
 */
export interface RightsContextSource {
  readonly id: string
  readonly label: string
  readonly evidenceClass: 'secondary'
}

export interface RightsAssessment {
  readonly jurisdiction: string
  /**
   * The rule-set line, e.g. "EC 261 — version 2026-05-04". In demo mode it reads "Demo rule set":
   * a version number there would be a legal claim about a rule set that is not in force.
   */
  readonly ruleSet: string
  /** Answer-first summary. */
  readonly whatMayApply: string
  readonly whatWeStillNeed: readonly string[]
  readonly lines: readonly RightsLine[]
  readonly evidenceChecklist: readonly string[]
  /** Official sources: primary records only. The type above is what keeps it that way. */
  readonly sources: readonly RightsSourceLink[]
  /**
   * Records that report on the rule without being it. Rendered in their OWN labelled block after
   * the sources list, never linked and never counted among them (trust sweep F3).
   */
  readonly contextSources?: readonly RightsContextSource[]
  /**
   * The current-vs-future rule module. An `adopted_not_effective` rule set renders HERE as future,
   * never as applicable (`DIRECTIVE.md §3.5`).
   */
  readonly futureRule?: {
    readonly label: string
    readonly status: 'future_rule_not_active'
    readonly detail: string
  }
  /**
   * US airline dashboard commitments: voluntary, distinct from statutory refund rights, and shown
   * in their own labelled module with no claims (`DIRECTIVE.md §3.5`).
   */
  readonly voluntaryCommitments?: {
    readonly label: string
    readonly detail: string
  }
  readonly provenance: Provenance
}

/* ------------------------------------------------------------------------------------------- */
/* Actions.                                                                                     */
/* ------------------------------------------------------------------------------------------- */

export interface ActionItem {
  readonly id: string
  readonly label: string
  readonly detail: string
  /**
   * Soonest-expiring deadline leads. `null` means no deadline is known — it sorts after every
   * known deadline, never before.
   */
  readonly deadline: Maybe<ZonedTime>
  /** Irreversible choices rank above reversible ones and carry a consequence line. */
  readonly reversible: boolean
  /** Required when `reversible` is false: what the traveler gives up by choosing it. */
  readonly consequence?: string
  /** Jurisdiction this step is scoped to, when it is jurisdiction-specific. */
  readonly jurisdiction?: string
  readonly sources: readonly RightsSourceLink[]
  /**
   * The internal ranking utility `U = p_cancel·c_cancel + p_miss·c_miss + p_delay60·c_delay`.
   * NEVER DISPLAYED and never rendered as a probability — it is a sort key only. Optional so the
   * list also sorts correctly when no risk assessment exists.
   */
  readonly utility?: number
}

/* ------------------------------------------------------------------------------------------- */
/* Alerts.                                                                                      */
/* ------------------------------------------------------------------------------------------- */

export interface AlertEvent {
  readonly id: string
  readonly severity: InterimSeverity
  readonly title: string
  readonly detail: string
  readonly at: ZonedTime
  readonly provenance: Provenance
}
