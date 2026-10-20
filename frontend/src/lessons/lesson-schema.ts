import { z } from 'zod';
import type { LessonActivityDto, LessonActivityInput } from './lesson-api';

const REQUIRED = 'Este campo es obligatorio.';
const text = (max: number) => z.string().trim().min(1, REQUIRED).max(max, 'Máximo ' + max + ' caracteres.');

/** Metadata of a lesson. Topic is optional as per SPEC 08. */
export const lessonSchema = z.object({
  title: text(200),
  level: z.enum(['A2', 'B1', 'B2'], { error: 'Selecciona A2, B1 o B2.' }),
  topic: z
    .string()
    .trim()
    .max(200, 'Máximo 200 caracteres.')
    .default(''),
  objective: text(2000),
});
export type LessonValues = z.infer<typeof lessonSchema>;
export type LessonFormValues = z.input<typeof lessonSchema>;

export const ACTIVITY_TYPES = ['Speaking', 'Reading', 'Writing', 'VocabularyGrammar'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  Speaking: 'Speaking', Reading: 'Reading', Writing: 'Writing', VocabularyGrammar: 'Vocabulario y gramática',
};

export const SPEAKING_SUBTYPES = ['conversation', 'roleplay', 'presentation'] as const;
export type SpeakingSubtype = (typeof SPEAKING_SUBTYPES)[number];

export const SPEAKING_SUBTYPE_LABELS: Record<SpeakingSubtype, string> = {
  conversation: 'Conversation', roleplay: 'Roleplay', presentation: 'Presentation',
};

export const PRACTICE_MODES = ['scripted', 'guided', 'free'] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

export const PRACTICE_MODE_LABELS: Record<PracticeMode, string> = {
  scripted: 'Con guion', guided: 'Guiado', free: 'Libre',
};

/** What each practice mode means in class. Shown under every radio so the choice is self-explanatory. */
export const PRACTICE_MODE_HINTS: Record<PracticeMode, string> = {
  scripted: 'Los alumnos siguen el diálogo preparado.',
  guided: 'Usan el contexto, los roles y las expresiones de apoyo para construir su diálogo.',
  free: 'Improvisan a partir de la situación y el objetivo.',
};

export type SpeakingRole = { name: string; description: string };
export type ConversationContent = { subtype: 'conversation'; questionsList: string[] };
export type RoleplayContent = {
  subtype: 'roleplay'; context: string; roles: SpeakingRole[]; objective: string;
  material: string; script: string; practiceMode: PracticeMode;
};
export type PresentationContent = { subtype: 'presentation'; context: string; talkingPoints: string[] };
export type SpeakingContent = ConversationContent | RoleplayContent | PresentationContent;

export type ReadingContent = { text: string; questionsList: string[] };
export type WritingContent = { prompt: string };
export type VocabularyGrammarContent = { explanation: string; exercises: string[] };
export type ActivityContent = SpeakingContent | ReadingContent | WritingContent | VocabularyGrammarContent;

/**
 * Wire shape of a Speaking activity. Empty optional fields travel as null and a role without
 * description as null too, matching the domain's normalization of blanks.
 */
export type SpeakingContentInput =
  | { subtype: 'conversation'; questionsList: string[] }
  | { subtype: 'roleplay'; context: string; roles: { name: string; description: string | null }[];
      objective: string | null; material: string | null; script: string | null; practiceMode: PracticeMode }
  | { subtype: 'presentation'; context: string; talkingPoints: string[] };
export type ActivityContentInput = SpeakingContentInput | ReadingContent | WritingContent | VocabularyGrammarContent;

/**
 * The label shown in the editor list and in the player. A Speaking activity names its subtype too;
 * content without a subtype (rows saved before SPEC 09) reads as Conversation, like everywhere else.
 */
