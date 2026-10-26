/** Interim status/severity types. ProvenanceKind is now shared by @delaypilot/contracts;
 * status and severity migration remain outside this three-primitive slice.
 */

/** `safe` on track · `watch` conditions changing · `critical` confirmed material disruption · `unknown` insufficient fresh information. */
export type InterimStatusTone = 'safe' | 'watch' | 'critical' | 'unknown'

export const interimStatusTones: readonly InterimStatusTone[] = [
  'safe',
  'watch',
  'critical',
  'unknown',
]

/** `DIRECTIVE.md §16` notification severity. Maps onto the four status tones — never a fifth colour. */
export type InterimSeverity = 'info' | 'watch' | 'urgent' | 'resolved'

export const interimSeverities: readonly InterimSeverity[] = ['info', 'watch', 'urgent', 'resolved']

/** The severity → status-tone mapping the token layer encodes. */
export const severityToStatusTone: Readonly<Record<InterimSeverity, InterimStatusTone>> = {
  info: 'unknown',
  watch: 'watch',
  urgent: 'critical',
  resolved: 'safe',
}

/** The six provenance variants of `AGENTS.md §1.2`. Exactly six; adding a seventh is a defect. */
import type { ProvenanceKind } from '@delaypilot/contracts'
export type InterimProvenanceKind = ProvenanceKind

export const interimProvenanceKinds: readonly InterimProvenanceKind[] = [
  'live',
  'cached',
  'stale',
  'demo',
  'unavailable',
  'heuristic',
]

/**
 * The visible chip text, transcribed from the `AGENTS.md §1.2` table. Every chip renders its label
 * as text; there is no icon-only variant and no synonym.
 */
export const provenanceLabels: Readonly<Record<InterimProvenanceKind, string>> = {
  live: 'Live',
  cached: 'Cached',
  stale: 'Stale',
  demo: 'Demo',
  unavailable: 'Unavailable',
  heuristic: 'Heuristic risk band',
}
