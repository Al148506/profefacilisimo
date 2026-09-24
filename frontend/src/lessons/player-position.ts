/**
 * Where the session is, as read from the URL. The URL is the only source of truth of the position, so
 * this module is pure: no React, no state, no side effects.
 *
 * The closing screen is deliberately part of the position and not a local flag: with `fin` in the URL
 * a reload keeps the teacher at the end of the lesson instead of sending them back to the last
 * activity.
 */
export type PlayerPosition = { kind: 'activity'; index: number } | { kind: 'closing' };

/** The query parameter that carries the position. Frozen by the contract (C1). */
export const POSITION_PARAM = 'actividad';

/** The value of `POSITION_PARAM` that represents the closing screen. Frozen by the contract (C1). */
export const CLOSING_VALUE = 'fin';

/**
 * The activity number as it is written in the URL and shown in the counter: base 1, so the first
 * activity is `1` and the visible counter never needs a translation.
 */
export function positionParam(index: number): string {
  return String(index + 1);
}

/**
 * Turns the URL into the position of the session.
 *
 * `fin` is the closing screen. Any other value is a base-1 activity number between 1 and
 * `activityCount`. Everything else — absent, not a number, not a whole number, below 1 or beyond the
 * last activity — resolves to the first activity, which is what makes a hand-edited or stale URL
 * harmless instead of a dead end.
 *
 * A lesson without activities has no valid position at all: every numeric value normalizes to the
 * first activity, and the caller ignores the result because the empty state has no navigation.
 */
export function readPlayerPosition(searchParams: URLSearchParams, activityCount: number): PlayerPosition {
  const raw = searchParams.get(POSITION_PARAM);
  if (raw === CLOSING_VALUE) return { kind: 'closing' };
  if (raw === null) return { kind: 'activity', index: 0 };
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > activityCount) return { kind: 'activity', index: 0 };
  return { kind: 'activity', index: value - 1 };
}

/**
 * The canonical form of a position, so the caller can tell whether the URL still has to be corrected.
 * It is `fin` for the closing screen and the activity number for an activity.
 */
export function canonicalPosition(position: PlayerPosition): string {
  return position.kind === 'closing' ? CLOSING_VALUE : positionParam(position.index);
}
