import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import StudentsTrashPage from './StudentsTrashPage';
import { listStudents, transitionStudent } from './student-api';
import type { StudentListItem } from './student-api';
import { useAuth } from '../auth';

vi.mock('./student-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./student-api')>()),
  listStudents: vi.fn(), transitionStudent: vi.fn(),
}));
vi.mock('../auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth')>()),
  useAuth: vi.fn(),
}));

const trashed: StudentListItem = {
  id: 's1', name: 'Alba', level: 'B1', interests: null,
  assignedLessonCount: 2, updatedAt: '2026-09-28T10:00:00Z', deletedAt: '2026-09-28T11:00:00Z',
};

function page(items: StudentListItem[] = [trashed]) {
  vi.mocked(listStudents).mockResolvedValue(items);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter>
    <StudentsTrashPage />
  </MemoryRouter></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', email: 'profe@example.com' } } as ReturnType<typeof useAuth>);
  vi.mocked(transitionStudent).mockResolvedValue();
});

it('reads the trash state, not the active listing', async () => {
  page();
  await screen.findByRole('link', { name: 'Alba' });
  await waitFor(() => expect(listStudents).toHaveBeenCalledWith({ search: '', level: '' }, expect.anything(), 'trash'));
});

it('restores a student after the confirmation', async () => {
  const ask = vi.spyOn(window, 'confirm').mockReturnValue(true);
  page();
  await userEvent.click(await screen.findByRole('button', { name: 'Restaurar Alba' }));
  await waitFor(() => expect(transitionStudent).toHaveBeenCalledWith('s1', 'restore'));
  ask.mockRestore();
});

it('deletes definitively only when the confirmation is accepted', async () => {
  const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
  page();
  await userEvent.click(await screen.findByRole('button', { name: 'Eliminar definitivamente Alba' }));
  expect(transitionStudent).not.toHaveBeenCalled();
  ask.mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente Alba' }));
  await waitFor(() => expect(transitionStudent).toHaveBeenCalledWith('s1', 'delete'));
  ask.mockRestore();
});

it('shows the empty trash message and the link back to the active listing', async () => {
  page([]);
  expect(await screen.findByText('La papelera está vacía.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Volver a Mis estudiantes' })).toHaveAttribute('href', '/students');
});
