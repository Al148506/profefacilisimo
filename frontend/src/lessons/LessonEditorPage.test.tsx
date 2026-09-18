import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import LessonEditorPage from './LessonEditorPage';
import { getLesson, saveLesson, lessonDetailKey, type LessonDetails } from './lesson-api';
import { lessonSchema } from './lesson-schema';
vi.mock('../auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('./lesson-api', async (original) => ({ ...await original<typeof import('./lesson-api')>(), getLesson: vi.fn(), saveLesson: vi.fn() }));
const detail: LessonDetails = { id: 'l1', title: 'Original', level: 'B1', topic: 'Tema', objective: 'Objetivo', createdAt: '2026-09-17', updatedAt: '2026-09-17', deletedAt: null, estimatedDuration: 60, activities: [] };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getLesson).mockResolvedValue(detail); });
function page(path = '/lessons/l1/edit') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
    <Link className="brand" to="/">Inicio</Link>
    <Routes><Route path="/" element={<h1>Listado</h1>} /><Route path="/lessons/new" element={<LessonEditorPage />} /><Route path="/lessons/:id/edit" element={<LessonEditorPage />} /></Routes>
  </MemoryRouter></QueryClientProvider>);
  return client;
}
it('validates required fields without sending and schema enforces limits and levels', async () => {
  page('/lessons/new');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findAllByText('Este campo es obligatorio.')).toHaveLength(3);
  expect(saveLesson).not.toHaveBeenCalled();
  for (const [field, value] of [['title', 'x'.repeat(201)], ['topic', 'x'.repeat(201)], ['objective', 'x'.repeat(2001)], ['level', 'B3'], ['title', '   ']]) {
    expect(lessonSchema.safeParse({ ...detail, [field]: value }).success).toBe(false);
  }
  expect(lessonSchema.parse({ ...detail, title: '  Recortado  ' }).title).toBe('Recortado');
});
it('creates using trimmed metadata and opens the saved editor', async () => {
  vi.mocked(saveLesson).mockResolvedValue({ ...detail, title: 'Nueva' });
  page('/lessons/new');
  await userEvent.type(screen.getByLabelText('Título'), ' Nueva ');
  await userEvent.type(screen.getByLabelText('Tema'), ' Tema ');
  await userEvent.type(screen.getByLabelText('Objetivo'), ' Objetivo ');
  await userEvent.selectOptions(screen.getByLabelText('Nivel'), 'B1');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('heading', { name: 'Editar clase' })).toBeInTheDocument();
  expect(saveLesson).toHaveBeenCalledWith({ title: 'Nueva', level: 'B1', topic: 'Tema', objective: 'Objetivo' }, undefined);
});
it('retains dirty fields across refetch and failed save without automatic retry', async () => {
  const client = page();
  const title = await screen.findByLabelText('Título');
  await userEvent.clear(title); await userEvent.type(title, 'Borrador');
  client.setQueryData(lessonDetailKey('u1', 'l1'), { ...detail, title: 'Servidor' });
  expect(title).toHaveValue('Borrador');
  vi.mocked(saveLesson).mockRejectedValue(new Error('Error de guardado'));
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Error de guardado');
  expect(title).toHaveValue('Borrador');
  expect(saveLesson).toHaveBeenCalledTimes(1);
});
it('disables saving controls and clears dirty state only after success', async () => {
  let resolve!: (value: LessonDetails) => void;
  vi.mocked(saveLesson).mockReturnValue(new Promise((done) => { resolve = done; }));
  page();
  await userEvent.type(await screen.findByLabelText('Título'), ' editada');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  expect(screen.getByLabelText('Título')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Volver a Mis clases' })).toBeDisabled();
  resolve({ ...detail, title: 'Original editada' });
  expect(await screen.findByRole('status')).toHaveTextContent('Clase guardada.');
  const confirm = vi.spyOn(window, 'confirm');
  await userEvent.click(screen.getByRole('button', { name: 'Volver a Mis clases' }));
  expect(confirm).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Listado' })).toBeInTheDocument();
});
it('warns on controlled navigation and beforeunload, cancellation preserves fields', async () => {
  page();
  await userEvent.type(await screen.findByLabelText('Título'), ' local');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await userEvent.click(screen.getByRole('button', { name: 'Volver a Mis clases' }));
  await userEvent.click(screen.getByRole('link', { name: 'Inicio' }));
  expect(screen.getByLabelText('Título')).toHaveValue('Original local');
  expect(confirm).toHaveBeenCalledTimes(2);
  const unload = new Event('beforeunload', { cancelable: true });
  fireEvent(window, unload);
  expect(unload.defaultPrevented).toBe(true);
  confirm.mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Volver a Mis clases' }));
  expect(screen.getByRole('heading', { name: 'Listado' })).toBeInTheDocument();
  const cleanUnload = new Event('beforeunload', { cancelable: true });
  fireEvent(window, cleanUnload);
  expect(cleanUnload.defaultPrevented).toBe(false);
});
it('shows loading and unavailable error then permits retry', async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(getLesson).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  page();
  expect(screen.getByRole('status')).toHaveTextContent('Cargando clase…');
  reject(new Error('La clase no existe'));
  expect(await screen.findByRole('alert')).toHaveTextContent('La clase no existe');
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Original'));
});
