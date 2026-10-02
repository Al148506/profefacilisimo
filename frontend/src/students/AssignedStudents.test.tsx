import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import AssignedStudents from './AssignedStudents';
import { assignStudentToLesson, listAssignedStudents, listStudents, unassignStudentFromLesson } from './student-api';
import type { AssignedStudent, StudentListItem } from './student-api';

vi.mock('./student-api', () => ({
  listAssignedStudents: vi.fn(), listStudents: vi.fn(),
  assignStudentToLesson: vi.fn(), unassignStudentFromLesson: vi.fn(),
}));

const alba: AssignedStudent = { id: 's1', name: 'Alba', level: 'B1', inTrash: false, assignedAt: '2026-09-28T10:00:00Z' };
const bruno: AssignedStudent = { id: 's2', name: 'Bruno', level: 'A2', inTrash: true, assignedAt: '2026-09-28T10:05:00Z' };
const carla: StudentListItem = { id: 's3', name: 'Carla', level: 'B2', interests: null, assignedLessonCount: 0, updatedAt: '2026-09-28T09:00:00Z', deletedAt: null };

/**
 * The listing and mutation doubles are stateful on purpose: a real server returns the assignment it
 * has just stored or removed, so a frozen list would contradict the contract and make the
 * component's refetch wipe the new row. Only the transport is simulated; the export names and
 * shapes stay as frozen in C3. A test that needs a specific failure calls page() first and then
 * overrides the mock it cares about.
 */
function page(assigned: AssignedStudent[] = [], active: StudentListItem[] = []) {
  let current = [...assigned];
  vi.mocked(listAssignedStudents).mockImplementation(async () => [...current]);
  vi.mocked(assignStudentToLesson).mockImplementation(async (_lessonId, studentId) => {
    const source = active.find((student) => student.id === studentId) ?? carla;
    const stored: AssignedStudent = {
      id: source.id, name: source.name, level: source.level, inTrash: source.deletedAt !== null,
      assignedAt: '2026-09-28T10:10:00Z',
    };
    current = current.some((student) => student.id === stored.id) ? current : [...current, stored];
    return stored;
  });
  vi.mocked(unassignStudentFromLesson).mockImplementation(async (_lessonId, studentId) => {
    current = current.filter((student) => student.id !== studentId);
  });
  vi.mocked(listStudents).mockResolvedValue(active);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter>
    <AssignedStudents lessonId="l1" userId="u1" />
  </MemoryRouter></QueryClientProvider>);
  return client;
}

beforeEach(() => vi.resetAllMocks());

it('renders the assigned students with their level and links each one to the profile', async () => {
  page([alba]);
  expect(await screen.findByRole('link', { name: 'Alba' })).toHaveAttribute('href', '/students/s1');
  expect(screen.getByText('B1')).toBeInTheDocument();
  expect(screen.getByTestId('assigned-students')).toBeInTheDocument();
});

it('shows the empty state with the assign action when no student is assigned', async () => {
  page([], [carla]);
  expect(await screen.findByText('Esta clase todavía no tiene estudiantes asignados.')).toBeInTheDocument();
  expect(screen.getByLabelText('Asignar estudiante')).toBeInTheDocument();
});

it('offers only active students that are not assigned yet', async () => {
  const dora: StudentListItem = { ...carla, id: 's4', name: 'Dora' };
  const brunoActive: StudentListItem = { id: 's2', name: 'Bruno', level: 'A2', interests: null, assignedLessonCount: 1, updatedAt: '2026-09-28T09:00:00Z', deletedAt: null };
  page([bruno], [carla, dora, brunoActive]);
  await screen.findByRole('option', { name: 'Carla · B2' });
  // Bruno is assigned (and trashed): he is never offered again, so assigning cannot duplicate.
  expect(screen.queryByRole('option', { name: 'Bruno · A2' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('option')).toHaveLength(3);
});

it('links to creating a student when there is no active candidate', async () => {
  page([]);
  expect(await screen.findByRole('link', { name: 'Crear estudiante' })).toHaveAttribute('href', '/students/new');
});

it('assigns the chosen student without touching the lesson draft', async () => {
  page([], [carla]);
  // The label exists before the candidates load, so wait for the option itself, not for the select.
  await screen.findByRole('option', { name: 'Carla · B2' });
  await userEvent.selectOptions(screen.getByLabelText('Asignar estudiante'), 's3');
  await waitFor(() => expect(assignStudentToLesson).toHaveBeenCalledWith('l1', 's3'));
  expect(await screen.findByRole('link', { name: 'Carla' })).toBeInTheDocument();
});

it('removes an assignment without leaving or deleting the student', async () => {
  page([alba]);
  await userEvent.click(await screen.findByRole('button', { name: 'Quitar asignación de Alba' }));
  await waitFor(() => expect(unassignStudentFromLesson).toHaveBeenCalledWith('l1', 's1'));
  expect(screen.getByRole('heading', { name: 'Estudiantes asignados' })).toBeInTheDocument();
});

it('marks a trashed student and withholds the unassign action until it is restored', async () => {
  page([alba, bruno]);
  const mark = await screen.findByTestId('trash-mark');
  expect(mark).toHaveTextContent('En papelera');
  expect(screen.queryByRole('button', { name: 'Quitar asignación de Bruno' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Quitar asignación de Alba' })).toBeInTheDocument();
});

it('leaves the screen untouched and offers a retry when a network failure happens', async () => {
  page([alba]);
  vi.mocked(unassignStudentFromLesson).mockRejectedValue(new TypeError('Offline'));
  await userEvent.click(await screen.findByRole('button', { name: 'Quitar asignación de Alba' }));
  // The assignment is not reflected as removed: the server never confirmed it.
  expect(await screen.findByRole('link', { name: 'Alba' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  expect(unassignStudentFromLesson).toHaveBeenCalledTimes(1);
});

it('reports a rejected assignment and keeps the picker usable', async () => {
  page([], [carla]);
  vi.mocked(assignStudentToLesson).mockRejectedValue(new Error('El estudiante está en papelera.'));
  await screen.findByRole('option', { name: 'Carla · B2' });
  await userEvent.selectOptions(screen.getByLabelText('Asignar estudiante'), 's3');
  expect(await screen.findByText('El estudiante está en papelera.')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Carla' })).not.toBeInTheDocument();
});
