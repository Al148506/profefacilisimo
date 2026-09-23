import { MemoryRouter, useLocation } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import LessonsPage from './LessonsPage';
import { transitionLesson, duplicateLesson, lessonListKey, listLessons } from './lesson-api';
import { logout } from '../auth';

vi.mock('../auth', () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: 'u1' }), logout: vi.fn() }));
vi.mock('./lesson-api', async (original) => ({ ...await original<typeof import('./lesson-api')>(), listLessons: vi.fn(), duplicateLesson: vi.fn(), transitionLesson: vi.fn() }));
const user = { id: 'u1', email: 'profe@example.com' };
const lesson = { id: 'l1', title: 'Viajes', level: 'B1' as const, topic: 'Vacaciones', estimatedDuration: 60, updatedAt: '2026-09-17', deletedAt: null };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(listLessons).mockResolvedValue([]); });
function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }
function page(trash = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><MemoryRouter><Location /><LessonsPage user={user} trash={trash} /></MemoryRouter></QueryClientProvider>);
  return { ...result, client };
}
it('shows loading followed by initial empty state', async () => {
  let resolve!: (value: typeof lesson[]) => void;
  vi.mocked(listLessons).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  page();
  expect(screen.getByText('Cargando tus clases…')).toBeInTheDocument();
  resolve([]);
  expect(await screen.findByText('Aún no tienes clases.')).toBeInTheDocument();
});
it('shows title, level and topic in server order', async () => {
  vi.mocked(listLessons).mockResolvedValue([lesson, { ...lesson, id: 'l2', title: 'Segunda' }]);
  page();
  expect(await screen.findByRole('heading', { name: 'Viajes' })).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('ViajesB1Vacaciones');
  expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Segunda');
});
it('shows the calculated total, 0 for an empty lesson, and the incomplete label', async () => {
  vi.mocked(listLessons).mockResolvedValue([
    { ...lesson, id: 'l1', title: 'Completa', estimatedDuration: 30 },
    { ...lesson, id: 'l2', title: 'Incompleta', estimatedDuration: null },
    { ...lesson, id: 'l3', title: 'Vacía', estimatedDuration: 0 },
  ]);
  page();
  expect(await screen.findByRole('heading', { name: 'Completa' })).toBeInTheDocument();
  expect(screen.getByText('30 min')).toBeInTheDocument();
  expect(screen.getByText('Duración incompleta')).toBeInTheDocument();
  expect(screen.getByText('0 min')).toBeInTheDocument();
});
it('leaves the trash list unchanged, without durations', async () => {
  vi.mocked(listLessons).mockResolvedValue([lesson]);
  page(true);
  expect(await screen.findByRole('heading', { name: 'Viajes' })).toBeInTheDocument();
  expect(screen.queryByText('60 min')).not.toBeInTheDocument();
  expect(screen.queryByText('Duración incompleta')).not.toBeInTheDocument();
});
it('combines trimmed local filters and clears them without changing the URL', async () => {
  page();
  await screen.findByText('Aún no tienes clases.');
  const url = window.location.href;
  await userEvent.type(screen.getByLabelText('Buscar por título'), ' viaje ');
  await userEvent.selectOptions(screen.getByLabelText('Nivel'), 'B2');
  expect(listLessons).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  expect(await screen.findByText('No hay clases que coincidan con estos filtros.')).toBeInTheDocument();
  expect(listLessons).toHaveBeenLastCalledWith({ search: 'viaje', level: 'B2' }, expect.any(AbortSignal), 'active');
  expect(window.location.href).toBe(url);
  await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  expect(await screen.findByText('Aún no tienes clases.')).toBeInTheDocument();
  expect(screen.getByLabelText('Buscar por título')).toHaveValue('');
  expect(screen.getByLabelText('Nivel')).toHaveValue('');
});
it('retries errors only when requested', async () => {
  vi.mocked(listLessons).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue([lesson]);
  page();
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar tus clases.');
  expect(listLessons).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar clases' }));
  expect(await screen.findByRole('heading', { name: 'Viajes' })).toBeInTheDocument();
});
it('keys cache by user, state and effective filters', () => {
  expect(lessonListKey('u1', { search: ' viaje ', level: 'B1' })).toEqual(['lessons', 'u1', 'active', 'viaje', 'B1']);
  expect(lessonListKey('u1', { search: '', level: '' })).not.toEqual(lessonListKey('u2', { search: '', level: '' }));
});
it('disables sign out while pending and retains data when logout fails', async () => {
  let reject!: (error: Error) => void;
  vi.mocked(logout).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  const { client } = page();
  await screen.findByText('Aún no tienes clases.');
  await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  expect(screen.getByRole('button', { name: 'Cerrando…' })).toBeDisabled();
  reject(new Error('Offline'));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cerrar');
  expect(client.getQueryData(lessonListKey(user.id, { search: '', level: '' }))).toEqual([]);
});
it('clears cached data when logout succeeds', async () => {
  vi.mocked(logout).mockResolvedValue();
  const { client } = page();
  const clear = vi.spyOn(client, 'clear');
  await screen.findByText('Aún no tienes clases.');
  await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  await waitFor(() => expect(clear).toHaveBeenCalledOnce());
});

