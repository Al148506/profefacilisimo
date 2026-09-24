import { expect, it } from 'vitest';
import { calculateTotalDuration, formatLessonDuration, INCOMPLETE_DURATION_LABEL } from './lesson-duration';

// The same cases the domain asserts, so the editor can never show a total the server would reject.
it('sums the durations, ignores the order and reports 0 for a lesson without activities', () => {
  expect(calculateTotalDuration([])).toBe(0);
  expect(calculateTotalDuration([10, 15, 5])).toBe(30);
  expect(calculateTotalDuration([5, 15, 10])).toBe(30);
  expect(calculateTotalDuration([10, 15, 5].slice(1))).toBe(20);
});

it('reports an incomplete total while any activity lacks a duration instead of a partial sum', () => {
  expect(calculateTotalDuration([10, null, 5])).toBeNull();
  expect(calculateTotalDuration([null])).toBeNull();
  expect(calculateTotalDuration([10, 0])).toBe(10);
});

it('formats the total and the incomplete state', () => {
  expect(formatLessonDuration(0)).toBe('0 min');
  expect(formatLessonDuration(30)).toBe('30 min');
  expect(formatLessonDuration(null)).toBe(INCOMPLETE_DURATION_LABEL);
});
