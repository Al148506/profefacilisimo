import { authenticatedFetch } from '../auth';

export type LessonLevel = 'A2' | 'B1' | 'B2';
export type LessonFilters = { search: string; level: LessonLevel | '' };
export type LessonListItem = {
  id: string; title: string; level: LessonLevel; topic: string;
  estimatedDuration: number | null;
  updatedAt: string; deletedAt: string | null;
};

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

export type LessonDetails = LessonListItem & {
  objective: string; createdAt: string;
  activities: { id: string; type: string; title: string; instructions: string; content: unknown; order: number; estimatedDuration: number | null }[];
};
export const lessonDetailKey = (userId: string, id: string) => ['lessons', userId, 'detail', id] as const;
async function lessonResponse(response: Response): Promise<LessonDetails> {
  if (!response.ok) {
    if (response.status === 404) throw new Error('La clase no existe o no está disponible.');
    if (response.status === 401) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
    let detail = '';
    try {
      const problem = await response.json();
      if (problem.errors) detail = Object.values(problem.errors).flat().join(' ');
    } catch { /* Responses may not contain JSON. */ }
    throw new Error(detail || 'No se pudo completar la solicitud. Tus cambios no se han descartado.');
  }
  return response.json();
}
export async function getLesson(id: string, signal?: AbortSignal): Promise<LessonDetails> {
  return lessonResponse(await authenticatedFetch('/api/lessons/' + encodeURIComponent(id), { signal }));
}
export async function saveLesson(values: import('./lesson-schema').LessonValues, id?: string): Promise<LessonDetails> {
  const { title, level, topic, objective } = values;
  return lessonResponse(await authenticatedFetch('/api/lessons' + (id ? '/' + encodeURIComponent(id) : ''), {
    method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, level, topic, objective }),
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