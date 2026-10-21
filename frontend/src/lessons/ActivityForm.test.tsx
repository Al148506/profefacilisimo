import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ActivityForm, { type ActivityFieldErrors } from './ActivityForm';
import type { ActivityDraft } from './lesson-schema';

const base = { id: null, title: 'Actividad', instructions: 'Instrucciones', duration: 10 };

const speaking: ActivityDraft = { ...base, key: 'a1', type: 'Speaking', content: { subtype: 'conversation', questionsText: '¿Qué tal?' } };
const roleplay: ActivityDraft = {
  ...base, key: 'a6', type: 'Speaking',
  content: {
    subtype: 'roleplay', context: 'Cena en un restaurante',
    roles: [{ name: 'Waiter', description: 'Toma el pedido' }, { name: 'Customer', description: '' }],
    objective: '', material: '', script: '', practiceMode: 'guided',
  },
};
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
  expect(screen.getByLabelText('Preguntas (una por línea)')).toHaveValue('¿Qué tal?');
  expect(screen.queryByLabelText('Pregunta 1')).not.toBeInTheDocument();
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
  expect(onChange).toHaveBeenLastCalledWith({ ...empty, type: 'Speaking', content: { subtype: 'conversation', questionsText: '' } });
});

it('writes conversation questions as one block, one per line', async () => {
  render(<Harness initial={speaking} />);
  const block = screen.getByLabelText('Preguntas (una por línea)');
  expect(block).toHaveValue('¿Qué tal?');
  await userEvent.type(block, '{enter}{enter}¿De dónde eres?');
  expect(onChange).toHaveBeenLastCalledWith({
    ...speaking,
    content: { subtype: 'conversation', questionsText: '¿Qué tal?\n\n¿De dónde eres?' },
  });
});

it('adds reading questions in bulk, one per line, dropping blank lines', async () => {
  render(<Harness initial={reading} />);
  await userEvent.click(screen.getByRole('button', { name: 'Añadir en bloque' }));
  await userEvent.type(screen.getByLabelText('preguntas (una por línea)'), '¿Cómo te llamas?{enter}{enter}¿De dónde eres?');
  expect(screen.getByText('2 preguntas para añadir.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Añadir 2 preguntas' }));
  expect(onChange).toHaveBeenLastCalledWith({
    ...reading,
    content: { text: 'Un texto', questionsList: ['Pregunta', '¿Cómo te llamas?', '¿De dónde eres?'] },
  });
  // The rows are ordinary again: reorderable and removable one by one, and the panel closed empty.
  expect(screen.getByLabelText('Pregunta 2')).toHaveValue('¿Cómo te llamas?');
  expect(screen.queryByLabelText('preguntas (una por línea)')).not.toBeInTheDocument();
});

it('shows only the fields of the selected speaking subtype', async () => {
  render(<Harness initial={speaking} />);
  expect(screen.getByLabelText('Tipo de práctica oral')).toHaveValue('conversation');
  expect(screen.getByLabelText('Preguntas (una por línea)')).toBeInTheDocument();
  expect(screen.queryByLabelText('Guion de conversación (opcional)')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Tema')).not.toBeInTheDocument();
  cleanup();
  render(<Harness initial={roleplay} />);
  expect(screen.getByLabelText('Tipo de práctica oral')).toHaveValue('roleplay');
  expect(screen.getByLabelText('Situación o contexto')).toHaveValue('Cena en un restaurante');
  expect(screen.getByLabelText('Rol 1 — Nombre')).toHaveValue('Waiter');
  expect(screen.getByLabelText('Rol 1 — Descripción (opcional)')).toHaveValue('Toma el pedido');
  expect(screen.getByLabelText('Rol 2 — Nombre')).toHaveValue('Customer');
  // The optional objective, material and script sit in the advanced section, closed while blank.
  expect(screen.queryByLabelText('Guion de conversación (opcional)')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Opciones avanzadas/ }));
  expect(screen.getByLabelText('Guion de conversación (opcional)')).toBeInTheDocument();
  expect(screen.queryByLabelText('Pregunta 1')).not.toBeInTheDocument();
});

