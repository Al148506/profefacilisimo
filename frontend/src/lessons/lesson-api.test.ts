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
