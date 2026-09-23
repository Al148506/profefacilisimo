import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import LessonEditorPage from './LessonEditorPage';
import { getLesson, saveLesson, lessonDetailKey, LessonSaveError, type LessonDetails } from './lesson-api';
import { lessonDraftSchema, lessonSchema } from './lesson-schema';
vi.mock('../auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('./lesson-api', async (original) => ({ ...await original<typeof import('./lesson-api')>(), getLesson: vi.fn(), saveLesson: vi.fn() }));
const detail: LessonDetails = { id: 'l1', title: 'Original', level: 'B1', topic: 'Tema', objective: 'Objetivo', createdAt: '2026-09-17', updatedAt: '2026-09-17', deletedAt: null, estimatedDuration: 60, activities: [] };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getLesson).mockResolvedValue(detail); });
function page(path = '/lessons/l1/edit') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
    <Link className="brand" to="/">Inicio</Link>
    <Routes><Route path="/" element={<h1>Listado</h1>} /><Route path="/lessons/new" element={<LessonEditorPage />} /><Route path="/lessons/:id/edit" element={<LessonEditorPage />} /></Routes>
  </MemoryRouter></QueryClientProvider>);
  return client;
}
it('validates required fields without sending and schema enforces limits and levels', async () => {
  page('/lessons/new');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findAllByText('Este campo es obligatorio.')).toHaveLength(3);
  expect(saveLesson).not.toHaveBeenCalled();
  for (const [field, value] of [['title', 'x'.repeat(201)], ['topic', 'x'.repeat(201)], ['objective', 'x'.repeat(2001)], ['level', 'B3'], ['title', '   ']]) {
    expect(lessonSchema.safeParse({ ...detail, [field]: value }).success).toBe(false);
  }
  expect(lessonSchema.parse({ ...detail, title: '  Recortado  ' }).title).toBe('Recortado');
});
it('creates using trimmed metadata and opens the saved editor', async () => {
  vi.mocked(saveLesson).mockResolvedValue({ ...detail, title: 'Nueva' });
  page('/lessons/new');
  await userEvent.type(screen.getByLabelText('Título'), ' Nueva ');
  await userEvent.type(screen.getByLabelText('Tema'), ' Tema ');
  await userEvent.type(screen.getByLabelText('Objetivo'), ' Objetivo ');
  await userEvent.selectOptions(screen.getByLabelText('Nivel'), 'B1');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('heading', { name: 'Editar clase' })).toBeInTheDocument();
  expect(saveLesson).toHaveBeenCalledWith({ title: 'Nueva', level: 'B1', topic: 'Tema', objective: 'Objetivo', activities: [] }, undefined);
});