export function activityTypeLabel(type: ActivityType, content?: unknown): string {
  if (type !== 'Speaking') return ACTIVITY_TYPE_LABELS[type];
  const subtype = (content as { subtype?: unknown } | null | undefined)?.subtype;
  const label = subtype === 'roleplay' || subtype === 'presentation'
    ? SPEAKING_SUBTYPE_LABELS[subtype] : SPEAKING_SUBTYPE_LABELS.conversation;
  return ACTIVITY_TYPE_LABELS.Speaking + ' · ' + label;
}

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

// Optional text: blank is accepted here and normalized to null on the wire, like Rules.Optional in the domain.
const optionalText = (max: number) => z.string().trim().max(max, 'Máximo ' + max + ' caracteres.');

const conversationContent = z.object({ subtype: z.literal('conversation'), questionsList });

const roleplayContent = z.object({
  subtype: z.literal('roleplay'),
  context: text(2000),
  roles: z.array(z.object({ name: text(100), description: optionalText(500) }))
    .min(2, 'Añade al menos 2 roles.').max(6, 'Máximo 6 roles.'),
  objective: optionalText(2000),
  material: optionalText(5000),
  script: optionalText(10000),
  practiceMode: z.enum(PRACTICE_MODES, { error: 'Selecciona un modo de práctica.' }),
}).superRefine((content, ctx) => {
  if (content.practiceMode === 'scripted' && content.script === '')
    ctx.addIssue({ code: 'custom', path: ['script'], message: 'El modo «Con guion» requiere un guion.' });
});

const presentationContent = z.object({
  subtype: z.literal('presentation'),
  context: text(2000),
  talkingPoints: z.array(text(500)).max(20, 'Máximo 20 puntos de apoyo.'),
});

/** The Speaking content is itself a union: the subtype decides which fields are required. */
const speakingContent = z.discriminatedUnion('subtype', [conversationContent, roleplayContent, presentationContent]);

// The discriminant is `type`, so one activity can never be validated against another type's rules.
// Paths come out as `activities[2].content.text`, which is what the editor uses to mark the exact
// activity and field that need attention.
const activityBase = { key: z.string(), id: z.string().nullable(), title: text(200), instructions: text(2000), duration };

export const activityDraftSchema = z.discriminatedUnion('type', [
  z.object({ ...activityBase, type: z.literal('Speaking'), content: speakingContent }),
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
    case 'Speaking': return { ...base, type, content: initialSpeakingContent('conversation') };
    case 'Reading': return { ...base, type, content: { text: '', questionsList: [''] } };
    case 'Writing': return { ...base, type, content: { prompt: '' } };
    case 'VocabularyGrammar': return { ...base, type, content: { explanation: '', exercises: [''] } };
  }
}

/** The starting content of a subtype: blank fields the teacher fills in, never invented content. */
export function initialSpeakingContent(subtype: SpeakingSubtype): SpeakingContent {
  switch (subtype) {
    case 'conversation': return { subtype, questionsList: [''] };
    case 'roleplay': return {
      // Guided is the mode of a roleplay without a script, which is exactly what a blank one is.
      subtype, context: '', objective: '', material: '', script: '', practiceMode: 'guided',
      roles: [{ name: '', description: '' }, { name: '', description: '' }],
    };
    case 'presentation': return { subtype, context: '', talkingPoints: [] };
  }
}

/**
 * Changes the Speaking subtype. The caller confirms the discard beforehand when
 * hasSpecificContent reports content at stake; here the content is only replaced.
 */
export function applySubtype(activity: ActivityDraft, subtype: SpeakingSubtype): ActivityDraft {
  if (activity.type !== 'Speaking') return activity;
  return { ...activity, type: 'Speaking', content: initialSpeakingContent(subtype) };
}

/** A brand-new activity: empty fields, no Id, and an empty duration the teacher must complete. */
export function createDraft(type: ActivityType): ActivityDraft {
  return applyType({ key: nextKey(), id: null, title: '', instructions: '', duration: null }, type);
}

/** True when the activity holds type-specific content that a type change would discard. */
export function hasSpecificContent(activity: ActivityDraft): boolean {
  switch (activity.type) {
    case 'Speaking': return hasSpeakingContent(activity.content);
    case 'Reading': return activity.content.text.trim() !== '' || activity.content.questionsList.some(filled);
    case 'Writing': return activity.content.prompt.trim() !== '';
    case 'VocabularyGrammar': return activity.content.explanation.trim() !== '' || activity.content.exercises.some(filled);
  }
}

