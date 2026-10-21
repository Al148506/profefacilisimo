import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Link, Route, RouterProvider, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import LessonEditorPage from './LessonEditorPage';
import { getLesson, saveLesson, lessonDetailKey, LessonSaveError, type LessonDetails } from './lesson-api';
import { assignStudentToLesson, listAssignedStudents, listStudents, unassignStudentFromLesson, type AssignedStudent, type StudentListItem } from '../students/student-api';
import { lessonDraftSchema, lessonSchema } from './lesson-schema';
import { notifyLessonSaved, notifyLessonSavedWithIssues } from '../notifications';
vi.mock('../auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('./lesson-api', async (original) => ({ ...await original<typeof import('./lesson-api')>(), getLesson: vi.fn(), saveLesson: vi.fn() }));
// The third step reads assignments and candidates, and the save applies the staged diff through
// these four functions. The suite drives all of it with stubs: nothing here reaches the transport.
vi.mock('../students/student-api', async (original) => ({
  ...await original<typeof import('../students/student-api')>(),
  listAssignedStudents: vi.fn(), listStudents: vi.fn(), assignStudentToLesson: vi.fn(), unassignStudentFromLesson: vi.fn(),
}));
// The alerts are SweetAlert2, which mounts its own container on <body>: outside every React root, so
// the testing-library cleanup cannot reach it, and an open popup marks the app `aria-hidden` and
// hides it from role queries. Stubbing them keeps this suite about the draft itself.
vi.mock('../notifications', () => ({ notifyLessonSaved: vi.fn(), notifyLessonSaveFailed: vi.fn(), notifyLessonSavedWithIssues: vi.fn() }));
const detail: LessonDetails = { id: 'l1', title: 'Original', level: 'B1', topic: 'Tema', objective: 'Objetivo', createdAt: '2026-09-17', updatedAt: '2026-09-17', deletedAt: null, estimatedDuration: 60, activities: [] };
const ana: AssignedStudent = { id: 's1', name: 'Ana', level: 'A2', inTrash: false, assignedAt: '2026-09-17' };
const carla: AssignedStudent = { id: 's3', name: 'Carla', level: 'B2', inTrash: false, assignedAt: '2026-09-17' };
const bruno: StudentListItem = { id: 's2', name: 'Bruno', level: 'B1', interests: null, assignedLessonCount: 0, updatedAt: '2026-09-17', deletedAt: null };
const brunoAssigned: AssignedStudent = { id: 's2', name: 'Bruno', level: 'B1', inTrash: false, assignedAt: '2026-09-18' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getLesson).mockResolvedValue(detail);
  vi.mocked(listAssignedStudents).mockResolvedValue([]);
  vi.mocked(listStudents).mockResolvedValue([]);
});
function page(path = '/lessons/l1/edit') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function TestRoutes() {
    return <><Link className="brand" to="/">Inicio</Link>
      <Routes><Route path="/" element={<><h1>Listado</h1><Link to="/lessons/l1/edit">Reabrir clase</Link></>} /><Route path="/lessons/new" element={<LessonEditorPage />} /><Route path="/lessons/:id/edit" element={<LessonEditorPage />} /></Routes></>;
  }
  const router = createMemoryRouter([{ path: '*', element: <TestRoutes /> }], { initialEntries: [path] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return client;
}
it('validates required fields without sending and schema enforces limits and levels', async () => {
  page('/lessons/new');
  // Title and Objective are mandatory, Topic is optional: «Continuar» refuses to advance and reveals two messages.
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(await screen.findAllByText('Este campo es obligatorio.')).toHaveLength(2);
  expect(saveLesson).not.toHaveBeenCalled();
  for (const [field, value] of [['title', 'x'.repeat(201)], ['topic', 'x'.repeat(201)], ['objective', 'x'.repeat(2001)], ['level', 'B3'], ['title', '   ']]) {
    expect(lessonSchema.safeParse({ ...detail, [field]: value }).success).toBe(false);
  }
  expect(lessonSchema.parse({ ...detail, title: '  Recortado  ' }).title).toBe('Recortado');
  // Topic is optional: empty string and undefined parse successfully with default ''
  expect(lessonSchema.parse({ ...detail, topic: '' }).topic).toBe('');
  expect(lessonSchema.parse({ ...detail, topic: undefined }).topic).toBe('');
});
it('creates using trimmed metadata, supports topic datalist, and opens the saved editor', async () => {
  vi.mocked(saveLesson).mockResolvedValue({ ...detail, title: 'Nueva' });
  page('/lessons/new');
  const topicInput = screen.getByLabelText(/Tema/);
  expect(topicInput).toHaveAttribute('list', 'common-topics');
  await userEvent.type(screen.getByLabelText('Título'), ' Nueva ');
  await userEvent.type(topicInput, ' Tema ');
  await userEvent.type(screen.getByLabelText('Objetivo'), ' Objetivo ');
  await userEvent.selectOptions(screen.getByLabelText('Nivel'), 'B1');
  // Creating walks the whole wizard: «Continuar» reaches the activities, «Siguiente» the students,
  // and «Guardar clase» sends.
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }));
  // A clean save returns to the listing once the confirmation alert is dismissed.
  expect(await screen.findByRole('heading', { name: 'Listado' })).toBeInTheDocument();
  expect(saveLesson).toHaveBeenCalledWith({ title: 'Nueva', level: 'B1', topic: 'Tema', objective: 'Objetivo', activities: [] }, undefined);
});