it('drops the practice-mode picker and derives the mode from the script', async () => {
  render(<Harness initial={roleplay} />);
  expect(screen.queryByText('Modo de práctica')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Con guion')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Opciones avanzadas/ }));
  // Writing the script turns the mode scripted; the teacher never chooses it.
  await userEvent.type(screen.getByLabelText('Guion de conversación (opcional)'), 'A: Hola');
  expect(onChange).toHaveBeenLastCalledWith({
    ...roleplay,
    content: { ...roleplay.content, script: 'A: Hola', practiceMode: 'scripted' },
  });
});

it('asks before discarding meaningful roleplay content when the subtype changes, and cancels without loss', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<Harness initial={roleplay} />);
  const select = screen.getByLabelText('Tipo de práctica oral');
  await userEvent.selectOptions(select, 'presentation');
  // The roleplay holds a context and a named role: meaningful content, so the change is confirmed.
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(select).toHaveValue('roleplay');
  expect(screen.getByLabelText('Situación o contexto')).toHaveValue('Cena en un restaurante');
  expect(screen.getByLabelText('Rol 1 — Nombre')).toHaveValue('Waiter');
  confirm.mockReturnValue(true);
  await userEvent.selectOptions(select, 'conversation');
  expect(onChange).toHaveBeenLastCalledWith({
    key: 'a6', id: null, title: 'Actividad', instructions: 'Instrucciones', duration: 10,
    type: 'Speaking', content: { subtype: 'conversation', questionsText: '' },
  });
  expect(screen.getByLabelText('Preguntas (una por línea)')).toHaveValue('');
});

it('switches subtypes silently while everything is still blank', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockClear().mockReturnValue(false);
  const fresh: ActivityDraft = { ...base, key: 'a7', duration: null, type: 'Speaking', content: { subtype: 'conversation', questionsText: '' } };
  render(<Harness initial={fresh} />);
  const select = screen.getByLabelText('Tipo de práctica oral');
  await userEvent.selectOptions(select, 'roleplay');
  expect(confirm).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenLastCalledWith({
    key: 'a7', id: null, title: 'Actividad', instructions: 'Instrucciones', duration: null,
    type: 'Speaking',
    content: {
      subtype: 'roleplay', context: '', objective: '', material: '', script: '', practiceMode: 'guided',
      roles: [{ name: '', description: '' }, { name: '', description: '' }],
    },
  });
  // The initial blank roleplay is still nothing to lose when changing again.
  await userEvent.selectOptions(screen.getByLabelText('Tipo de práctica oral'), 'presentation');
  expect(confirm).not.toHaveBeenCalled();
});

it('adds roles up to six and removes them down to two', async () => {
  const twoRoles: ActivityDraft = {
    ...base, key: 'a8', duration: null, type: 'Speaking',
    content: {
      subtype: 'roleplay', context: 'Cena', objective: '', material: '', script: '', practiceMode: 'free',
      roles: [{ name: 'A', description: '' }, { name: 'B', description: '' }],
    },
  };
  render(<Harness initial={twoRoles} />);
  // The two minimum roles cannot be removed.
  expect(screen.getByRole('button', { name: 'Quitar rol 1' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Añadir rol' }));
  expect(screen.getByLabelText('Rol 3 — Nombre')).toHaveValue('');
  for (let i = 0; i < 4; i++) await userEvent.click(screen.getByRole('button', { name: 'Añadir rol' }));
  // Six rows exist and the button stops there.
  expect(screen.getAllByLabelText(/— Nombre/)).toHaveLength(6);
  expect(screen.getByRole('button', { name: 'Añadir rol' })).toBeDisabled();
});

it('reorders rows with the up and down buttons', async () => {
  const twoQuestions: ActivityDraft = { ...base, key: 'a9', type: 'Reading', content: { text: 'Un texto', questionsList: ['Uno', 'Dos'] } };
  render(<Harness initial={twoQuestions} />);
  expect(screen.getByRole('button', { name: 'Subir pregunta 1' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Bajar pregunta 2' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Bajar pregunta 1' }));
  expect(onChange).toHaveBeenLastCalledWith({ ...twoQuestions, content: { text: 'Un texto', questionsList: ['Dos', 'Uno'] } });
  expect(screen.getByLabelText('Pregunta 1')).toHaveValue('Dos');
  await userEvent.click(screen.getByRole('button', { name: 'Subir pregunta 2' }));
  expect(screen.getByLabelText('Pregunta 1')).toHaveValue('Uno');
});

it('allows a presentation without any talking point', async () => {
  const presentation: ActivityDraft = {
    ...base, key: 'a10', type: 'Speaking',
    content: { subtype: 'presentation', context: 'Mi ciudad', talkingPoints: ['Único'] },
  };
  render(<Harness initial={presentation} />);
  expect(screen.getByLabelText('Tema')).toHaveValue('Mi ciudad');
  // Unlike questions, the last point can be removed: the list is optional.
  await userEvent.click(screen.getByRole('button', { name: 'Quitar punto 1' }));
  expect(screen.queryByLabelText('Punto 1')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Añadir punto' }));
  expect(screen.getByLabelText('Punto 1')).toHaveValue('');
});
