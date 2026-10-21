/**
 * The three steps of the lesson editor. The wizard keeps the teacher on one group of fields at a time:
 * the metadata first, the activities second, the student assignment third. Nothing is sent to the
 * server until the teacher saves; the third step is optional and starts empty on a new lesson.
 */
export const EDITOR_STEPS = ['info', 'activities', 'students'] as const;
export type EditorStep = (typeof EDITOR_STEPS)[number];

export const STEP_LABELS: Record<EditorStep, string> = {
  info: 'Información de la clase',
  activities: 'Actividades',
  students: 'Asignación de estudiantes',
};

/** 1-based position of a step, for the «Paso N de M» indicator. */
export function stepNumber(step: EditorStep): number {
  return EDITOR_STEPS.indexOf(step) + 1;
}