it('creates lesson successfully without topic', async () => {
  vi.mocked(saveLesson).mockResolvedValue({ ...detail, title: 'Sin Tema', topic: null });
  page('/lessons/new');
  await userEvent.type(screen.getByLabelText('Título'), 'Sin Tema');
  await userEvent.type(screen.getByLabelText('Objetivo'), 'Objetivo');
  await userEvent.selectOptions(screen.getByLabelText('Nivel'), 'A2');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }));
  expect(await screen.findByRole('heading', { name: 'Listado' })).toBeInTheDocument();
  expect(saveLesson).toHaveBeenCalledWith({ title: 'Sin Tema', level: 'A2', topic: '', objective: 'Objetivo', activities: [] }, undefined);
});

it('validates the content of each activity type and keeps the exact field path', () => {
  const draft = { key: 'activity-1', id: null, title: 'Actividad', instructions: 'Instrucciones', duration: 10 };
  const parse = (activity: unknown) => lessonDraftSchema.safeParse({ ...detail, activities: [activity] });
  expect(parse({ ...draft, type: 'Speaking', content: { subtype: 'conversation', questionsText: '¿Qué tal?' } }).success).toBe(true);
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
  const empty = parse({ ...draft, type: 'Speaking', content: { subtype: 'conversation', questionsText: '  \n ' } });
  expect(empty.success).toBe(false);
  expect(empty.error?.issues[0].path.join('.')).toBe('activities.0.content.questionsText');
  expect(parse({ ...draft, type: 'Speaking', content: { questionsText: 'x' } }).success).toBe(false);
  expect(parse({ ...draft, type: 'Speaking', content: { subtype: 'conversation', questionsText: Array.from({ length: 51 }, (_, i) => 'x' + i).join('\n') } }).success).toBe(false);
  expect(parse({ ...draft, type: 'Speaking', content: { subtype: 'conversation', questionsText: 'P\n' + 'x'.repeat(2001) } }).success).toBe(false);
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
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }));
  expect(await screen.findByText('Error de guardado')).toBeInTheDocument();
  expect(saveLesson).toHaveBeenCalledTimes(1);
  // A failed save leaves the teacher on the step where it was pressed. Going back shows the draft
  // they typed, not the value the refetch brought from the server: the field was unmounted while the
  // later steps were showing, so retention is checked by returning to it.
  await userEvent.click(screen.getByRole('button', { name: 'Atrás' }));
  await userEvent.click(screen.getByRole('button', { name: 'Atrás' }));
  expect(screen.getByLabelText('Título')).toHaveValue('Borrador');
});
it('disables saving controls and clears dirty state only after success', async () => {
  let resolve!: (value: LessonDetails) => void;
  vi.mocked(saveLesson).mockReturnValue(new Promise((done) => { resolve = done; }));
  vi.mocked(listStudents).mockResolvedValue([bruno]);
  page();
  await userEvent.type(await screen.findByLabelText('Título'), ' editada');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }));
  expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  // While saving, the whole step goes inert — not only the button that was pressed. The metadata
  // fields cannot be checked here: they live on the first step, which is not rendered any more.
  expect(screen.getByRole('button', { name: 'Atrás' })).toBeDisabled();
  expect(screen.getByLabelText('Asignar estudiante')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Volver a Mis clases' })).toBeDisabled();
  resolve({ ...detail, title: 'Original editada' });
  await waitFor(() => expect(notifyLessonSaved).toHaveBeenCalledTimes(1));
  // The alert is the end of the session: once it resolves, the editor returns to the listing by
  // itself, and nothing is pending any more, so the trip is not questioned.
  const confirm = vi.spyOn(window, 'confirm');
  expect(await screen.findByRole('heading', { name: 'Listado' })).toBeInTheDocument();
  expect(confirm).not.toHaveBeenCalled();
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
  await userEvent.type(screen.getByLabelText(/Tema/), 'Tema');
  await userEvent.type(screen.getByLabelText('Objetivo'), 'Objetivo');
  // The activities only exist on the second step, so the helper leaves the editor there.
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
}

