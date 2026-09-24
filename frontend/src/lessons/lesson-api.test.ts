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

it('sends metadata plus the activity set and never UserId, LessonId or Order', async () => {
  const { saveLesson } = await import('./lesson-api');
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'l1' })));
  const values = {
    title: 'Clase', level: 'B1' as const, topic: 'Tema', objective: 'Objetivo', estimatedDuration: 999,
    activities: [
      { id: null, type: 'Writing' as const, title: 'A', instructions: 'Instrucciones', estimatedDuration: 10, content: { prompt: 'Consigna' } },
      { id: 'a1', type: 'Speaking' as const, title: 'B', instructions: 'Instrucciones', estimatedDuration: 5, content: { questionsList: ['Pregunta'] } },
    ],
  };
  await saveLesson(values, 'l1');
  const [path, options] = vi.mocked(authenticatedFetch).mock.calls[0];
  expect(path).toBe('/api/lessons/l1');
  expect(options?.method).toBe('PUT');
  // The complete set travels in one request, in the order the teacher arranged it.
  expect(JSON.parse(options?.body as string)).toEqual({
    title: 'Clase', level: 'B1', topic: 'Tema', objective: 'Objetivo',
    activities: [
      { id: null, type: 'Writing', title: 'A', instructions: 'Instrucciones', estimatedDuration: 10, content: { prompt: 'Consigna' } },
      { id: 'a1', type: 'Speaking', title: 'B', instructions: 'Instrucciones', estimatedDuration: 5, content: { questionsList: ['Pregunta'] } },
    ],
  });
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response(JSON.stringify({ errors: { title: ['Título inválido.'] } }), { status: 400 }));
  await expect(saveLesson(values)).rejects.toThrow('Título inválido.');
  expect(vi.mocked(authenticatedFetch).mock.calls[1][1]?.method).toBe('POST');
});

it('keeps the server field keys of a rejected save so the editor can mark each activity', async () => {
  const { saveLesson, LessonSaveError } = await import('./lesson-api');
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response(JSON.stringify({
    errors: { 'activities[1].content.text': ['Texto obligatorio.'], title: ['Título inválido.'] },
  }), { status: 400 }));
  const error = await saveLesson({
    title: 'Clase', level: 'B1', topic: 'Tema', objective: 'Objetivo', activities: [],
  }).catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(LessonSaveError);
  expect((error as InstanceType<typeof LessonSaveError>).fields).toEqual({
    'activities[1].content.text': ['Texto obligatorio.'], title: ['Título inválido.'],
  });
});

it('duplicates with a bodyless POST and does not retry network failures', async () => {
  const { duplicateLesson } = await import('./lesson-api');
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'copy' })));
  expect(await duplicateLesson('original')).toEqual({ id: 'copy' });
  expect(authenticatedFetch).toHaveBeenCalledWith('/api/lessons/original/duplicate', { method: 'POST' });
  vi.mocked(authenticatedFetch).mockRejectedValueOnce(new TypeError('Offline'));
  await expect(duplicateLesson('original')).rejects.toThrow('Offline');
  expect(authenticatedFetch).toHaveBeenCalledTimes(2);
});
