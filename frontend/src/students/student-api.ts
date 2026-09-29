import { authenticatedFetch } from '../auth';
import type { LessonLevel } from '../lessons/lesson-api';

/** Alias of `LessonLevel`: the product has one level scale, so a second enum is never declared. */
export type StudentLevel = LessonLevel;

export type StudentFilters = { search: string; level: StudentLevel | '' };

export type StudentListItem = {
  id: string; name: string; level: StudentLevel;
  /** Summary of interests; null when there are none. */
  interests: string | null;
  /** Assigned lessons, including the ones in the trash. Same number as in the profile. */
  assignedLessonCount: number;
  updatedAt: string; deletedAt: string | null;
};

/** One lesson assigned to a student, as returned by the profile. */
export type AssignedLesson = {
  id: string; title: string; level: StudentLevel;
  /** Persisted total; null means at least one activity still has no duration. */
  estimatedDuration: number | null;
  /** A lesson in the trash stays assigned and is shown marked, never actionable. */
  inTrash: boolean;
  assignedAt: string;
};

/** One student assigned to a lesson, as returned by the editor section. */
export type AssignedStudent = {
  id: string; name: string; level: StudentLevel;
  /** A student in the trash stays assigned and is shown marked. */
  inTrash: boolean;
  assignedAt: string;
};

export type StudentDetails = StudentListItem & {
  email: string | null; nativeLanguage: string | null;
  goals: string | null; notes: string | null;
  createdAt: string; assignedLessons: AssignedLesson[];
};

/** What an add or edit sends. Optional fields travel as null, never as an empty string. */
export type SaveStudentValues = {
  name: string; level: StudentLevel;
  email: string | null; nativeLanguage: string | null;
  interests: string | null; goals: string | null; notes: string | null;
};

/**
 * A rejected save. `fields` keeps the server's `ValidationProblemDetails` keys, so the form can
 * point at the exact field that failed instead of showing one merged message.
 */
export class StudentSaveError extends Error {
  readonly fields: Record<string, string[]>;
  constructor(message: string, fields: Record<string, string[]>) {
    super(message);
    this.name = 'StudentSaveError';
    this.fields = fields;
  }
}

/** The listing excludes the filters when reading the trash: a trashed student has no level to match. */
export const studentListKey = (userId: string, filters: StudentFilters, state: 'active' | 'trash' = 'active') =>
  ['students', userId, state, state === 'trash' ? '' : filters.search.trim(), state === 'trash' ? '' : filters.level] as const;

export const studentDetailKey = (userId: string, id: string) => ['students', userId, 'detail', id] as const;

export async function listStudents(filters: StudentFilters, signal?: AbortSignal, state: 'active' | 'trash' = 'active'): Promise<StudentListItem[]> {
  const query = new URLSearchParams({ state });
  if (state === 'active' && filters.search.trim()) query.set('search', filters.search.trim());
  if (state === 'active' && filters.level) query.set('level', filters.level);
  const response = await authenticatedFetch('/api/students?' + query, { signal });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
    throw new Error('No pudimos cargar tus estudiantes. Vuelve a intentarlo.');
  }
  return response.json();
}

async function studentResponse(response: Response): Promise<StudentDetails> {
  if (!response.ok) {
    if (response.status === 404) throw new Error('El estudiante no existe o no está disponible.');
    if (response.status === 401) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
    let detail = '';
    let fields: Record<string, string[]> = {};
    try {
      const problem = await response.json();
      if (problem.errors) {
        fields = problem.errors;
        detail = Object.values(problem.errors as Record<string, string[]>).flat().join(' ');
      }
    } catch { /* Responses may not contain JSON. */ }
    throw new StudentSaveError(detail || 'No se pudo completar la solicitud. Tus cambios no se han descartado.', fields);
  }
  return response.json();
}

export async function getStudent(id: string, signal?: AbortSignal): Promise<StudentDetails> {
  return studentResponse(await authenticatedFetch('/api/students/' + encodeURIComponent(id), { signal }));
}

export async function saveStudent(values: SaveStudentValues, id?: string): Promise<StudentDetails> {
  const { name, level, email, nativeLanguage, interests, goals, notes } = values;
  return studentResponse(await authenticatedFetch('/api/students' + (id ? '/' + encodeURIComponent(id) : ''), {
    method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, level, email, nativeLanguage, interests, goals, notes }),
  }));
}