async function addActivity(type: string, title: string, instructions: string, duration?: string) {
  await userEvent.selectOptions(screen.getByLabelText('Tipo de la nueva actividad'), type);
  await userEvent.click(screen.getByRole('button', { name: 'Agregar actividad' }));
  await userEvent.type(screen.getByLabelText('Título de la actividad'), title);
  await userEvent.type(screen.getByLabelText('Instrucciones'), instructions);
  if (duration) await userEvent.type(screen.getByLabelText('Duración (minutos)'), duration);
}
/** The window only hands its copy to the draft through «Guardar actividad», and only when valid. */
async function commitActivity() {
  await userEvent.click(screen.getByRole('button', { name: 'Guardar actividad' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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
  await commitActivity();
  expect(screen.getByText('Duración total:')).toHaveTextContent('10 min');
  // The window commits only valid activities: a missing field keeps it open and marked instead of
  // leaving a half-written row behind in the list.
  await addActivity('Speaking', 'Conversación', 'Habla');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar actividad' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('Indica la duración en minutos.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Conversación/ })).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Preguntas (una por línea)'), '¿Qué tal?');
  await userEvent.type(screen.getByLabelText('Duración (minutos)'), '5');
  expect(screen.queryByText('Indica la duración en minutos.')).not.toBeInTheDocument();
  await commitActivity();
  expect(screen.getByText('Duración total:')).toHaveTextContent('15 min');
  // Reordering is local: it changes what will be saved and writes nothing.
  await userEvent.click(screen.getByRole('button', { name: 'Subir Conversación' }));
  expect(saveLesson).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }));
  await waitFor(() => expect(saveLesson).toHaveBeenCalledTimes(1));
  expect(vi.mocked(saveLesson).mock.calls[0][0]).toEqual({
    title: 'Clase', level: 'A2', topic: 'Tema', objective: 'Objetivo',
    activities: [
      { id: null, type: 'Speaking', title: 'Conversación', instructions: 'Habla', estimatedDuration: 5, content: { subtype: 'conversation', questionsList: ['¿Qué tal?'] } },
      { id: null, type: 'Writing', title: 'Escritura', instructions: 'Instrucciones', estimatedDuration: 10, content: { prompt: 'Escribe' } },
    ],
  });
  // A clean save dismisses itself back to the listing; reopening the saved lesson shows the draft
  // rebuilt from the canonical response.
  expect(await screen.findByRole('heading', { name: 'Listado' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Reabrir clase' }));
  await screen.findByLabelText('Título');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(screen.getByText('Duración total:')).toHaveTextContent('15 min');
  // Editing a saved row reopens the window on its copy; the list waits for the commit again.
  await userEvent.click(screen.getByRole('button', { name: /^Conversación/ }));
  await userEvent.clear(screen.getByLabelText('Duración (minutos)'));
  await userEvent.type(screen.getByLabelText('Duración (minutos)'), '20');
  await commitActivity();
  expect(screen.getByText('Duración total:')).toHaveTextContent('30 min');
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }));
  // The alert is the only success channel now: the second save reopens it, and the draft is clean.
  await waitFor(() => expect(notifyLessonSaved).toHaveBeenCalledTimes(2));
  // The local keys were replaced by the returned Ids, so the next save updates instead of inserting.
  const second = vi.mocked(saveLesson).mock.calls[1];
  expect(second[1]).toBe('l1');
  expect(second[0].activities.map((activity) => [activity.id, activity.estimatedDuration]))
    .toEqual([['saved-0', 20], ['saved-1', 10]]);
});

