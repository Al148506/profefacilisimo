import { z } from 'zod';
import type { SaveStudentValues } from './student-api';

const REQUIRED = 'Este campo es obligatorio.';

/** Required text: trimmed, never blank, bounded. */
const text = (max: number) => z.string().trim().min(1, REQUIRED).max(max, 'Máximo ' + max + ' caracteres.');

/**
 * An optional field: an empty string and a whitespace-only string both become `null`, never `''`.
 * The server normalises them the same way, so the value that travels is the value that is stored.
 */
const optional = (max: number) =>
  z.string().trim().max(max, 'Máximo ' + max + ' caracteres.').transform((value) => (value === '' ? null : value));

/** Optional email: the same emptiness rule, plus a shape check only when something was typed. */
const optionalEmail = z.string().trim()
  .max(254, 'Máximo 254 caracteres.')
  .refine((value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Escribe un correo válido.')
  .transform((value) => (value === '' ? null : value));

/** The form's model. `name` and `level` are required; everything else is optional. */
export const studentSchema = z.object({
  name: text(200),
  level: z.enum(['A2', 'B1', 'B2'], { error: 'Selecciona A2, B1 o B2.' }),
  email: optionalEmail,
  nativeLanguage: optional(100),
  interests: optional(2000),
  goals: optional(2000),
  notes: optional(4000),
});
export type StudentValues = z.infer<typeof studentSchema>;

/** The wire shape a validated form sends. Field names match C1 exactly. */
export function toSaveStudentValues(values: StudentValues): SaveStudentValues {
  return {
    name: values.name, level: values.level, email: values.email,
    nativeLanguage: values.nativeLanguage, interests: values.interests, goals: values.goals, notes: values.notes,
  };
}

/**
 * The form's raw input type: every optional is an empty string until the teacher types something.
 * `studentSchema` transforms an empty string into `null`, so `null` is the parsed output, not the
 * input the form holds.
 */
export type StudentFormValues = {
  name: string;
  level: StudentValues['level'];
  email: string; nativeLanguage: string; interests: string; goals: string; notes: string;
};

/** A brand-new student: the required fields start empty and the optionals start as empty strings. */
export function emptyStudentValues(): StudentFormValues {
  return { name: '', level: 'A2', email: '', nativeLanguage: '', interests: '', goals: '', notes: '' };
}

/** Reads a saved student into the form. A stored `null` becomes an empty field, never the text "null". */
export function studentValuesFrom(details: {
  name: string; level: StudentValues['level'];
  email: string | null; nativeLanguage: string | null;
  interests: string | null; goals: string | null; notes: string | null;
}): StudentFormValues {
  return {
    name: details.name, level: details.level,
    email: details.email ?? '', nativeLanguage: details.nativeLanguage ?? '',
    interests: details.interests ?? '', goals: details.goals ?? '', notes: details.notes ?? '',
  };
}