export async function transitionStudent(id: string, action: 'trash' | 'restore' | 'delete'): Promise<void> {
  const response = await authenticatedFetch('/api/students/' + encodeURIComponent(id) + (action === 'delete' ? '' : '/' + action),
    { method: action === 'delete' ? 'DELETE' : 'POST' });
  if (!response.ok) {
    if (response.status === 409) throw new Error('El estado del estudiante ha cambiado. Actualiza el listado.');
    if (response.status === 404) throw new Error('El estudiante ya no está disponible. Actualiza el listado.');
    throw new Error('No pudimos confirmar la operación. Actualiza el listado antes de volver a intentarlo.');
  }
}

/**
 * The assignment endpoints fail the same way in their four directions, so they share one reader:
 * a `404` means the pair is gone (or belongs to another teacher) and the caller must refresh.
 */
async function assignmentResponse(response: Response, notFound: string): Promise<void> {
  if (!response.ok) {
    if (response.status === 404) throw new Error(notFound);
    if (response.status === 401) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
    if (response.status === 400) {
      let message = '';
      try {
        const problem = await response.json();
        if (typeof problem?.detail === 'string') message = problem.detail;
        if (Array.isArray(problem?.errors)) message = problem.errors.flat().join(' ');
      } catch { /* Responses may not contain JSON. */ }
      throw new Error(message || 'No pudimos completar la asignación. Vuelve a intentarlo.');
    }
    throw new Error('No pudimos confirmar la operación. Actualiza antes de volver a intentarlo.');
  }
}

/** Read by the editor section: the students assigned to a lesson, trashed ones included. */
export async function listAssignedStudents(lessonId: string, signal?: AbortSignal): Promise<AssignedStudent[]> {
  const response = await authenticatedFetch('/api/lessons/' + encodeURIComponent(lessonId) + '/students', { signal });
  if (!response.ok) {
    if (response.status === 404) throw new Error('La clase no existe o no está disponible.');
    if (response.status === 401) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
    throw new Error('No pudimos cargar los estudiantes asignados. Vuelve a intentarlo.');
  }
  return response.json();
}

export async function assignStudentToLesson(lessonId: string, studentId: string): Promise<AssignedStudent> {
  const response = await authenticatedFetch('/api/lessons/' + encodeURIComponent(lessonId) + '/students', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId }),
  });
  await assignmentResponse(response, 'La clase no existe o no está disponible.');
  return response.json();
}

export async function unassignStudentFromLesson(lessonId: string, studentId: string): Promise<void> {
  const response = await authenticatedFetch(
    '/api/lessons/' + encodeURIComponent(lessonId) + '/students/' + encodeURIComponent(studentId), { method: 'DELETE' });
  await assignmentResponse(response, 'La clase no existe o no está disponible.');
}

/** Read by the profile: the lessons assigned to a student, trashed ones included. */
export async function listAssignedLessons(studentId: string, signal?: AbortSignal): Promise<AssignedLesson[]> {
  const response = await authenticatedFetch('/api/students/' + encodeURIComponent(studentId) + '/lessons', { signal });
  if (!response.ok) {
    if (response.status === 404) throw new Error('El estudiante no existe o no está disponible.');
    if (response.status === 401) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
    throw new Error('No pudimos cargar las clases asignadas. Vuelve a intentarlo.');
  }
  return response.json();
}

export async function assignLessonToStudent(studentId: string, lessonId: string): Promise<AssignedLesson> {
  const response = await authenticatedFetch('/api/students/' + encodeURIComponent(studentId) + '/lessons', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonId }),
  });
  await assignmentResponse(response, 'El estudiante no existe o no está disponible.');
  return response.json();
}

export async function unassignLessonFromStudent(studentId: string, lessonId: string): Promise<void> {
  const response = await authenticatedFetch(
    '/api/students/' + encodeURIComponent(studentId) + '/lessons/' + encodeURIComponent(lessonId), { method: 'DELETE' });
  await assignmentResponse(response, 'El estudiante no existe o no está disponible.');
}
