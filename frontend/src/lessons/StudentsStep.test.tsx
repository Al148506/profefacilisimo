import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import StudentsStep from './StudentsStep';
import type { AssignedStudent, StudentListItem } from '../students/student-api';

const ana: AssignedStudent = { id: 's1', name: 'Ana', level: 'A2', inTrash: false, assignedAt: '2026-09-17' };
const carla: StudentListItem = { id: 's2', name: 'Carla', level: 'B2', interests: null, assignedLessonCount: 0, updatedAt: '2026-09-17', deletedAt: null };

function renderStep(overrides: Partial<Parameters<typeof StudentsStep>[0]> = {}) {
  const props = {
    selected: [] as AssignedStudent[],
    candidates: [] as StudentListItem[],
    loading: false,
    loadError: false,
    onRetry: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  render(<MemoryRouter><StudentsStep {...props} /></MemoryRouter>);
  return props;
}

it('announces the loading state and keeps the picker closed while students arrive', () => {
  renderStep({ loading: true });
  expect(screen.getByRole('status')).toHaveTextContent('Cargando estudiantes…');
  expect(screen.getByLabelText('Asignar estudiante')).toBeDisabled();
  expect(screen.queryByTestId('students-empty')).not.toBeInTheDocument();
});

it('offers a retry when the students could not be loaded', async () => {
  const props = renderStep({ loadError: true });
  expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los estudiantes.');
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar estudiantes' }));
  expect(props.onRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Asignar estudiante')).toBeDisabled();
});

it('names the empty selection and the way out when there are no candidates', () => {
  renderStep();
  expect(screen.getByTestId('students-empty')).toBeInTheDocument();
  expect(screen.getByText(/No tienes estudiantes activos/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Crear estudiante' })).toBeInTheDocument();
});

it('stages a pick from the candidate list without ever calling the server itself', async () => {
  const props = renderStep({ candidates: [carla] });
  await userEvent.selectOptions(screen.getByLabelText('Asignar estudiante'), 's2');
  expect(props.onAdd).toHaveBeenCalledWith('s2');
});

it('lists the selection with a removal per student and hands the id back on click', async () => {
  const props = renderStep({ selected: [ana] });
  expect(screen.getByRole('link', { name: 'Ana' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Quitar a Ana' }));
  expect(props.onRemove).toHaveBeenCalledWith('s1');
});

it('marks a trashed student and withholds its removal', () => {
  const props = renderStep({ selected: [{ ...ana, inTrash: true }] });
  expect(screen.getByTestId('trash-mark')).toHaveTextContent('En papelera');
  // The pair cannot be staged out while the student lives in the trash: no button, an explanation.
  expect(screen.queryByRole('button', { name: 'Quitar a Ana' })).not.toBeInTheDocument();
  expect(props.onRemove).not.toHaveBeenCalled();
});

it('links to the student profile without touching the staging controls', () => {
  renderStep({ selected: [ana] });
  expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/students/s1');
});
