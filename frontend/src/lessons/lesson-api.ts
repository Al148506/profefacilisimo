import { authenticatedFetch } from '../auth';
import type { ActivityContent, ActivityType, LessonValues } from './lesson-schema';

export type LessonLevel = 'A2' | 'B1' | 'B2';
export type LessonFilters = { search: string; level: LessonLevel | '' };
export type LessonListItem = {
  id: string; title: string; level: LessonLevel; topic: string;
  /** Persisted total; null means at least one activity still has no duration. */
  estimatedDuration: number | null;
  updatedAt: string; deletedAt: string | null;
};

/** One activity as returned by the API. `content` keeps the JSONB shape of its own type. */
export type LessonActivityDto = {
  id: string; type: ActivityType; title: string; instructions: string;
  content: unknown; order: number; estimatedDuration: number | null;
};

export type LessonDetails = LessonListItem & {
  objective: string; createdAt: string; activities: LessonActivityDto[];
};

/**
 * One activity of a lesson save. The client never sends UserId, LessonId or Order: the server takes
 * the owner from the JWT and assigns the order from the position of the activity in the array.
 */
export type LessonActivityInput = {
  id: string | null; type: ActivityType; title: string; instructions: string;
  estimatedDuration: number; content: ActivityContent;
};

/** Metadata plus the complete activity set. A missing array is never sent by the editor. */
export type SaveLessonValues = LessonValues & { activities: LessonActivityInput[] };

export const lessonListKey = (userId: string, filters: LessonFilters, state: 'active' | 'trash' = 'active') =>
  ['lessons', userId, state, state === 'trash' ? '' : filters.search.trim(), state === 'trash' ? '' : filters.level] as const;

export async function listLessons(filters: LessonFilters, signal?: AbortSignal, state: 'active' | 'trash' = 'active'): Promise<LessonListItem[]> {
  const query = new URLSearchParams({ state });
  if (state === 'active' && filters.search.trim()) query.set('search', filters.search.trim());
  if (state === 'active' && filters.level) query.set('level', filters.level);
  const response = await authenticatedFetch('/api/lessons?' + query, { signal });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
    throw new Error('No pudimos cargar tus clases. Vuelve a intentarlo.');
  }
  return response.json();
}

export const lessonDetailKey = (userId: string, id: string) => ['lessons', userId, 'detail', id] as const;

/**
 * A rejected save. `fields` keeps the server's `ValidationProblemDetails` keys, so the editor can
 * point at the activity and field that failed instead of showing one merged message.
 */
export class LessonSaveError extends Error {
  readonly fields: Record<string, string[]>;
  constructor(message: string, fields: Record<string, string[]>) {
    super(message);
    this.name = 'LessonSaveError';
    this.fields = fields;
  }
}

async function lessonResponse(response: Response): Promise<LessonDetails> {
  if (!response.ok) {
    if (response.status === 404) throw new Error('La clase no existe o no está disponible.');
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
    throw new LessonSaveError(detail || 'No se pudo completar la solicitud. Tus cambios no se han descartado.', fields);
  }
  return response.json();
}
export async function getLesson(id: string, signal?: AbortSignal): Promise<LessonDetails> {
  return lessonResponse(await authenticatedFetch('/api/lessons/' + encodeURIComponent(id), { signal }));
}
export async function saveLesson(values: SaveLessonValues, id?: string): Promise<LessonDetails> {
  const { title, level, topic, objective, activities } = values;
  return lessonResponse(await authenticatedFetch('/api/lessons' + (id ? '/' + encodeURIComponent(id) : ''), {
    method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, level, topic, objective, activities }),
  }));
}

export async function duplicateLesson(id: string): Promise<LessonDetails> {
  return lessonResponse(await authenticatedFetch('/api/lessons/' + encodeURIComponent(id) + '/duplicate', { method: 'POST' }));
}

export async function transitionLesson(id: string, action: 'trash' | 'restore' | 'delete'): Promise<void> {
  const response = await authenticatedFetch('/api/lessons/' + encodeURIComponent(id) + (action === 'delete' ? '' : '/' + action),
    { method: action === 'delete' ? 'DELETE' : 'POST' });
  if (!response.ok) {
    if (response.status === 409) throw new Error('El estado de la clase ha cambiado. Actualiza el listado.');
    if (response.status === 404) throw new Error('La clase ya no está disponible. Actualiza el listado.');
    throw new Error('No pudimos confirmar la operación. Actualiza el listado antes de volver a intentarlo.');
  }
}
