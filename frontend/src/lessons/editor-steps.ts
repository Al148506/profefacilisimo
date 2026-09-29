/**
 * The two steps of the lesson editor. The wizard keeps the teacher on one group of fields at a time:
 * the metadata first, the activities second. Nothing is sent to the server until the second step is
 * completed.
 */
export const EDITOR_STEPS = ['info', 'activities'] as const;
export type EditorStep = (typeof EDITOR_STEPS)[number];

export const STEP_LABELS: Record<EditorStep, string> = {
  info: 'Información de la clase',
  activities: 'Actividades',
};

/** 1-based position of a step, for the «Paso N de M» indicator. */
export function stepNumber(step: EditorStep): number {
  return EDITOR_STEPS.indexOf(step) + 1;
}
