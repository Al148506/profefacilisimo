import { z } from 'zod';
import type { LessonActivityDto, LessonActivityInput } from './lesson-api';

const REQUIRED = 'Este campo es obligatorio.';
const text = (max: number) => z.string().trim().min(1, REQUIRED).max(max, 'Máximo ' + max + ' caracteres.');

/** Metadata of a lesson. Unchanged by SPEC 02: the editor still asks for these four fields. */
export const lessonSchema = z.object({
  title: text(200), level: z.enum(['A2', 'B1', 'B2'], { error: 'Selecciona A2, B1 o B2.' }),
  topic: text(200), objective: text(2000),
});
export type LessonValues = z.infer<typeof lessonSchema>;

export const ACTIVITY_TYPES = ['Speaking', 'Reading', 'Writing', 'VocabularyGrammar'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  Speaking: 'Speaking', Reading: 'Reading', Writing: 'Writing', VocabularyGrammar: 'Vocabulario y gramática',
};

export type SpeakingContent = { questionsList: string[] };
export type ReadingContent = { text: string; questionsList: string[] };
export type WritingContent = { prompt: string };
export type VocabularyGrammarContent = { explanation: string; exercises: string[] };
export type ActivityContent = SpeakingContent | ReadingContent | WritingContent | VocabularyGrammarContent;

/** Everything an activity carries except its type and its type-specific content. */
export type ActivityDraftBase = {
  /** Stable local key, separate from `id`, because a new activity still has no server Id. */
  key: string;
  id: string | null;
  title: string;
  instructions: string;
  /** null while the field is still empty: a new activity never gets an invented duration. */
  duration: number | null;
};

/** The editor's local model. It is a discriminated union so `type` always matches its content. */
export type ActivityDraft = ActivityDraftBase & (
  | { type: 'Speaking'; content: SpeakingContent }
  | { type: 'Reading'; content: ReadingContent }
  | { type: 'Writing'; content: WritingContent }
  | { type: 'VocabularyGrammar'; content: VocabularyGrammarContent }
);

const question = text(2000);
const questionsList = z.array(question).min(1, 'Añade al menos una pregunta.').max(50, 'Máximo 50 preguntas.');
const exercises = z.array(question).min(1, 'Añade al menos un ejercicio.').max(50, 'Máximo 50 ejercicios.');
const duration = z.number({ error: 'Indica la duración en minutos.' })
  .int('Usa minutos enteros, sin decimales.')
  .positive('La duración debe ser mayor que cero.');

// The discriminant is `type`, so one activity can never be validated against another type's rules.
// Paths come out as `activities[2].content.text`, which is what the editor uses to mark the exact
// activity and field that need attention.
const activityBase = { key: z.string(), id: z.string().nullable(), title: text(200), instructions: text(2000), duration };

export const activityDraftSchema = z.discriminatedUnion('type', [
  z.object({ ...activityBase, type: z.literal('Speaking'), content: z.object({ questionsList }) }),
  z.object({ ...activityBase, type: z.literal('Reading'), content: z.object({ text: text(20000), questionsList }) }),
  z.object({ ...activityBase, type: z.literal('Writing'), content: z.object({ prompt: text(5000) }) }),
  z.object({ ...activityBase, type: z.literal('VocabularyGrammar'), content: z.object({ explanation: text(10000), exercises }) }),
]);

/** The whole editor draft: metadata plus every activity, in the order it will be saved. */
export const lessonDraftSchema = lessonSchema.extend({ activities: z.array(activityDraftSchema) });
export type LessonDraftValues = z.infer<typeof lessonDraftSchema>;

/** A validated draft activity: its strings are trimmed and its duration is a positive integer. */
export type ValidatedActivityDraft = LessonDraftValues['activities'][number];

let sequence = 0;
function nextKey(): string {
  sequence += 1;
  return 'activity-' + sequence;
}

/**
 * Keeps key, Id, title, instructions and duration and replaces only the type-specific content, so
 * changing the type never discards the fields that every type shares.
 */
export function applyType(base: ActivityDraftBase, type: ActivityType): ActivityDraft {
  switch (type) {
    case 'Speaking': return { ...base, type, content: { questionsList: [''] } };
    case 'Reading': return { ...base, type, content: { text: '', questionsList: [''] } };
    case 'Writing': return { ...base, type, content: { prompt: '' } };
    case 'VocabularyGrammar': return { ...base, type, content: { explanation: '', exercises: [''] } };
  }
}

/** A brand-new activity: empty fields, no Id, and an empty duration the teacher must complete. */
export function createDraft(type: ActivityType): ActivityDraft {
  return applyType({ key: nextKey(), id: null, title: '', instructions: '', duration: null }, type);
}

/** True when the activity holds type-specific content that a type change would discard. */
export function hasSpecificContent(activity: ActivityDraft): boolean {
  switch (activity.type) {
    case 'Speaking': return activity.content.questionsList.some(filled);
    case 'Reading': return activity.content.text.trim() !== '' || activity.content.questionsList.some(filled);
    case 'Writing': return activity.content.prompt.trim() !== '';
    case 'VocabularyGrammar': return activity.content.explanation.trim() !== '' || activity.content.exercises.some(filled);
  }
}

function filled(value: string): boolean {
  return value.trim() !== '';
}

/**
 * Reads a persisted activity into a draft. `Type` is the authoritative discriminator, so a
 * redundant `type` inside legacy JSON can never contradict it, and a missing duration stays null
 * instead of being invented.
 */
export function draftFromSaved(activity: LessonActivityDto): ActivityDraft {
  const base: ActivityDraftBase = {
    key: nextKey(), id: activity.id, title: activity.title,
    instructions: activity.instructions, duration: activity.estimatedDuration,
  };
  const content = (activity.content ?? {}) as Record<string, unknown>;
  switch (activity.type) {
    case 'Speaking': return { ...base, type: 'Speaking', content: { questionsList: rows(content.questionsList) } };
    case 'Reading': return { ...base, type: 'Reading', content: { text: line(content.text), questionsList: rows(content.questionsList) } };
    case 'Writing': return { ...base, type: 'Writing', content: { prompt: line(content.prompt) } };
    case 'VocabularyGrammar': return { ...base, type: 'VocabularyGrammar', content: { explanation: line(content.explanation), exercises: rows(content.exercises) } };
    default: throw new Error('Tipo de actividad desconocido: ' + String(activity.type));
  }
}

function line(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Always at least one row, so the editor never opens a list with nothing to type into. */
function rows(value: unknown): string[] {
  if (!Array.isArray(value)) return [''];
  const values = value.map((item) => (typeof item === 'string' ? item : ''));
  return values.length > 0 ? values : [''];
}

/** The wire shape of one activity: no UserId, no LessonId and no Order travel from the client. */
export function toActivityInput(activity: ValidatedActivityDraft): LessonActivityInput {
  return {
    id: activity.id, type: activity.type, title: activity.title,
    instructions: activity.instructions, estimatedDuration: activity.duration, content: activity.content,
  };
}

/**
 * What counts as an unsaved change: the local key is excluded, because saving regenerates it from
 * the Ids the server returns and that is not a change the teacher made.
 */
export function draftFingerprint(activities: readonly ActivityDraft[]): string {
  return JSON.stringify(activities.map((activity) =>
    [activity.id, activity.type, activity.title, activity.instructions, activity.duration, activity.content]));
}

/** Splits a Zod path such as `activities[2].content.text` into its activity index and field. */
export function activityIssueIndex(path: readonly PropertyKey[]): number | null {
  return path[0] === 'activities' && typeof path[1] === 'number' ? path[1] : null;
}