it('saves a complete roleplay with the exact payload and reopens it with every field', async () => {
  // The fake server stores exactly what it receives and returns it, so reopening proves persistence.
  let stored = detail;
  vi.mocked(getLesson).mockImplementation(async () => stored);
  vi.mocked(saveLesson).mockImplementation(async (values) => {
    stored = {
      ...detail, title: values.title, level: values.level, topic: values.topic, objective: values.objective,
      estimatedDuration: 12,
      activities: values.activities.map((activity, index) => ({
        id: 'saved-' + index, type: activity.type, title: activity.title, instructions: activity.instructions,
        content: activity.content, order: index, estimatedDuration: activity.estimatedDuration,
      })),
    };
    return stored;
  });
  page('/lessons/new');
  await metadata();
  await addActivity('Speaking', 'Roleplay en el restaurante', 'Practicad el diálogo', '12');
  // The activity starts as Conversation. Switching with nothing written is silent: no confirmation asked.
  const confirm = vi.spyOn(window, 'confirm').mockClear().mockReturnValue(true);
  await userEvent.selectOptions(screen.getByLabelText('Tipo de práctica oral'), 'roleplay');
  expect(confirm).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText('Situación o contexto'), 'Cena en un restaurante');
  await userEvent.type(screen.getByLabelText('Rol 1 — Nombre'), 'Waiter');
  await userEvent.type(screen.getByLabelText('Rol 1 — Descripción (opcional)'), 'Toma el pedido');
  await userEvent.type(screen.getByLabelText('Rol 2 — Nombre'), 'Customer');
  // The optional fields live in the advanced section: open it before writing the objective and the script.
  await userEvent.click(screen.getByRole('button', { name: /Opciones avanzadas/ }));
  await userEvent.type(screen.getByLabelText('Objetivo comunicativo (opcional)'), 'Pedir la cuenta');
  await userEvent.type(screen.getByLabelText('Guion de conversación (opcional)'), 'Waiter: Good evening!');
  // The written script sets the mode to Con guion on its own: the picker is gone.
  await commitActivity();
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }));
  await waitFor(() => expect(saveLesson).toHaveBeenCalledTimes(1));
  expect(vi.mocked(saveLesson).mock.calls[0][0].activities[0]).toEqual({
    id: null, type: 'Speaking', title: 'Roleplay en el restaurante', instructions: 'Practicad el diálogo', estimatedDuration: 12,
    content: {
      subtype: 'roleplay', context: 'Cena en un restaurante',
      roles: [{ name: 'Waiter', description: 'Toma el pedido' }, { name: 'Customer', description: null }],
      objective: 'Pedir la cuenta', material: null, script: 'Waiter: Good evening!', practiceMode: 'scripted',
    },
  });
  // Reopening the saved lesson restores the whole roleplay, not only the questions: the clean save
  // returned to the listing, and reopening walks back to the activities where the card lives.
  await screen.findByRole('heading', { name: 'Listado' });
  await userEvent.click(screen.getByRole('link', { name: 'Reabrir clase' }));
  await screen.findByLabelText('Título');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await userEvent.click(screen.getByRole('button', { name: /^Roleplay en el restaurante/ }));
  expect(screen.getByLabelText('Tipo de práctica oral')).toHaveValue('roleplay');
  expect(screen.getByLabelText('Situación o contexto')).toHaveValue('Cena en un restaurante');
  expect(screen.getByLabelText('Rol 2 — Nombre')).toHaveValue('Customer');
  expect(screen.getByLabelText('Guion de conversación (opcional)')).toHaveValue('Waiter: Good evening!');
});

