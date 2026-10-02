import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import AssignedLessons from './AssignedLessons';
import { assignLessonToStudent, unassignLessonFromStudent } from './student-api';
import type { StudentDetails } from './student-api';
import { listLessons } from '../lessons/lesson-api';
import type { LessonListItem } from '../lessons/lesson-api';

vi.mock('./student-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./student-api')>()),
  assignLessonToStudent: vi.fn(), unassignLessonFromStudent: vi.fn(),
}));
vi.mock('../lessons/lesson-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lessons/lesson-api')>()),
  listLessons: vi.fn(),
}));

const complete = { id: 'l1', title: 'Repaso B1', level: 'B1' as const, estimatedDuration: 45, inTrash: false, assignedAt: '2026-09-28T10:00:00Z' };
const incomplete = { id: 'l2', title: 'Sin terminar', level: 'A2' as const, estimatedDuration: null, inTrash: false, assignedAt: '2026-09-28T10:05:00Z' };
const trashed = { id: 'l3', title: 'Antigua', level: 'B2' as const, estimatedDuration: 30, inTrash: true, assignedAt: '2026-09-28T10:10:00Z' };
const candidate: LessonListItem = { id: 'l4', title: 'Futura', level: 'B1', topic: 'Tema', estimatedDuration: 20, updatedAt: '2026-09-28T09:00:00Z', deletedAt: null };

function student(assignedLessons: StudentDetails['assignedLessons']): StudentDetails {
  return {
    id: 's1', name: 'Alba', level: 'B1', interests: null, assignedLessonCount: assignedLessons.length,
    updatedAt: '2026-09-28T10:00:00Z', deletedAt: null, email: null, nativeLanguage: null,
    goals: null, notes: null, createdAt: '2026-09-01T10:00:00Z', assignedLessons,
  };
}

function page(assignedLessons: StudentDetails['assignedLessons'] = [complete], lessons: LessonListItem[] = []) {
  vi.mocked(listLessons).mockResolvedValue(lessons);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter>
    <AssignedLessons student={student(assignedLessons)} userId="u1" />
  </MemoryRouter></QueryClientProvider>);
  return client;
}

beforeEach(() => vi.resetAllMocks());

it('shows the title, the level and the duration of every assigned lesson', async () => {
  page([complete, incomplete]);
  expect(await screen.findByRole('heading', { name: 'Repaso B1' })).toBeInTheDocument();
  expect(screen.getByText('45 min')).toBeInTheDocument();
  // A lesson with an activity still missing a duration is never given an invented total.
  expect(screen.getByText('Duración incompleta')).toBeInTheDocument();
});

it('shows the empty state when the student has no lessons', async () => {
  page([]);
  expect(await screen.findByText('Este estudiante todavía no tiene clases asignadas.')).toBeInTheDocument();
  expect(screen.getByLabelText('Asignar clase')).toBeInTheDocument();
});

it('marks a trashed lesson and withholds the unassign action until it is restored', async () => {
  page([complete, trashed]);
  expect(await screen.findByTestId('trash-mark')).toHaveTextContent('En papelera');
  expect(screen.queryByRole('button', { name: 'Quitar asignación de Antigua' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Quitar asignación de Repaso B1' })).toBeInTheDocument();
});

it('unassigns without leaving the profile and without deleting the lesson', async () => {
  page([complete]);
  await userEvent.click(await screen.findByRole('button', { name: 'Quitar asignación de Repaso B1' }));
  await waitFor(() => expect(unassignLessonFromStudent).toHaveBeenCalledWith('s1', 'l1'));
  // The profile section is still on screen: the action never navigates.
  expect(screen.getByRole('heading', { name: 'Clases asignadas' })).toBeInTheDocument();
});

it('offers only active lessons that are not assigned yet', async () => {
  const alreadyAssigned: LessonListItem = { ...candidate, id: 'l1', title: 'Repaso B1' };
  page([complete], [candidate, alreadyAssigned]);
  await screen.findByRole('option', { name: 'Futura · B1' });
  // An assigned lesson is never offered again, so assigning cannot duplicate.
  expect(screen.queryByRole('option', { name: 'Repaso B1 · B1' })).not.toBeInTheDocument();
  // The placeholder plus the single free candidate.
  expect(screen.getAllByRole('option')).toHaveLength(2);
});

it('links to creating a lesson when there is no active candidate', async () => {
  page([]);
  expect(await screen.findByRole('link', { name: 'Crear clase' })).toHaveAttribute('href', '/lessons/new');
});

it('assigns the chosen lesson through the frozen transport', async () => {
  page([], [candidate]);
  await screen.findByRole('option', { name: 'Futura · B1' });
  await userEvent.selectOptions(screen.getByLabelText('Asignar clase'), 'l4');
  await waitFor(() => expect(assignLessonToStudent).toHaveBeenCalledWith('s1', 'l4'));
});

it('reports a rejected assignment and keeps the picker usable', async () => {
  page([], [candidate]);
  vi.mocked(assignLessonToStudent).mockRejectedValue(new Error('La clase está en papelera.'));
  await screen.findByRole('option', { name: 'Futura · B1' });
  await userEvent.selectOptions(screen.getByLabelText('Asignar clase'), 'l4');
  expect(await screen.findByText('La clase está en papelera.')).toBeInTheDocument();
});

it('leaves the row untouched and offers a retry when a network failure happens', async () => {
  page([complete]);
  vi.mocked(unassignLessonFromStudent).mockRejectedValue(new TypeError('Offline'));
  await userEvent.click(await screen.findByRole('button', { name: 'Quitar asignación de Repaso B1' }));
  // The lesson is still listed: the server never confirmed the removal.
  expect(screen.getByRole('heading', { name: 'Repaso B1' })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  expect(unassignLessonFromStudent).toHaveBeenCalledTimes(1);
});
