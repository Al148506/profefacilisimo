import { beforeEach, expect, it, vi } from 'vitest';
import { authenticatedFetch } from '../auth';
import { listLessons } from './lesson-api';
vi.mock('../auth', () => ({ authenticatedFetch: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it('encodes literal filters without pagination and forwards cancellation', async () => {
  vi.mocked(authenticatedFetch).mockResolvedValue(new Response('[]'));
  const signal = new AbortController().signal;
  expect(await listLessons({ search: ' %_! ', level: 'B2' }, signal)).toEqual([]);
  const [url, options] = vi.mocked(authenticatedFetch).mock.calls[0];
  const query = new URL(url, 'http://localhost').searchParams;
  expect(query.get('search')).toBe('%_!');
  expect(query.get('level')).toBe('B2');
  expect(query.get('state')).toBe('active');
  expect(query.has('page')).toBe(false);
  expect(options?.signal).toBe(signal);
});
it('omits empty filters and surfaces HTTP errors', async () => {
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response('', { status: 500 }));
  await expect(listLessons({ search: ' ', level: '' })).rejects.toThrow('No pudimos cargar');
  expect(vi.mocked(authenticatedFetch).mock.calls[0][0]).toBe('/api/lessons?state=active');
});

it('sends only editable metadata when saving and preserves server validation messages', async () => {
  const { saveLesson } = await import('./lesson-api');
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'l1' })));
  const values = { title: 'Clase', level: 'B1' as const, topic: 'Tema', objective: 'Objetivo', userId: 'other', activities: [1], estimatedDuration: 999 };
  await saveLesson(values, 'l1');
  const [path, options] = vi.mocked(authenticatedFetch).mock.calls[0];
  expect(path).toBe('/api/lessons/l1');
  expect(options?.method).toBe('PUT');
  expect(JSON.parse(options?.body as string)).toEqual({ title: 'Clase', level: 'B1', topic: 'Tema', objective: 'Objetivo' });
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response(JSON.stringify({ errors: { title: ['Título inválido.'] } }), { status: 400 }));
  await expect(saveLesson(values)).rejects.toThrow('Título inválido.');
  expect(vi.mocked(authenticatedFetch).mock.calls[1][1]?.method).toBe('POST');
});
