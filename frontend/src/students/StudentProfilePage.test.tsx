import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import StudentProfilePage from './StudentProfilePage';
import { getStudent, transitionStudent } from './student-api';
import type { StudentDetails } from './student-api';
import { useAuth } from '../auth';

vi.mock('./student-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./student-api')>()),
  getStudent: vi.fn(), transitionStudent: vi.fn(),
}));
vi.mock('../auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth')>()),
  useAuth: vi.fn(),
}));

const full: StudentDetails = {
  id: 's1', name: 'Alba', level: 'B1', interests: 'Ajedrez y cine', assignedLessonCount: 0,
  updatedAt: '2026-09-28T10:00:00Z', deletedAt: null,
  email: 'alba@example.com', nativeLanguage: 'Español', goals: 'Aprobar el B2', notes: 'Prefiere por la tarde',
  createdAt: '2026-09-01T10:00:00Z', assignedLessons: [],
};

function page() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/students/s1']}>
    <Routes><Route path="/students/:id" element={<StudentProfilePage />} />
      <Route path="/students" element={<p>Mis estudiantes</p>} /></Routes>
  </MemoryRouter></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', email: 'profe@example.com' } } as ReturnType<typeof useAuth>);
  vi.mocked(transitionStudent).mockResolvedValue();
});

it('shows every pedagogical field of the profile', async () => {
  vi.mocked(getStudent).mockResolvedValue(full);
  page();
  expect(await screen.findByRole('heading', { name: 'Alba' })).toBeInTheDocument();
  expect(screen.getByText('B1')).toBeInTheDocument();
  expect(screen.getByText('alba@example.com')).toBeInTheDocument();
  expect(screen.getByText('Español')).toBeInTheDocument();
  expect(screen.getByText('Ajedrez y cine')).toBeInTheDocument();
  expect(screen.getByText('Aprobar el B2')).toBeInTheDocument();
  expect(screen.getByText('Prefiere por la tarde')).toBeInTheDocument();
});

it('shows an absent optional as "Sin indicar", never as a blank field', async () => {
  vi.mocked(getStudent).mockResolvedValue({
    ...full, email: null, nativeLanguage: null, interests: null, goals: null, notes: null,
  });
  page();
  await screen.findByRole('heading', { name: 'Alba' });
  // One per absent optional: email, native language, interests, goals and notes.
  expect(screen.getAllByText('Sin indicar')).toHaveLength(5);
});

it('offers the way back to the listing and to editing', async () => {
  vi.mocked(getStudent).mockResolvedValue(full);
  page();
  // Wait for the loaded profile: the loading state also renders a way back to the listing.
  await screen.findByTestId('student-profile');
  expect(screen.getAllByRole('link', { name: 'Volver a Mis estudiantes' })[0]).toHaveAttribute('href', '/students');
  expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/students/s1/edit');
});

it('surfaces a missing student together with the way back to the listing', async () => {
  vi.mocked(getStudent).mockRejectedValue(new Error('El estudiante no existe o no está disponible.'));
  page();
  expect(await screen.findByText('El estudiante no existe o no está disponible.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Volver a Mis estudiantes' })).toHaveAttribute('href', '/students');
});

it('sends the student to the trash after the confirmation and returns to the listing', async () => {
  vi.mocked(getStudent).mockResolvedValue(full);
  const ask = vi.spyOn(window, 'confirm').mockReturnValue(true);
  page();
  await userEvent.click(await screen.findByRole('button', { name: 'Enviar a papelera' }));
  expect(ask).toHaveBeenCalled();
  expect(await screen.findByText('Mis estudiantes')).toBeInTheDocument();
  ask.mockRestore();
});