it('validates the content of each activity type and keeps the exact field path', () => {
  const draft = { key: 'activity-1', id: null, title: 'Actividad', instructions: 'Instrucciones', duration: 10 };
  const parse = (activity: unknown) => lessonDraftSchema.safeParse({ ...detail, activities: [activity] });
  expect(parse({ ...draft, type: 'Speaking', content: { questionsList: ['¿Qué tal?'] } }).success).toBe(true);
  expect(parse({ ...draft, type: 'Reading', content: { text: 'Texto', questionsList: ['Pregunta'] } }).success).toBe(true);
  expect(parse({ ...draft, type: 'Writing', content: { prompt: 'Consigna' } }).success).toBe(true);
  expect(parse({ ...draft, type: 'VocabularyGrammar', content: { explanation: 'Explicación', exercises: ['Ejercicio'] } }).success).toBe(true);
  // A duration is mandatory on every write and must be a positive whole number of minutes.
  for (const duration of [null, 0, -5, 1.5]) {
    expect(parse({ ...draft, duration, type: 'Writing', content: { prompt: 'Consigna' } }).success).toBe(false);
  }
  // The content of one type never satisfies another, and the path points at the exact field.
  const wrong = parse({ ...draft, type: 'Reading', content: { prompt: 'Consigna' } });
  expect(wrong.success).toBe(false);
  expect(wrong.error?.issues[0].path.join('.')).toBe('activities.0.content.text');
  const empty = parse({ ...draft, type: 'Speaking', content: { questionsList: [''] } });
  expect(empty.success).toBe(false);
  expect(empty.error?.issues[0].path.join('.')).toBe('activities.0.content.questionsList.0');
  expect(parse({ ...draft, type: 'Speaking', content: { questionsList: Array(51).fill('x') } }).success).toBe(false);
  expect(parse({ ...draft, type: 'Speaking', content: { questionsList: [] } }).success).toBe(false);
  expect(parse({ ...draft, type: 'Reading', content: { text: 'x'.repeat(20001), questionsList: ['y'] } }).success).toBe(false);
  expect(parse({ ...draft, type: 'Writing', content: { prompt: 'x'.repeat(5001) } }).success).toBe(false);
  expect(parse({ ...draft, type: 'VocabularyGrammar', content: { explanation: 'x'.repeat(10001), exercises: ['y'] } }).success).toBe(false);
  expect(parse({ ...draft, title: '  Recortado  ', type: 'Writing', content: { prompt: 'Consigna' } }).data?.activities[0].title).toBe('Recortado');
});
it('retains dirty fields across refetch and failed save without automatic retry', async () => {
  const client = page();
  const title = await screen.findByLabelText('Título');
  await userEvent.clear(title); await userEvent.type(title, 'Borrador');
  client.setQueryData(lessonDetailKey('u1', 'l1'), { ...detail, title: 'Servidor' });
  expect(title).toHaveValue('Borrador');
  vi.mocked(saveLesson).mockRejectedValue(new Error('Error de guardado'));
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Error de guardado');
  expect(title).toHaveValue('Borrador');
  expect(saveLesson).toHaveBeenCalledTimes(1);
});
it('disables saving controls and clears dirty state only after success', async () => {
  let resolve!: (value: LessonDetails) => void;
  vi.mocked(saveLesson).mockReturnValue(new Promise((done) => { resolve = done; }));
  page();
  await userEvent.type(await screen.findByLabelText('Título'), ' editada');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  expect(screen.getByLabelText('Título')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Volver a Mis clases' })).toBeDisabled();
  resolve({ ...detail, title: 'Original editada' });
  expect(await screen.findByRole('status')).toHaveTextContent('Clase guardada.');
  const confirm = vi.spyOn(window, 'confirm');
  await userEvent.click(screen.getByRole('button', { name: 'Volver a Mis clases' }));
  expect(confirm).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Listado' })).toBeInTheDocument();
});
it('warns on controlled navigation and beforeunload, cancellation preserves fields', async () => {
  page();
  await userEvent.type(await screen.findByLabelText('Título'), ' local');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await userEvent.click(screen.getByRole('button', { name: 'Volver a Mis clases' }));
  await userEvent.click(screen.getByRole('link', { name: 'Inicio' }));
  expect(screen.getByLabelText('Título')).toHaveValue('Original local');
  expect(confirm).toHaveBeenCalledTimes(2);
  const unload = new Event('beforeunload', { cancelable: true });
  fireEvent(window, unload);
  expect(unload.defaultPrevented).toBe(true);
  confirm.mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Volver a Mis clases' }));
  expect(screen.getByRole('heading', { name: 'Listado' })).toBeInTheDocument();
  const cleanUnload = new Event('beforeunload', { cancelable: true });
  fireEvent(window, cleanUnload);
  expect(cleanUnload.defaultPrevented).toBe(false);
});
it('shows loading and unavailable error then permits retry', async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(getLesson).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  page();
  expect(screen.getByRole('status')).toHaveTextContent('Cargando clase…');
  reject(new Error('La clase no existe'));
  expect(await screen.findByRole('alert')).toHaveTextContent('La clase no existe');
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Original'));
});

async function metadata() {
  await userEvent.type(screen.getByLabelText('Título'), 'Clase');
  await userEvent.type(screen.getByLabelText('Tema'), 'Tema');
  await userEvent.type(screen.getByLabelText('Objetivo'), 'Objetivo');
}

async function addActivity(type: string, title: string, instructions: string, duration?: string) {
  await userEvent.selectOptions(screen.getByLabelText('Tipo de la nueva actividad'), type);
  await userEvent.click(screen.getByRole('button', { name: 'Agregar actividad' }));
  await userEvent.type(screen.getByLabelText('Título de la actividad'), title);
  await userEvent.type(screen.getByLabelText('Instrucciones'), instructions);
  if (duration) await userEvent.type(screen.getByLabelText('Duración (minutos)'), duration);
}

