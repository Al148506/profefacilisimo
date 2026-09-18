import { authenticatedFetch } from '../auth';

export type LessonLevel = 'A2' | 'B1' | 'B2';
export type LessonFilters = { search: string; level: LessonLevel | '' };
export type LessonListItem = {
  id: string; title: string; level: LessonLevel; topic: string;
  updatedAt: string; deletedAt: string | null;
};

export const lessonListKey = (userId: string, filters: LessonFilters) =>
  ['lessons', userId, 'active', filters.search.trim(), filters.level] as const;

export async function listLessons(filters: LessonFilters, signal?: AbortSignal): Promise<LessonListItem[]> {
  const query = new URLSearchParams({ state: 'active' });
  if (filters.search.trim()) query.set('search', filters.search.trim());
  if (filters.level) query.set('level', filters.level);
  const response = await authenticatedFetch('/api/lessons?' + query, { signal });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
    throw new Error('No pudimos cargar tus clases. Vuelve a intentarlo.');
  }
  return response.json();
}