it('disables duplicate while pending and opens the copy only after success', async () => {
  vi.mocked(listLessons).mockResolvedValue([lesson]);
  let resolve!: (value: Awaited<ReturnType<typeof duplicateLesson>>) => void;
  vi.mocked(duplicateLesson).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const { client } = page();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  await userEvent.click(await screen.findByRole('button', { name: 'Duplicar Viajes' }));
  expect(screen.getByRole('button', { name: 'Duplicar Viajes' })).toBeDisabled();
  expect(screen.getByText('Duplicando…')).toBeInTheDocument();
  expect(screen.getByTestId('location')).toHaveTextContent('/');
  expect(duplicateLesson).toHaveBeenCalledTimes(1);
  resolve({ ...lesson, id: 'copy', title: 'Viajes (copia)', objective: 'Objetivo', createdAt: '2026-09-17', estimatedDuration: null, activities: [] });
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/lessons/copy/edit'));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['lessons', user.id] });
});
it('does not retry uncertain duplication or navigate away on failure', async () => {
  vi.mocked(listLessons).mockResolvedValue([lesson]);
  vi.mocked(duplicateLesson).mockRejectedValueOnce(new TypeError('Network error'));
  page();
  await userEvent.click(await screen.findByRole('button', { name: 'Duplicar Viajes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Actualiza el listado');
  expect(duplicateLesson).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('location')).toHaveTextContent('/');
  expect(screen.getByRole('heading', { name: 'Viajes' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Duplicar Viajes' })).toBeEnabled();
});
it('trash hides filters and editing, and shows its own empty state', async () => {
  page(true);
  expect(await screen.findByText('La papelera está vacía.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Buscar por título')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Nivel')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Crear clase' })).not.toBeInTheDocument();
});
it('cancelled confirmation never sends a trash request', async () => {
  vi.mocked(listLessons).mockResolvedValue([lesson]);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  page();
  await userEvent.click(await screen.findByRole('button', { name: 'Enviar a papelera Viajes' }));
  expect(transitionLesson).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Viajes' })).toBeInTheDocument();
});
it('restores only after confirmation, disables actions and waits for success before removing rows', async () => {
  vi.mocked(listLessons).mockResolvedValue([lesson]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  let resolve!: () => void;
  vi.mocked(transitionLesson).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  page(true);
  await userEvent.click(await screen.findByRole('button', { name: 'Restaurar Viajes' }));
  expect(screen.getByRole('button', { name: 'Restaurar Viajes' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Eliminar definitivamente Viajes' })).toBeDisabled();
  expect(screen.getByRole('heading', { name: 'Viajes' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Duplicar Viajes' })).not.toBeInTheDocument();
  vi.mocked(listLessons).mockResolvedValue([]);
  resolve();
  expect(await screen.findByText('La papelera está vacía.')).toBeInTheDocument();
  expect(transitionLesson).toHaveBeenCalledWith('l1', 'restore');
});
it('permanent deletion warns about activities and preserves the row on failure', async () => {
  vi.mocked(listLessons).mockResolvedValue([lesson]);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(transitionLesson).mockRejectedValueOnce(new Error('No disponible'));
  page(true);
  await userEvent.click(await screen.findByRole('button', { name: 'Eliminar definitivamente Viajes' }));
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('"Viajes" y todas sus actividades'));
  expect(await screen.findByRole('alert')).toHaveTextContent('No disponible');
  expect(screen.getByRole('heading', { name: 'Viajes' })).toBeInTheDocument();
  expect(transitionLesson).toHaveBeenCalledTimes(1);
});