import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';
import ActivityList from './ActivityList';
import type { ActivityDraft } from './lesson-schema';

const speaking = (key: string, title: string, duration: number | null): ActivityDraft =>
  ({ key, id: null, type: 'Speaking', title, instructions: 'Instrucciones', duration, content: { questionsList: ['Pregunta'] } });
const reading = (key: string, title: string, duration: number | null): ActivityDraft =>
  ({ key, id: null, type: 'Reading', title, instructions: 'Instrucciones', duration, content: { text: 'Texto', questionsList: ['Pregunta'] } });
const writing = (key: string, title: string, duration: number | null): ActivityDraft =>
  ({ key, id: null, type: 'Writing', title, instructions: 'Instrucciones', duration, content: { prompt: 'Consigna' } });

const activities: ActivityDraft[] = [speaking('k1', 'Primera', 10), reading('k2', 'Segunda', 15), writing('k3', '', null)];

function list(overrides: Partial<ComponentProps<typeof ActivityList>> = {}) {
  return <ActivityList activities={activities} selectedKey="k1" errors={{}} onSelect={vi.fn()} onRemove={vi.fn()} onMove={vi.fn()} {...overrides} />;
}

it('renders the draft in order and reports the selection without mutating the draft', async () => {
  const onSelect = vi.fn();
  render(list({ onSelect }));
  const items = screen.getAllByRole('button', { pressed: false });
  expect(items).toHaveLength(2);
  expect(screen.getByRole('button', { pressed: true })).toHaveTextContent('1PrimeraSpeaking10 min');
  // The activity without a title and without a duration is shown as incomplete, never as 0 min.
  expect(screen.getByText('Actividad sin título')).toBeInTheDocument();
  expect(screen.getByText('Sin duración')).toBeInTheDocument();
  await userEvent.click(items[1]);
  expect(onSelect).toHaveBeenCalledWith('k3');
  expect(activities.map((activity) => activity.title)).toEqual(['Primera', 'Segunda', '']);
});

it('marks an activity with errors even when it is not the selected one', () => {
  render(list({ errors: { k3: 'Indica la duración en minutos.' } }));
  const failed = screen.getByRole('button', { name: /^Actividad sin título/ });
  expect(failed).toHaveAccessibleDescription('Indica la duración en minutos.');
  expect(screen.getByText('Indica la duración en minutos.')).toBeInTheDocument();
  expect(failed).toHaveAttribute('aria-pressed', 'false');
});

it('disables Up on the first activity and Down on the last one', () => {
  render(list());
  expect(screen.getByRole('button', { name: 'Subir Primera' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Subir Segunda' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Bajar Actividad sin título' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Bajar Segunda' })).toBeEnabled();
});

it('reorders with the pointer and with the keyboard without writing anything', async () => {
  const onMove = vi.fn();
  render(list({ onMove }));
  await userEvent.click(screen.getByRole('button', { name: 'Subir Segunda' }));
  expect(onMove).toHaveBeenLastCalledWith('k2', -1);
  await userEvent.click(screen.getByRole('button', { name: 'Bajar Primera' }));
  expect(onMove).toHaveBeenLastCalledWith('k1', 1);
  // Same controls, no mouse: focus and activate with the keyboard.
  screen.getByRole('button', { name: 'Bajar Primera' }).focus();
  await userEvent.keyboard('{Enter}');
  expect(onMove).toHaveBeenLastCalledWith('k1', 1);
  screen.getByRole('button', { name: 'Subir Segunda' }).focus();
  await userEvent.keyboard(' ');
  expect(onMove).toHaveBeenLastCalledWith('k2', -1);
  expect(onMove).toHaveBeenCalledTimes(4);
  expect(activities.map((activity) => activity.key)).toEqual(['k1', 'k2', 'k3']);
});

it('covers the extremes of the list and offers an empty state', async () => {
  const onRemove = vi.fn();
  const { unmount } = render(list({ activities: [activities[0]], selectedKey: null, onRemove }));
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Subir Primera' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Bajar Primera' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Quitar Primera' }));
  expect(onRemove).toHaveBeenCalledWith('k1');
  unmount();
  render(list({ activities: [], selectedKey: null }));
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  expect(screen.getByText(/todavía no tiene actividades/)).toBeInTheDocument();
});
