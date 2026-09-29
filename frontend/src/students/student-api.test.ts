import { beforeEach, expect, it, vi } from 'vitest';
import { authenticatedFetch } from '../auth';
import {
  assignLessonToStudent, assignStudentToLesson, getStudent, listAssignedLessons, listAssignedStudents,
  listStudents, saveStudent, StudentSaveError, studentDetailKey, studentListKey,
  transitionStudent, unassignLessonFromStudent, unassignStudentFromLesson,
} from './student-api';
vi.mock('../auth', () => ({ authenticatedFetch: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it('encodes literal filters, forwards cancellation and never paginates', async () => {
  vi.mocked(authenticatedFetch).mockResolvedValue(new Response('[]'));
  const signal = new AbortController().signal;
  expect(await listStudents({ search: ' %_! ', level: 'B2' }, signal)).toEqual([]);
  const [url, options] = vi.mocked(authenticatedFetch).mock.calls[0];
  const query = new URL(url, 'http://localhost').searchParams;
  expect(query.get('search')).toBe('%_!');
  expect(query.get('level')).toBe('B2');
  expect(query.get('state')).toBe('active');
  expect(query.has('page')).toBe(false);
  expect(options?.signal).toBe(signal);
});

it('omits empty filters in the active listing but drops them entirely in the trash', async () => {
  // A Response body can only be read once, so every call gets its own instance.
  vi.mocked(authenticatedFetch).mockImplementation(async () => new Response('[]'));
  await expect(listStudents({ search: ' ', level: '' })).resolves.toEqual([]);
  expect(vi.mocked(authenticatedFetch).mock.calls[0][0]).toBe('/api/students?state=active');
  // A trashed student keeps no level to filter by, so the filters never reach the URL.
  await listStudents({ search: 'Alba', level: 'B1' }, undefined, 'trash');
  expect(vi.mocked(authenticatedFetch).mock.calls[1][0]).toBe('/api/students?state=trash');
});

it('keeps the listing key filter-free in the trash, like the lesson one', () => {
  expect(studentListKey('u1', { search: 'Alba', level: 'B1' })).toEqual(['students', 'u1', 'active', 'Alba', 'B1']);
  expect(studentListKey('u1', { search: 'Alba', level: 'B1' }, 'trash')).toEqual(['students', 'u1', 'trash', '', '']);
  expect(studentDetailKey('u1', 's1')).toEqual(['students', 'u1', 'detail', 's1']);
});

it('surfaces a 401 as an expired session when listing', async () => {
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response('', { status: 401 }));
  await expect(listStudents({ search: '', level: '' })).rejects.toThrow('Tu sesión ha caducado.');
});

it('reads a profile, and turns a 404 into the frozen student message', async () => {
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 's1', name: 'Alba' })));
  expect(await getStudent('s1')).toEqual({ id: 's1', name: 'Alba' });
  expect(authenticatedFetch).toHaveBeenCalledWith('/api/students/s1', { signal: undefined });
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response('', { status: 404 }));
  await expect(getStudent('s1')).rejects.toThrow('El estudiante no existe o no está disponible.');
});

it('creates with POST and edits with PUT, sending nulls instead of empty strings', async () => {
  vi.mocked(authenticatedFetch).mockImplementation(async () => new Response(JSON.stringify({ id: 's1' })));
  const values = {
    name: 'Alba', level: 'B1' as const, email: null, nativeLanguage: 'Español',
    interests: null, goals: null, notes: 'Nota',
  };
  await saveStudent(values);
  const [path, options] = vi.mocked(authenticatedFetch).mock.calls[0];
  expect(path).toBe('/api/students');
  expect(options?.method).toBe('POST');
  expect(JSON.parse(options?.body as string)).toEqual(values);
  // The client never sends UserId: the server takes the owner from the JWT.
  expect(JSON.parse(options?.body as string)).not.toHaveProperty('userId');
  await saveStudent(values, 's1');
  expect(vi.mocked(authenticatedFetch).mock.calls[1][0]).toBe('/api/students/s1');
  expect(vi.mocked(authenticatedFetch).mock.calls[1][1]?.method).toBe('PUT');
});