it('saves conversation questions from a pasted block, one per line, dropping blank lines', async () => {
  page('/lessons/new');
  await metadata();
  await addActivity('Speaking', 'Conversación', 'Habla', '10');
  await userEvent.type(screen.getByLabelText('Preguntas (una por línea)'), 'Uno{enter}{enter}Dos');
  await commitActivity();
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }));
  await waitFor(() => expect(saveLesson).toHaveBeenCalledTimes(1));
  expect(vi.mocked(saveLesson).mock.calls[0][0].activities[0].content)
    .toEqual({ subtype: 'conversation', questionsList: ['Uno', 'Dos'] });
});

it('keeps an invalid activity inside the window and marks the exact field', async () => {
  page('/lessons/new');
  await metadata();
  await addActivity('Writing', 'Escritura', 'Instrucciones', '10');
  // No consigna yet: «Guardar actividad» refuses, the message sits on the field and the dialog stays.
  await userEvent.click(screen.getByRole('button', { name: 'Guardar actividad' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByLabelText('Consigna')).toHaveAccessibleDescription('Este campo es obligatorio.');
  // Nothing half-written reaches the list: the draft is exactly as it was before the attempt.
  expect(screen.queryByRole('button', { name: /^Escritura/ })).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Consigna'), 'Escribe');
  expect(screen.queryByText('Este campo es obligatorio.')).not.toBeInTheDocument();
  await commitActivity();
  const saved = screen.getByRole('button', { name: /^Escritura/ });
  expect(saved).toBeInTheDocument();
  // With the window closed no row claims the pressed state.
  expect(saved).toHaveAttribute('aria-pressed', 'false');
});

it('keeps the activity draft and marks the activity the server rejected', async () => {
  vi.mocked(saveLesson).mockRejectedValue(new LessonSaveError('Texto obligatorio.',
    { 'activities[0].content.prompt': ['Texto obligatorio.'] }));
  page('/lessons/new');
  await metadata();
  await addActivity('Writing', 'Escritura', 'Instrucciones', '10');
  await userEvent.type(screen.getByLabelText('Consigna'), 'Escribe');
  await commitActivity();
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Texto obligatorio.');
  expect(saveLesson).toHaveBeenCalledTimes(1);
  // The rejected save stays where it was pressed; walking back shows the draft untouched and the
  // failed activity still marked in the list.
  await userEvent.click(screen.getByRole('button', { name: 'Atrás' }));
  expect(screen.getByText('Duración total:')).toHaveTextContent('10 min');
  expect(screen.getByRole('button', { name: /^Escritura/ })).toHaveAccessibleDescription('Texto obligatorio.');
  // Reopening the card brings the untouched draft back into the window, message included.
  await userEvent.click(screen.getByRole('button', { name: /^Escritura/ }));
  expect(screen.getByLabelText('Título de la actividad')).toHaveValue('Escritura');
  expect(screen.getByLabelText('Consigna')).toHaveAccessibleDescription('Texto obligatorio.');
});

it('confirms the discard only when the window really holds unsaved changes', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  page('/lessons/new');
  await metadata();
  await userEvent.click(screen.getByRole('button', { name: 'Agregar actividad' }));
  // A brand-new window with nothing typed closes without a word.
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(confirm).not.toHaveBeenCalled();
  // Typing something makes the close ask, and refusing keeps the window and its values.
  await userEvent.click(screen.getByRole('button', { name: 'Agregar actividad' }));
  await userEvent.type(screen.getByLabelText('Título de la actividad'), 'Boceto');
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByLabelText('Título de la actividad')).toHaveValue('Boceto');
  // Confirming discards the copy: the list never learned about it.
  confirm.mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /Boceto/ })).not.toBeInTheDocument();
});

