/** Shown instead of a number while any activity of the lesson still lacks a duration. */
export const INCOMPLETE_DURATION_LABEL = 'Duración incompleta';

/**
 * How a lesson total is displayed: "0 min" for a lesson without activities, the calculated sum
 * when every activity has a duration, and the incomplete label while the total is null.
 */
export function formatLessonDuration(minutes: number | null): string {
  return minutes === null ? INCOMPLETE_DURATION_LABEL : minutes + ' min';
}
