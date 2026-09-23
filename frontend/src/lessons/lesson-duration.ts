/** Shown instead of a number while any activity of the lesson still lacks a duration. */
export const INCOMPLETE_DURATION_LABEL = 'Duración incompleta';

/**
 * How a lesson total is displayed: "0 min" for a lesson without activities, the calculated sum
 * when every activity has a duration, and the incomplete label while the total is null.
 */
export function formatLessonDuration(minutes: number | null): string {
  return minutes === null ? INCOMPLETE_DURATION_LABEL : minutes + ' min';
}

/**
 * Pure mirror of the server rule for the total, so the editor shows exactly what a save would
 * persist: 0 when the lesson has no activities, their sum when every one has a duration, and null
 * while any of them is still missing one. The total never depends on the order, and no duration is
 * ever invented for an activity that lacks it.
 */
export function calculateTotalDuration(durations: readonly (number | null)[]): number | null {
  let total = 0;
  for (const duration of durations) {
    if (duration === null) return null;
    total += duration;
  }
  return total;
}