it('keeps the server field keys of a rejected save so the form can mark each field', async () => {
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response(JSON.stringify({
    errors: { email: ['El correo no es válido.'], name: ['Este campo es obligatorio.'] },
  }), { status: 400 }));
  const error = await saveStudent({
    name: '', level: 'B1', email: 'nope', nativeLanguage: null, interests: null, goals: null, notes: null,
  }).catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(StudentSaveError);
  expect((error as InstanceType<typeof StudentSaveError>).fields).toEqual({
    email: ['El correo no es válido.'], name: ['Este campo es obligatorio.'],
  });
});

it('trashes, restores and deletes definitively with the frozen verbs', async () => {
  vi.mocked(authenticatedFetch).mockImplementation(async () => new Response(null, { status: 204 }));
  expect(await transitionStudent('s1', 'trash')).toBeUndefined();
  expect(vi.mocked(authenticatedFetch).mock.calls[0]).toEqual(['/api/students/s1/trash', { method: 'POST' }]);
  await transitionStudent('s1', 'restore');
  expect(vi.mocked(authenticatedFetch).mock.calls[1]).toEqual(['/api/students/s1/restore', { method: 'POST' }]);
  await transitionStudent('s1', 'delete');
  expect(vi.mocked(authenticatedFetch).mock.calls[2]).toEqual(['/api/students/s1', { method: 'DELETE' }]);
});

it('reports a 409 transition as a stale listing, not as a save error', async () => {
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response('', { status: 409 }));
  await expect(transitionStudent('s1', 'restore')).rejects.toThrow('El estado del estudiante ha cambiado.');
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response('', { status: 404 }));
  await expect(transitionStudent('s1', 'trash')).rejects.toThrow('El estudiante ya no está disponible.');
});

it('reads and writes both assignment directions against the C2 routes', async () => {
  vi.mocked(authenticatedFetch).mockImplementation(async () => new Response(JSON.stringify([])));
  await listAssignedStudents('l1');
  expect(vi.mocked(authenticatedFetch).mock.calls[0][0]).toBe('/api/lessons/l1/students');
  await listAssignedLessons('s1');
  expect(vi.mocked(authenticatedFetch).mock.calls[1][0]).toBe('/api/students/s1/lessons');

  vi.mocked(authenticatedFetch).mockResolvedValue(new Response(JSON.stringify({ id: 's2' })));
  expect(await assignStudentToLesson('l1', 's2')).toEqual({ id: 's2' });
  const [assignPath, assignOptions] = vi.mocked(authenticatedFetch).mock.calls[2];
  expect(assignPath).toBe('/api/lessons/l1/students');
  expect(assignOptions?.method).toBe('POST');
  expect(JSON.parse(assignOptions?.body as string)).toEqual({ studentId: 's2' });

  vi.mocked(authenticatedFetch).mockResolvedValue(new Response(JSON.stringify({ id: 'l2' })));
  expect(await assignLessonToStudent('s1', 'l2')).toEqual({ id: 'l2' });
  const [lessonPath, lessonOptions] = vi.mocked(authenticatedFetch).mock.calls[3];
  expect(lessonPath).toBe('/api/students/s1/lessons');
  expect(JSON.parse(lessonOptions?.body as string)).toEqual({ lessonId: 'l2' });
});

it('encodes both Ids when removing an assignment and tolerates a missing pair as 404', async () => {
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
  await unassignStudentFromLesson('l/1', 's 2');
  expect(vi.mocked(authenticatedFetch).mock.calls[0]).toEqual(['/api/lessons/l%2F1/students/s%202', { method: 'DELETE' }]);
  await unassignLessonFromStudent('s/1', 'l 2');
  expect(vi.mocked(authenticatedFetch).mock.calls[1]).toEqual(['/api/students/s%2F1/lessons/l%202', { method: 'DELETE' }]);

  // A pair that is already gone is a 404, and the caller refreshes instead of retrying blindly.
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response('', { status: 404 }));
  await expect(unassignStudentFromLesson('l1', 's2')).rejects.toThrow('La clase no existe o no está disponible.');
});

it('explains a 400 assignment when the target is in the trash', async () => {
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response(JSON.stringify({
    detail: 'El estudiante está en papelera.',
  }), { status: 400 }));
  await expect(assignStudentToLesson('l1', 's2')).rejects.toThrow('El estudiante está en papelera.');
});