it('keeps the student assignment out of the first two steps and inside the form on the third', async () => {
  vi.mocked(listAssignedStudents).mockResolvedValue([ana]);
  page('/lessons/l1/edit');
  await screen.findByLabelText('Título');
  expect(screen.queryByTestId('students-step')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(screen.queryByTestId('students-step')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  const section = await screen.findByTestId('students-step');
  // Inside the <form>: the selection is part of the draft and only reaches the server with the save.
  expect(section.closest('form')).not.toBeNull();
  expect(screen.getByRole('link', { name: 'Ana' })).toBeInTheDocument();
});

it('saves without touching the assignment endpoints while the selection stays untouched', async () => {
  vi.mocked(listAssignedStudents).mockResolvedValue([ana, carla]);
  vi.mocked(saveLesson).mockResolvedValue(detail);
  page('/lessons/l1/edit');
  await screen.findByLabelText('Título');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await screen.findByTestId('students-step');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }));
  await waitFor(() => expect(saveLesson).toHaveBeenCalledTimes(1));
  // Not changing the assignments and clearing them on purpose are different operations: an
  // untouched selection must never reach the assignment endpoints.
  expect(assignStudentToLesson).not.toHaveBeenCalled();
  expect(unassignStudentFromLesson).not.toHaveBeenCalled();
});

it('stages an assignment without writing, then applies it after the lesson save', async () => {
  vi.mocked(listAssignedStudents).mockResolvedValue([ana]);
  vi.mocked(listStudents).mockResolvedValue([bruno]);
  vi.mocked(saveLesson).mockResolvedValue(detail);
  vi.mocked(assignStudentToLesson).mockResolvedValue(brunoAssigned);
  page('/lessons/l1/edit');
  await screen.findByLabelText('Título');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await userEvent.selectOptions(screen.getByLabelText('Asignar estudiante'), 's2');
  // Staging only moves the local selection: nothing was written and the candidate left the picker.
  expect(saveLesson).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'Bruno' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Bruno · B1' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }));
  await waitFor(() => expect(saveLesson).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(assignStudentToLesson).toHaveBeenCalledWith('l1', 's2'));
  expect(unassignStudentFromLesson).not.toHaveBeenCalled();
});

it('keeps removals as intent until the save, which then unassigns every removed pair', async () => {
  vi.mocked(listAssignedStudents).mockResolvedValue([ana, carla]);
  vi.mocked(saveLesson).mockResolvedValue(detail);
  page('/lessons/l1/edit');
  await screen.findByLabelText('Título');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await userEvent.click(screen.getByRole('button', { name: 'Quitar a Ana' }));
  await userEvent.click(screen.getByRole('button', { name: 'Quitar a Carla' }));
  // The emptied selection is not on the server yet: removing everything is only staged.
  expect(unassignStudentFromLesson).not.toHaveBeenCalled();
  expect(screen.getByTestId('students-empty')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }));
  await waitFor(() => expect(unassignStudentFromLesson).toHaveBeenCalledWith('l1', 's1'));
  await waitFor(() => expect(unassignStudentFromLesson).toHaveBeenCalledWith('l1', 's3'));
  expect(assignStudentToLesson).not.toHaveBeenCalled();
});

