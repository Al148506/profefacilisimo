import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ActivityForm, { type ActivityFieldErrors } from './ActivityForm';
import type { ActivityDraft } from './lesson-schema';

const base = { id: null, title: 'Actividad', instructions: 'Instrucciones', duration: 10 };

const speaking: ActivityDraft = { ...base, key: 'a1', type: 'Speaking', content: { questionsList: ['¿Qué tal?'] } };
const reading: ActivityDraft = { ...base, key: 'a2', type: 'Reading', content: { text: 'Un texto', questionsList: ['Pregunta'] } };
const writing: ActivityDraft = { ...base, key: 'a3', type: 'Writing', content: { prompt: 'Escribe' } };
const vocabulary: ActivityDraft = { ...base, key: 'a4', type: 'VocabularyGrammar', content: { explanation: 'Ser y estar', exercises: ['Uno', 'Dos'] } };

// The form is controlled by the editor, so the harness is what really proves the round trip: every
// change the form reports is fed back into it, exactly as LessonEditorPage does.
const onChange = vi.fn();
function Harness({ initial, errors = {} }: { initial: ActivityDraft; errors?: ActivityFieldErrors }) {
  const [activity, setActivity] = useState(initial);
  return <ActivityForm activity={activity} errors={errors}
    onChange={(next) => { onChange(next); setActivity(next); }} />;
}

beforeEach(() => onChange.mockClear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('shows the fields of each type and hides the others', () => {
  render(<Harness initial={speaking} />);
  expect(screen.getByLabelText('Pregunta 1')).toHaveValue('¿Qué tal?');
  expect(screen.queryByLabelText('Texto de lectura')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Consigna')).not.toBeInTheDocument();
  cleanup();
  render(<Harness initial={reading} />);
  expect(screen.getByLabelText('Texto de lectura')).toHaveValue('Un texto');
  expect(screen.getByLabelText('Pregunta 1')).toBeInTheDocument();
  cleanup();
  render(<Harness initial={writing} />);
  expect(screen.getByLabelText('Consigna')).toHaveValue('Escribe');
  expect(screen.queryByLabelText('Pregunta 1')).not.toBeInTheDocument();
  cleanup();
  render(<Harness initial={vocabulary} />);
  expect(screen.getByLabelText('Explicación')).toHaveValue('Ser y estar');
  expect(screen.getByLabelText('Ejercicio 1')).toHaveValue('Uno');
  expect(screen.getByLabelText('Ejercicio 2')).toHaveValue('Dos');
  expect(screen.queryByLabelText('Consigna')).not.toBeInTheDocument();
});

it('adds and removes rows locally without writing anything', async () => {
  const { unmount } = render(<Harness initial={vocabulary} />);
  await userEvent.click(screen.getByRole('button', { name: 'Añadir ejercicio' }));
  expect(onChange).toHaveBeenLastCalledWith({ ...vocabulary, content: { explanation: 'Ser y estar', exercises: ['Uno', 'Dos', ''] } });
  expect(screen.getByLabelText('Ejercicio 3')).toHaveValue('');
  await userEvent.click(screen.getByRole('button', { name: 'Quitar ejercicio 1' }));
  expect(onChange).toHaveBeenLastCalledWith({ ...vocabulary, content: { explanation: 'Ser y estar', exercises: ['Dos', ''] } });
  expect(screen.getAllByLabelText(/^Ejercicio/)).toHaveLength(2);
  unmount();
  // The last remaining row cannot be removed: an activity always keeps at least one.
  render(<Harness initial={writing} />);
  expect(screen.queryByRole('button', { name: /Quitar/ })).not.toBeInTheDocument();
});

it('requires a duration and reports it on the exact field', async () => {
  const { unmount } = render(<Harness initial={{ ...writing, duration: null }} />);
  const duration = screen.getByLabelText('Duración (minutos)');
  expect(duration).toHaveValue(null);
  await userEvent.type(duration, '15');
  expect(onChange).toHaveBeenLastCalledWith({ ...writing, duration: 15 });
  await userEvent.clear(duration);
  expect(onChange).toHaveBeenLastCalledWith({ ...writing, duration: null });
  unmount();
  render(<Harness initial={writing} errors={{ duration: 'Indica la duración en minutos.' }} />);
  expect(screen.getByLabelText('Duración (minutos)')).toHaveAccessibleDescription('Indica la duración en minutos.');
  expect(screen.getByText('Indica la duración en minutos.')).toBeInTheDocument();
});

it('asks before discarding specific content when the type changes', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<Harness initial={reading} />);
  const select = screen.getByLabelText('Tipo');
  await userEvent.selectOptions(select, 'Writing');
  expect(onChange).not.toHaveBeenCalled();
  expect(confirm).toHaveBeenCalledTimes(1);
  // Cancelling leaves the type and every field exactly as they were.
  expect(select).toHaveValue('Reading');
  expect(screen.getByLabelText('Texto de lectura')).toHaveValue('Un texto');
  expect(screen.getByLabelText('Pregunta 1')).toHaveValue('Pregunta');
  confirm.mockReturnValue(true);
  await userEvent.selectOptions(select, 'Writing');
  // Confirming keeps Id, title, instructions and duration and empties only the specific content.
  expect(onChange).toHaveBeenLastCalledWith({
    key: 'a2', id: null, title: 'Actividad', instructions: 'Instrucciones', duration: 10,
    type: 'Writing', content: { prompt: '' },
  });
  expect(screen.getByLabelText('Consigna')).toHaveValue('');
  expect(confirm).toHaveBeenCalledTimes(2);
  cleanup();
  // Without specific content there is nothing to discard, so no confirmation is shown.
  const empty: ActivityDraft = { ...base, key: 'a5', duration: null, type: 'Writing', content: { prompt: '' } };
  const clean = vi.spyOn(window, 'confirm').mockClear().mockReturnValue(false);
  render(<Harness initial={empty} />);
  await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Speaking');
  expect(clean).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenLastCalledWith({ ...empty, type: 'Speaking', content: { questionsList: [''] } });
});
