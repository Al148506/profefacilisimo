import { expect, it } from 'vitest';
import { emptyStudentValues, studentSchema, studentValuesFrom, toSaveStudentValues } from './student-schema';

/**
 * The form's raw input: every optional starts as an empty string, which is what the inputs hold
 * before validation. `emptyStudentValues()` is the parsed output and cannot be fed back in.
 */
const raw = (overrides: Record<string, unknown> = {}) => ({
  name: '', level: 'B1', email: '', nativeLanguage: '', interests: '', goals: '', notes: '', ...overrides,
});

it('requires a name and a level', () => {
  expect(studentSchema.safeParse(raw({ name: '' })).success).toBe(false);
  expect(studentSchema.safeParse(raw({ name: '   ' })).success).toBe(false);
  expect(studentSchema.safeParse(raw({ name: 'Alba', level: 'C1' })).success).toBe(false);
  expect(studentSchema.safeParse(raw({ name: 'Alba' })).success).toBe(true);
  // The form starts with an empty name and a default level.
  expect(emptyStudentValues().name).toBe('');
  expect(emptyStudentValues().level).toBe('A2');
  // The form holds empty strings; `null` is what validation returns, never what the inputs hold.
  expect(emptyStudentValues().email).toBe('');
  expect(studentSchema.parse(raw({ name: 'Alba' })).email).toBeNull();
});

it('turns an empty or whitespace-only optional into null, never into an empty string', () => {
  const parsed = studentSchema.parse(raw({
    name: 'Alba', email: '', nativeLanguage: '   ', interests: '', goals: '   ', notes: '',
  }));
  expect(parsed.email).toBeNull();
  expect(parsed.nativeLanguage).toBeNull();
  expect(parsed.interests).toBeNull();
  expect(parsed.goals).toBeNull();
  expect(parsed.notes).toBeNull();
  // Nothing that travels to the server is an empty string.
  expect(Object.values(toSaveStudentValues(parsed))).not.toContain('');
});

it('trims a filled optional instead of dropping it', () => {
  const parsed = studentSchema.parse(raw({ name: ' Alba ', interests: '  ajedrez  ', notes: ' Nota ' }));
  expect(parsed.name).toBe('Alba');
  expect(parsed.interests).toBe('ajedrez');
  expect(parsed.notes).toBe('Nota');
});

it('rejects a malformed email but accepts an absent one', () => {
  expect(studentSchema.safeParse(raw({ name: 'Alba', email: 'nope' })).success).toBe(false);
  expect(studentSchema.safeParse(raw({ name: 'Alba', email: 'a@b' })).success).toBe(false);
  expect(studentSchema.safeParse(raw({ name: 'Alba', email: 'a@b.c' })).success).toBe(true);
  expect(studentSchema.safeParse(raw({ name: 'Alba', email: '' })).success).toBe(true);
});

it('enforces the maximum length of each field', () => {
  const long = (n: number) => 'a'.repeat(n);
  expect(studentSchema.safeParse(raw({ name: long(200) })).success).toBe(true);
  expect(studentSchema.safeParse(raw({ name: long(201) })).success).toBe(false);
  expect(studentSchema.safeParse(raw({ name: 'Alba', email: long(243) + '@b.c' })).success).toBe(true);
  expect(studentSchema.safeParse(raw({ name: 'Alba', email: long(254) + '@b.c' })).success).toBe(false);
  expect(studentSchema.safeParse(raw({ name: 'Alba', nativeLanguage: long(101) })).success).toBe(false);
  expect(studentSchema.safeParse(raw({ name: 'Alba', interests: long(2001) })).success).toBe(false);
  expect(studentSchema.safeParse(raw({ name: 'Alba', goals: long(2001) })).success).toBe(false);
  expect(studentSchema.safeParse(raw({ name: 'Alba', notes: long(4001) })).success).toBe(false);
  expect(studentSchema.safeParse(raw({ name: 'Alba', notes: long(4000) })).success).toBe(true);
});

it('reads a saved student without inventing values for the absent optionals', () => {
  const values = studentValuesFrom({
    name: 'Alba', level: 'B2', email: null, nativeLanguage: 'Español',
    interests: null, goals: null, notes: 'Nota',
  });
  // A stored null becomes an empty field, so the input never shows the text "null".
  expect(values).toEqual({
    name: 'Alba', level: 'B2', email: '', nativeLanguage: 'Español',
    interests: '', goals: '', notes: 'Nota',
  });
});
