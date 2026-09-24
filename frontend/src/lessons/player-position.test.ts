import { expect, it } from 'vitest';
import { canonicalPosition, CLOSING_VALUE, positionParam, readPlayerPosition } from './player-position';

/** No parameter at all: the bare `/lessons/:id/play`. */
const withoutParam = () => new URLSearchParams('');

/** The parameter with the given raw text, so a hand-edited URL can be reproduced exactly. */
const withParam = (value: string) => new URLSearchParams('actividad=' + value);

it('shows the first activity when the parameter is absent', () => {
  expect(readPlayerPosition(withoutParam(), 3)).toEqual({ kind: 'activity', index: 0 });
});

it('reads a valid activity with base 1, matching the visible counter', () => {
  expect(readPlayerPosition(withParam('1'), 3)).toEqual({ kind: 'activity', index: 0 });
  expect(readPlayerPosition(withParam('2'), 3)).toEqual({ kind: 'activity', index: 1 });
  expect(readPlayerPosition(withParam('3'), 3)).toEqual({ kind: 'activity', index: 2 });
});

it('reads fin as the closing screen, which is not an activity', () => {
  expect(readPlayerPosition(withParam('fin'), 3)).toEqual({ kind: 'closing' });
  // The closing screen is reachable from a reload, so it never depends on the activity count.
  expect(readPlayerPosition(withParam('fin'), 1)).toEqual({ kind: 'closing' });
});

it('normalizes zero, negatives, decimals, non-numbers and out-of-range values to the first activity', () => {
  for (const value of ['0', '-1', '-7', '2.5', '0.5', 'abc', '', ' ', '3a', '1e3', 'Infinity', 'NaN', '4', '99']) {
    expect(readPlayerPosition(withParam(value), 3), 'actividad=' + JSON.stringify(value)).toEqual({ kind: 'activity', index: 0 });
  }
});

it('accepts the last activity and rejects only what is beyond it', () => {
  expect(readPlayerPosition(withParam('3'), 3)).toEqual({ kind: 'activity', index: 2 });
  expect(readPlayerPosition(withParam('4'), 3)).toEqual({ kind: 'activity', index: 0 });
});

it('has no valid position in a lesson without activities, so every number falls back to the first', () => {
  for (const value of ['1', '2', '0', 'abc']) {
    expect(readPlayerPosition(withParam(value), 0)).toEqual({ kind: 'activity', index: 0 });
  }
});

it('writes the canonical form of a position, so the URL can be corrected without guessing', () => {
  expect(positionParam(0)).toBe('1');
  expect(positionParam(2)).toBe('3');
  expect(canonicalPosition({ kind: 'activity', index: 0 })).toBe('1');
  expect(canonicalPosition({ kind: 'closing' })).toBe(CLOSING_VALUE);
  expect(CLOSING_VALUE).toBe('fin');
});

it('round-trips every valid position through its canonical form', () => {
  for (let index = 0; index < 4; index += 1) {
    expect(readPlayerPosition(withParam(positionParam(index)), 4)).toEqual({ kind: 'activity', index });
  }
  expect(readPlayerPosition(withParam(canonicalPosition({ kind: 'closing' })), 4)).toEqual({ kind: 'closing' });
});
