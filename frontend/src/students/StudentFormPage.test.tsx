import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import StudentFormPage from './StudentFormPage';
import { getStudent, saveStudent } from './student-api';
import type { StudentDetails } from './student-api';
import { useAuth } from '../auth';

vi.mock('./student-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./student-api')>()),
  getStudent: vi.fn(), saveStudent: vi.fn(),
}));
vi.mock('../auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth')>()),
  useAuth: vi.fn(),
}));

const details: StudentDetails = {
  id: 's1', name: 'Alba', level: 'B1', interests: 'Ajedrez', assignedLessonCount: 0,
  updatedAt: '2026-09-28T10:00:00Z', deletedAt: null,
  email: 'alba@example.com', nativeLanguage: 'Español', goals: 'Aprobar el B2', notes: null,
  createdAt: '2026-09-01T10:00:00Z', assignedLessons: [],
};

function page(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/students/new" element={<StudentFormPage />} />
      <Route path="/students/:id/edit" element={<StudentFormPage />} />
      <Route path="/students/:id" element={<p>Ficha</p>} />
    </Routes>
  </MemoryRouter></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', email: 'profe@example.com' } } as ReturnType<typeof useAuth>);
});

it('creates a student, sending nulls for the untouched optionals', async () => {
  vi.mocked(saveStudent).mockResolvedValue(details);
  page('/students/new');
  expect(await screen.findByRole('heading', { name: 'Crear estudiante' })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Nombre'), 'Alba');
  await userEvent.selectOptions(screen.getByLabelText('Nivel'), 'B1');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(saveStudent).toHaveBeenCalledWith(
    { name: 'Alba', level: 'B1', email: null, nativeLanguage: null, interests: null, goals: null, notes: null },
    undefined));
});

it('loads the current profile, edits a field and writes only on confirm', async () => {
  vi.mocked(getStudent).mockResolvedValue(details);
  vi.mocked(saveStudent).mockResolvedValue({ ...details, name: 'Alba María' });
  page('/students/s1/edit');
  expect(await screen.findByRole('heading', { name: 'Editar estudiante' })).toBeInTheDocument();
  // The form is filled from the profile, including the optional fields.
  expect(screen.getByLabelText('Nombre')).toHaveValue('Alba');
  expect(screen.getByLabelText('Correo')).toHaveValue('alba@example.com');
  expect(screen.getByLabelText('Notas')).toHaveValue('');
  expect(saveStudent).not.toHaveBeenCalled();
  await userEvent.clear(screen.getByLabelText('Nombre'));
  await userEvent.type(screen.getByLabelText('Nombre'), 'Alba María');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(saveStudent).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Alba María' }), 's1'));
});

it('never writes when the name or the level is missing', async () => {
  page('/students/new');
  await screen.findByRole('heading', { name: 'Crear estudiante' });
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('Este campo es obligatorio.')).toBeInTheDocument();
  expect(saveStudent).not.toHaveBeenCalled();
  // A whitespace-only name is empty after trimming, so it is still not written.
  await userEvent.type(screen.getByLabelText('Nombre'), '   ');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(saveStudent).not.toHaveBeenCalled();
});

it('rejects a malformed email without writing', async () => {
  page('/students/new');
  await screen.findByRole('heading', { name: 'Crear estudiante' });
  await userEvent.type(screen.getByLabelText('Nombre'), 'Alba');
  await userEvent.type(screen.getByLabelText('Correo'), 'nope');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('Escribe un correo válido.')).toBeInTheDocument();
  expect(saveStudent).not.toHaveBeenCalled();
});

it('marks the exact field the server rejected without discarding the input', async () => {
  const { StudentSaveError } = await import('./student-api');
  vi.mocked(saveStudent).mockRejectedValue(new StudentSaveError('Rechazado', { email: ['Ese correo no vale.'] }));
  page('/students/new');
  await screen.findByRole('heading', { name: 'Crear estudiante' });
  await userEvent.type(screen.getByLabelText('Nombre'), 'Alba');
  await userEvent.type(screen.getByLabelText('Intereses'), 'Ajedrez');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('Ese correo no vale.')).toBeInTheDocument();
  // What was typed is still there.
  expect(screen.getByLabelText('Nombre')).toHaveValue('Alba');
  expect(screen.getByLabelText('Intereses')).toHaveValue('Ajedrez');
});