it('saves the whole set in the arranged order and adopts the Ids the server returns', async () => {
  let stored = detail;
  vi.mocked(getLesson).mockImplementation(async () => stored);
  vi.mocked(saveLesson).mockImplementation(async (values) => {
    stored = {
      ...detail, title: values.title, level: values.level, topic: values.topic, objective: values.objective,
      estimatedDuration: values.activities.every((activity) => activity.estimatedDuration > 0)
        ? values.activities.reduce((sum, activity) => sum + activity.estimatedDuration, 0) : null,
      activities: values.activities.map((activity, index) => ({
        id: 'saved-' + index, type: activity.type, title: activity.title, instructions: activity.instructions,
        content: activity.content, order: index, estimatedDuration: activity.estimatedDuration,
      })),
    };
    return stored;
  });
  page('/lessons/new');
  await metadata();
  expect(screen.getByText('Duración total:')).toHaveTextContent('0 min');
  await addActivity('Writing', 'Escritura', 'Instrucciones', '10');
  await userEvent.type(screen.getByLabelText('Consigna'), 'Escribe');
  // A lesson with an activity still missing its duration is shown as incomplete, never as a partial sum.
  await addActivity('Speaking', 'Conversación', 'Habla');
  expect(screen.getByText('Duración total:')).toHaveTextContent('Duración incompleta');
  await userEvent.type(screen.getByLabelText('Pregunta 1'), '¿Qué tal?');
  await userEvent.type(screen.getByLabelText('Duración (minutos)'), '5');
  expect(screen.getByText('Duración total:')).toHaveTextContent('15 min');
  // Reordering is local: it changes what will be saved and writes nothing.
  await userEvent.click(screen.getByRole('button', { name: 'Subir Conversación' }));
  expect(saveLesson).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(saveLesson).toHaveBeenCalledTimes(1));
  expect(vi.mocked(saveLesson).mock.calls[0][0]).toEqual({
    title: 'Clase', level: 'A2', topic: 'Tema', objective: 'Objetivo',
    activities: [
      { id: null, type: 'Speaking', title: 'Conversación', instructions: 'Habla', estimatedDuration: 5, content: { questionsList: ['¿Qué tal?'] } },
      { id: null, type: 'Writing', title: 'Escritura', instructions: 'Instrucciones', estimatedDuration: 10, content: { prompt: 'Escribe' } },
    ],
  });
  // The editor opened the saved lesson: the draft was rebuilt from the canonical response.
  expect(await screen.findByRole('heading', { name: 'Editar clase' })).toBeInTheDocument();
  expect(screen.getByText('Duración total:')).toHaveTextContent('15 min');
  await userEvent.click(screen.getByRole('button', { name: /^Conversación/ }));
  await userEvent.clear(screen.getByLabelText('Duración (minutos)'));
  await userEvent.type(screen.getByLabelText('Duración (minutos)'), '20');
  expect(screen.getByText('Duración total:')).toHaveTextContent('30 min');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Clase guardada.');
  // The local keys were replaced by the returned Ids, so the next save updates instead of inserting.
  const second = vi.mocked(saveLesson).mock.calls[1];
  expect(second[1]).toBe('l1');
  expect(second[0].activities.map((activity) => [activity.id, activity.estimatedDuration]))
    .toEqual([['saved-0', 20], ['saved-1', 10]]);
});

it('blocks the whole save when one activity is invalid and marks it even if it is not selected', async () => {
  page('/lessons/new');
  await metadata();
  await addActivity('Speaking', 'Conversación', 'Habla');
  await userEvent.type(screen.getByLabelText('Pregunta 1'), '¿Qué tal?');
  // Two activities without a duration: one invalid activity is enough to refuse the whole lesson.
  await addActivity('Writing', 'Escritura', 'Instrucciones');
  await userEvent.type(screen.getByLabelText('Consigna'), 'Escribe');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(saveLesson).not.toHaveBeenCalled();
  // The editor opens the first activity that needs attention, but every other failed activity is
  // still marked in the list while it stays unselected.
  expect(screen.getByRole('button', { name: /^Conversación/ })).toHaveAttribute('aria-pressed', 'true');
  const failed = screen.getByRole('button', { name: /^Escritura/ });
  expect(failed).toHaveAttribute('aria-pressed', 'false');
  expect(failed).toHaveAccessibleDescription('Indica la duración en minutos.');
  expect(screen.getByText('Duración total:')).toHaveTextContent('Duración incompleta');
  // Correcting a field clears its message: no error outlives the mistake it reports.
  await userEvent.type(screen.getByLabelText('Duración (minutos)'), '5');
  expect(screen.getByRole('button', { name: /^Conversación/ })).not.toHaveAccessibleDescription('Indica la duración en minutos.');
  expect(screen.getByRole('button', { name: /^Escritura/ })).toHaveAccessibleDescription('Indica la duración en minutos.');
  await userEvent.click(screen.getByRole('button', { name: /^Escritura/ }));
  await userEvent.type(screen.getByLabelText('Duración (minutos)'), '10');
  expect(screen.getByText('Duración total:')).toHaveTextContent('15 min');
  expect(screen.queryByText('Indica la duración en minutos.')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(saveLesson).toHaveBeenCalledTimes(1));
  expect(vi.mocked(saveLesson).mock.calls[0][0].activities.map((activity) => activity.estimatedDuration)).toEqual([5, 10]);
});

it('keeps the activity draft and marks the activity the server rejected', async () => {
  vi.mocked(saveLesson).mockRejectedValue(new LessonSaveError('Texto obligatorio.',
    { 'activities[0].content.prompt': ['Texto obligatorio.'] }));
  page('/lessons/new');
  await metadata();
  await addActivity('Writing', 'Escritura', 'Instrucciones', '10');
  await userEvent.type(screen.getByLabelText('Consigna'), 'Escribe');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Texto obligatorio.');
  expect(saveLesson).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Consigna')).toHaveAccessibleDescription('Texto obligatorio.');
  // Nothing typed is discarded, and the failed activity stays marked in the list.
  expect(screen.getByLabelText('Título de la actividad')).toHaveValue('Escritura');
  expect(screen.getByText('Duración total:')).toHaveTextContent('10 min');
  expect(screen.getByRole('button', { name: /^Escritura/ })).toHaveAccessibleDescription('Texto obligatorio.');
});