it('keeps the staged selection across step navigation and saves it at the end', async () => {
  vi.mocked(listStudents).mockResolvedValue([bruno]);
  vi.mocked(saveLesson).mockResolvedValue(detail);
  vi.mocked(assignStudentToLesson).mockResolvedValue(brunoAssigned);
  page('/lessons/l1/edit');
  await screen.findByLabelText('Título');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await userEvent.selectOptions(screen.getByLabelText('Asignar estudiante'), 's2');
  // Walking back and forth never drops the staged pair, and it never writes on the way.
  await userEvent.click(screen.getByRole('button', { name: 'Atrás' }));
  await userEvent.click(screen.getByRole('button', { name: 'Atrás' }));
  expect(screen.getByLabelText('Título')).toHaveValue('Original');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(screen.getByRole('link', { name: 'Bruno' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }));
  await waitFor(() => expect(assignStudentToLesson).toHaveBeenCalledWith('l1', 's2'));
});

it('creates the lesson and assigns the staged students to its new id', async () => {
  vi.mocked(saveLesson).mockResolvedValue(detail);
  vi.mocked(listStudents).mockResolvedValue([bruno]);
  vi.mocked(assignStudentToLesson).mockResolvedValue(brunoAssigned);
  page('/lessons/new');
  await userEvent.type(screen.getByLabelText('Título'), 'Nueva');
  await userEvent.type(screen.getByLabelText('Objetivo'), 'Objetivo');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await userEvent.selectOptions(screen.getByLabelText('Asignar estudiante'), 's2');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }));
  // The assignment rides on the freshly created lesson: POST first, pair against its returned id.
  await waitFor(() => expect(assignStudentToLesson).toHaveBeenCalledWith('l1', 's2'));
  expect(saveLesson).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('heading', { name: 'Listado' })).toBeInTheDocument();
});

it('warns about the assignments that failed without saving the lesson twice', async () => {
  vi.mocked(saveLesson).mockResolvedValue(detail);
  vi.mocked(listStudents).mockResolvedValue([bruno]);
  vi.mocked(assignStudentToLesson).mockRejectedValue(new Error('conflicto'));
  page('/lessons/new');
  await userEvent.type(screen.getByLabelText('Título'), 'Nueva');
  await userEvent.type(screen.getByLabelText('Objetivo'), 'Objetivo');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await userEvent.selectOptions(screen.getByLabelText('Asignar estudiante'), 's2');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }));
  // The lesson is already saved, so a failed pair warns instead of retrying the whole save.
  await waitFor(() => expect(notifyLessonSavedWithIssues).toHaveBeenCalledWith(['Bruno']));
  expect(notifyLessonSaved).not.toHaveBeenCalled();
  expect(saveLesson).toHaveBeenCalledTimes(1);
});

it('keeps a trashed assigned student in the selection without a removal action', async () => {
  vi.mocked(listAssignedStudents).mockResolvedValue([{ ...ana, inTrash: true }]);
  page('/lessons/l1/edit');
  await screen.findByLabelText('Título');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(await screen.findByTestId('trash-mark')).toHaveTextContent('En papelera');
  // Without the removal control the staged diff can never offer a trashed pair for deletion.
  expect(screen.queryByRole('button', { name: 'Quitar a Ana' })).not.toBeInTheDocument();
});

it('shows the third step for a new lesson with an empty selection and no assignment reads', async () => {
  page('/lessons/new');
  await userEvent.type(screen.getByLabelText('Título'), 'Nueva');
  await userEvent.type(screen.getByLabelText('Objetivo'), 'Objetivo');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(await screen.findByTestId('students-step')).toBeInTheDocument();
  // A brand-new lesson has no assignments to read from the server.
  expect(listAssignedStudents).not.toHaveBeenCalled();
  expect(screen.getByTestId('students-empty')).toBeInTheDocument();
});