/**
 * Meaningful content of the current subtype only. Initial values (blank fields, the two empty
 * roles, the one empty row) never count, so switching subtypes with nothing written is silent.
 */
function hasSpeakingContent(content: SpeakingContent): boolean {
  switch (content.subtype) {
    case 'conversation': return content.questionsList.some(filled);
    case 'roleplay':
      return content.context.trim() !== '' || content.objective.trim() !== ''
        || content.material.trim() !== '' || content.script.trim() !== ''
        || content.roles.some((role) => role.name.trim() !== '' || role.description.trim() !== '');
    case 'presentation': return content.context.trim() !== '' || content.talkingPoints.some(filled);
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
    case 'Speaking': return { ...base, type: 'Speaking', content: speakingFromSaved(content) };
    case 'Reading': return { ...base, type: 'Reading', content: { text: line(content.text), questionsList: rows(content.questionsList) } };
    case 'Writing': return { ...base, type: 'Writing', content: { prompt: line(content.prompt) } };
    case 'VocabularyGrammar': return { ...base, type: 'VocabularyGrammar', content: { explanation: line(content.explanation), exercises: rows(content.exercises) } };
    default: throw new Error('Tipo de actividad desconocido: ' + String(activity.type));
  }
}

/**
 * Rows written before SPEC 09 carry no `subtype`: they are Conversation, exactly what the domain
 * defaults to. A stored row whose subtype fields are missing reopens with the subtype's blanks.
 */
function speakingFromSaved(content: Record<string, unknown>): SpeakingContent {
  switch (content.subtype) {
    case 'roleplay': return {
      subtype: 'roleplay',
      context: line(content.context),
      roles: savedRoles(content.roles),
      objective: line(content.objective),
      material: line(content.material),
      script: line(content.script),
      practiceMode: isPracticeMode(content.practiceMode) ? content.practiceMode : 'scripted',
    };
    case 'presentation': return {
      subtype: 'presentation',
      context: line(content.context),
      talkingPoints: textItems(content.talkingPoints),
    };
    default: return { subtype: 'conversation', questionsList: rows(content.questionsList) };
  }
}

function isPracticeMode(value: unknown): value is PracticeMode {
  return (PRACTICE_MODES as readonly string[]).includes(String(value));
}

function savedRoles(value: unknown): SpeakingRole[] {
  const roles = Array.isArray(value)
    ? value.map((role) => {
        const item = (role ?? {}) as Record<string, unknown>;
        return { name: line(item.name), description: line(item.description) };
      })
    : [];
  // A roleplay always opens with its two minimum rows, even if the stored one was empty.
  return roles.length > 0 ? roles : [{ name: '', description: '' }, { name: '', description: '' }];
}

/** Unlike questions, a list of points may legitimately be empty. */
function textItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === 'string' ? item : ''));
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
    instructions: activity.instructions, estimatedDuration: activity.duration,
    content: activity.type === 'Speaking' ? speakingInput(activity.content) : activity.content,
  };
}

/** Only the current subtype's fields go on the wire; blank optionals go as null, like the domain. */
function speakingInput(content: SpeakingContent): SpeakingContentInput {
  switch (content.subtype) {
    case 'conversation': return { subtype: 'conversation', questionsList: content.questionsList };
    case 'roleplay': return {
      subtype: 'roleplay', context: content.context,
      roles: content.roles.map((role) => ({ name: role.name, description: blankToNull(role.description) })),
      objective: blankToNull(content.objective), material: blankToNull(content.material),
      script: blankToNull(content.script), practiceMode: content.practiceMode,
    };
    case 'presentation': return {
      subtype: 'presentation', context: content.context,
      talkingPoints: content.talkingPoints.filter(filled),
    };
  }
}

function blankToNull(value: string): string | null {
  return value === '' ? null : value;
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
