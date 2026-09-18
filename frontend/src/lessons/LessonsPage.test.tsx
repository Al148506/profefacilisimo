import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import LessonsPage from './LessonsPage';
import { lessonListKey, listLessons } from './lesson-api';
import { logout } from '../auth';

vi.mock('../auth', () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: 'u1' }), logout: vi.fn() }));
vi.mock('./lesson-api', async (original) => ({ ...await original<typeof import('./lesson-api')>(), listLessons: vi.fn() }));
const user = { id: 'u1', email: 'profe@example.com' };
const lesson = { id: 'l1', title: 'Viajes', level: 'B1' as const, topic: 'Vacaciones', updatedAt: '2026-09-17', deletedAt: null };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(listLessons).mockResolvedValue([]); });
function page() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><MemoryRouter><LessonsPage user={user} /></MemoryRouter></QueryClientProvider>);
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
it('combines trimmed local filters and clears them without changing the URL', async () => {
  page();
  await screen.findByText('Aún no tienes clases.');
  const url = window.location.href;
  await userEvent.type(screen.getByLabelText('Buscar por título'), ' viaje ');
  await userEvent.selectOptions(screen.getByLabelText('Nivel'), 'B2');
  expect(listLessons).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  expect(await screen.findByText('No hay clases que coincidan con estos filtros.')).toBeInTheDocument();
  expect(listLessons).toHaveBeenLastCalledWith({ search: 'viaje', level: 'B2' }, expect.any(AbortSignal));
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
