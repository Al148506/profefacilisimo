import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import StudentsPage from './StudentsPage';
import { listStudents, transitionStudent } from './student-api';
import type { StudentListItem } from './student-api';
import type { User } from '../auth';

vi.mock('./student-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./student-api')>()),
  listStudents: vi.fn(), transitionStudent: vi.fn(),
}));

const user: User = { id: 'u1', email: 'profe@example.com' };

const alba: StudentListItem = {
  id: 's1', name: 'Alba', level: 'B1', interests: 'Ajedrez y cine',
  assignedLessonCount: 2, updatedAt: '2026-09-28T10:00:00Z', deletedAt: null,
};
const bruno: StudentListItem = {
  id: 's2', name: 'Bruno', level: 'A2', interests: null,
  assignedLessonCount: 0, updatedAt: '2026-09-27T10:00:00Z', deletedAt: null,
};

function page(items: StudentListItem[] = [], trash = false) {
  vi.mocked(listStudents).mockResolvedValue(items);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter>
    <StudentsPage user={user} trash={trash} />
  </MemoryRouter></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(transitionStudent).mockResolvedValue();
});

it('shows the name, the level, the interests summary and the assigned lesson count', async () => {
  page([alba, bruno]);
  expect(await screen.findByRole('link', { name: 'Alba' })).toHaveAttribute('href', '/students/s1');
  // Scoped to the badge: the level filter also renders a "B1" option.
  expect(screen.getAllByText('B1').some((node) => node.classList.contains('level-badge'))).toBe(true);
  expect(screen.getByText('Ajedrez y cine')).toBeInTheDocument();
  expect(screen.getByText('2 clases asignadas')).toBeInTheDocument();
  // A student with no interests says so instead of showing a blank line.
  expect(screen.getByText('Sin indicar')).toBeInTheDocument();
  expect(screen.getByText('0 clases asignadas')).toBeInTheDocument();
});

it('counts one assigned lesson in the singular', async () => {
  page([{ ...alba, assignedLessonCount: 1 }]);
  expect(await screen.findByText('1 clase asignada')).toBeInTheDocument();
});

it('combines the search and the level filter into a single listing request', async () => {
  page([alba]);
  await screen.findByRole('link', { name: 'Alba' });
  await userEvent.type(screen.getByLabelText('Buscar por nombre o intereses'), '  Alba  ');
  await userEvent.selectOptions(screen.getByLabelText('Nivel'), 'B2');
  await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  await waitFor(() => expect(listStudents).toHaveBeenLastCalledWith({ search: 'Alba', level: 'B2' }, expect.anything(), 'active'));
});

it('offers to create the first student when the listing is empty', async () => {
  page([]);
  expect(await screen.findByText('Aún no tienes estudiantes.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Crear estudiante' })).toHaveAttribute('href', '/students/new');
});

it('offers to clear the filters when the filtered listing is empty, and restores the full list', async () => {
  page([]);
  await screen.findByText('Aún no tienes estudiantes.');
  await userEvent.type(screen.getByLabelText('Buscar por nombre o intereses'), 'nadie');
  await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  expect(await screen.findByText('No hay estudiantes que coincidan con estos filtros.')).toBeInTheDocument();
  vi.mocked(listStudents).mockResolvedValue([alba]);
  await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  expect(await screen.findByRole('link', { name: 'Alba' })).toBeInTheDocument();
  await waitFor(() => expect(listStudents).toHaveBeenLastCalledWith({ search: '', level: '' }, expect.anything(), 'active'));
});

it('navigates to the profile and to editing from each row', async () => {
  page([alba]);
  expect(await screen.findByRole('link', { name: 'Ver ficha' })).toHaveAttribute('href', '/students/s1');
  expect(screen.getByRole('link', { name: 'Editar Alba' })).toHaveAttribute('href', '/students/s1/edit');
});

it('sends a student to the trash only after the confirmation is accepted', async () => {
  page([alba]);
  const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await userEvent.click(await screen.findByRole('button', { name: 'Enviar a papelera Alba' }));
  expect(transitionStudent).not.toHaveBeenCalled();
  ask.mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Enviar a papelera Alba' }));
  await waitFor(() => expect(transitionStudent).toHaveBeenCalledWith('s1', 'trash'));
  ask.mockRestore();
});

it('lists the trash with restore and definitive delete, and asks before deleting', async () => {
  page([alba], true);
  await screen.findByRole('link', { name: 'Alba' });
  // The trash never offers the active actions.
  expect(screen.queryByRole('link', { name: 'Editar Alba' })).not.toBeInTheDocument();
  const ask = vi.spyOn(window, 'confirm').mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Restaurar Alba' }));
  await waitFor(() => expect(transitionStudent).toHaveBeenCalledWith('s1', 'restore'));
  await userEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente Alba' }));
  await waitFor(() => expect(transitionStudent).toHaveBeenCalledWith('s1', 'delete'));
  expect(ask).toHaveBeenCalledTimes(2);
  ask.mockRestore();
});

it('shows the empty trash message without the filters form', async () => {
  page([], true);
  expect(await screen.findByText('La papelera está vacía.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Buscar por nombre o intereses')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Volver a Mis estudiantes' })).toHaveAttribute('href', '/students');
});

it('reports a listing failure with a retry that refetches', async () => {
  vi.mocked(listStudents).mockRejectedValueOnce(new TypeError('Offline'));
  page();
  expect(await screen.findByText('No pudimos cargar tus estudiantes.')).toBeInTheDocument();
  vi.mocked(listStudents).mockResolvedValue([alba]);
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar estudiantes' }));
  expect(await screen.findByRole('link', { name: 'Alba' })).toBeInTheDocument();
});
