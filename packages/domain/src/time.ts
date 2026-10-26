/**
 * Time rendering for the patterns.
 *
 * `AGENTS.md §3.3` is the whole specification: instants are persisted and passed as UTC, IANA
 * zone identifiers travel separately, a zone is NEVER derived from a numeric offset, and every
 * displayed time is labelled with its airport code and its zone. DST gaps, DST folds, overnight
 * flights and date-line crossings are tested cases here, not edge cases.
 *
 * Everything below is a pure function of (instant, zone) and `Intl.DateTimeFormat`, which resolves
 * the offset from the IANA database at the instant in question. That is why there is no arithmetic
 * on offsets anywhere in this file: adding hours to a wall clock is exactly how a fold produces a
 * time an hour wrong, twice a year, on the night a traveler is connecting.
 */

const clockFormatter = (zone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

/**
 * `timeZoneName: 'long'`, not `'short'`, and the choice is a correctness one rather than a
 * stylistic one.
 *
 * `'short'` resolves to a real abbreviation only where the locale has one: measured under Node 22's
 * ICU, `en-GB` + `short` yields `CET` for Europe/Amsterdam but `GMT-7` for America/Los_Angeles and
 * `GMT+13` for Pacific/Auckland. `GMT-7` is an OFFSET, and `AGENTS.md §3.3` is explicit that an
 * offset is not a zone — rendering one as the zone label is the same mistake as deriving a zone
 * from an offset, made in the output direction.
 *
 * `'long'` yields a zone NAME for every zone and never an offset, and it distinguishes daylight
 * from standard at the instant in question: "Pacific Daylight Time" against "Pacific Standard
 * Time", which is exactly what has to be visible either side of a fold.
 */
const zoneNameFormatter = (zone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'long' })

const dateFormatter = (zone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

const isoDateFormatter = (zone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

/** `08:20`. 24-hour, zero-padded, so a column of times aligns under tabular numerals. */
export function clockTime(instant: string, zone: string): string {
  return clockFormatter(zone).format(new Date(instant))
}

/**
 * `Pacific Daylight Time`. The zone name AT THAT INSTANT, so a summer time and a winter time in the
 * same itinerary are labelled differently — which is the point of labelling them at all. Falls back
 * to the IANA identifier, which is never wrong, if the runtime has no name for the zone.
 */
export function zoneName(instant: string, zone: string): string {
  const parts = zoneNameFormatter(zone).formatToParts(new Date(instant))
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? zone
}

/** `Sat 14 Mar`, in the airport's own local calendar. */
export function localDate(instant: string, zone: string): string {
  return dateFormatter(zone).format(new Date(instant))
}

/** `2026-03-14`, the local service date. Used to detect an overnight or date-line crossing. */
export function localIsoDate(instant: string, zone: string): string {
  return isoDateFormatter(zone).format(new Date(instant))
}

/**
 * True when the two instants fall on different local calendar days in their own zones — an
 * overnight leg, or a date-line crossing. The itinerary must say so; a 23:55 → 08:30 pair with no
 * date is a flight a traveler will believe lands the same evening.
 */
export function crossesLocalDate(
  from: { instant: string; zone: string },
  to: { instant: string; zone: string },
): boolean {
  return localIsoDate(from.instant, from.zone) !== localIsoDate(to.instant, to.zone)
}

/** Whole minutes between two UTC instants, `(b − a)/60000`, rounded toward zero. */
export function minutesBetween(fromInstant: string, toInstant: string): number {
  const from = new Date(fromInstant).getTime()
  const to = new Date(toInstant).getTime()
  return Math.trunc((to - from) / 60_000)
}

/**
 * Departure delay in whole minutes:
 * `(actualOrEstimatedDeparture − scheduledDeparture) / 60000`.
 *
 * The subtraction is on UTC instants, never on wall clocks, so a departure that straddles a DST
 * transition yields the elapsed minutes rather than the clock difference.
 */
export function segmentDelayMinutes(
  scheduledDepartureInstant: string,
  actualOrEstimatedDepartureInstant: string,
): number {
  return minutesBetween(scheduledDepartureInstant, actualOrEstimatedDepartureInstant)
}
