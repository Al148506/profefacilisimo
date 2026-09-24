import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import LessonPlayerPage from './LessonPlayerPage';
import { getLesson, type LessonActivityDto, type LessonDetails } from './lesson-api';

vi.mock('../auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('./lesson-api', async (original) => ({ ...await original<typeof import('./lesson-api')>(), getLesson: vi.fn() }));

const activities: LessonActivityDto[] = [
  { id: 'a1', type: 'Speaking', title: 'Primera', instructions: 'Habla con tu compañero.', content: { questionsList: ['¿Qué tal?'] }, order: 0, estimatedDuration: 10 },
  { id: 'a2', type: 'Writing', title: 'Segunda', instructions: 'Escribe un correo.', content: { prompt: 'Un correo formal.' }, order: 1, estimatedDuration: null },
  { id: 'a3', type: 'Reading', title: 'Tercera', instructions: 'Lee el texto.', content: { text: 'Un texto.', questionsList: ['Pregunta'] }, order: 2, estimatedDuration: 0 },
];
const lesson: LessonDetails = {
  id: 'l1', title: 'Viajes', level: 'B1', topic: 'Vacaciones', objective: 'Objetivo',
  createdAt: '2026-09-17', updatedAt: '2026-09-17', deletedAt: null, estimatedDuration: 30, activities,
};

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

/** Stands in for the browser's Back button: the history entry count is what the URL rules change. */
function Back() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Atrás</button>;
}

/** Turns the fullscreen API on, so the tests can drive the button and the state it reports. */
function enableFullscreen() {
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
  const request = vi.fn(function (this: Element) {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: this });
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  const exit = vi.fn(function () {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  Element.prototype.requestFullscreen = request as unknown as Element['requestFullscreen'];
  document.exitFullscreen = exit as unknown as Document['exitFullscreen'];
  return { request, exit };
}

/**
 * Renders the player at `path`, entered from the listing so that one Back step is observable. The
 * fields and the Back button sit after the routes on purpose: the tab-order test walks from the top.
 */
function page(path = '/lessons/l1/play') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/', path]} initialIndex={1}>
    <Location />
    <Routes>
      <Route path="/" element={<h1>Listado</h1>} />
      <Route path="/lessons/:id/play" element={<LessonPlayerPage />} />
      <Route path="/lessons/:id/edit" element={<h1>Editor</h1>} />
    </Routes>
    <Back />
    <textarea data-testid="note" />
    <input data-testid="field" />
    <div data-testid="rich" contentEditable />
  </MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getLesson).mockResolvedValue(lesson);
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
});

it('shows the loading message and then the first activity', async () => {
  let resolve!: (value: LessonDetails) => void;
  vi.mocked(getLesson).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  page();
  expect(screen.getByText('Cargando clase…')).toBeInTheDocument();
  resolve(lesson);
  expect(await screen.findByTestId('player-activity-title')).toHaveTextContent('Primera');
  expect(screen.getByTestId('player-progress')).toHaveTextContent('Actividad 1 de 3');
});

it('shows the 404 message with the way back to Mis clases and no controls', async () => {
  vi.mocked(getLesson).mockRejectedValueOnce(new Error('La clase no existe o no está disponible.'));
  page();
  expect(await screen.findByRole('alert')).toHaveTextContent('La clase no existe o no está disponible.');
  expect(screen.getByRole('link', { name: 'Volver a Mis clases' })).toHaveAttribute('href', '/');
  expect(screen.queryByTestId('player-previous')).not.toBeInTheDocument();
  expect(screen.queryByTestId('player-next')).not.toBeInTheDocument();
});

it('keeps a failed load on the same screen and retries only when asked', async () => {
  vi.mocked(getLesson).mockRejectedValueOnce(new TypeError('Network error'));
  page();
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la clase');
  expect(screen.getByTestId('location')).toHaveTextContent('/lessons/l1/play');
  expect(getLesson).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByTestId('player-activity-title')).toHaveTextContent('Primera');
  expect(getLesson).toHaveBeenCalledTimes(2);
});

it('shows the empty state with the editor as its only way out and no controls at all', async () => {
  vi.mocked(getLesson).mockResolvedValue({ ...lesson, estimatedDuration: 0, activities: [] });
  page();
  expect(await screen.findByTestId('player-empty')).toHaveTextContent('Esta clase todavía no tiene actividades.');
  expect(screen.getByRole('link', { name: 'Editar la clase' })).toHaveAttribute('href', '/lessons/l1/edit');
  expect(screen.queryByTestId('player-progress')).not.toBeInTheDocument();
  expect(screen.queryByTestId('player-previous')).not.toBeInTheDocument();
  expect(screen.queryByTestId('player-next')).not.toBeInTheDocument();
  expect(screen.queryByTestId('player-closing')).not.toBeInTheDocument();
});

it('ignores the position parameter completely in a lesson without activities', async () => {
  vi.mocked(getLesson).mockResolvedValue({ ...lesson, activities: [] });
  page('/lessons/l1/play?actividad=fin');
  expect(await screen.findByTestId('player-empty')).toBeInTheDocument();
  expect(screen.queryByTestId('player-closing')).not.toBeInTheDocument();
  expect(screen.getByTestId('location')).toHaveTextContent('/lessons/l1/play?actividad=fin');
});

it('shows lesson title, level, counter, activity title and duration in the header', async () => {
  page('/lessons/l1/play?actividad=2');
  expect(await screen.findByTestId('player-activity-title')).toHaveTextContent('Segunda');
  expect(screen.getByRole('heading', { name: 'Viajes' })).toBeInTheDocument();
  expect(screen.getByText('B1')).toBeInTheDocument();
  expect(screen.getByTestId('player-progress')).toHaveTextContent('Actividad 2 de 3');
  expect(screen.getByTestId('player-activity-title')).toHaveTextContent('Segunda');
  expect(screen.getByTestId('player-activity-duration')).toHaveTextContent('Sin duración');
});

it('names the type of the activity on screen, not another one', async () => {
  page();
  expect(await screen.findByTestId('player-activity-type')).toHaveTextContent('Speaking');
  await userEvent.click(screen.getByTestId('player-next'));
  expect(screen.getByTestId('player-activity-type')).toHaveTextContent('Writing');
  await userEvent.click(screen.getByTestId('player-next'));
  expect(screen.getByTestId('player-activity-type')).toHaveTextContent('Reading');
});

it('reads the progress, the activity, its type and its duration as one line of metadata', async () => {
  page('/lessons/l1/play?actividad=2');
  const meta = (await screen.findByTestId('player-progress')).closest('.lesson-player-meta');
  expect(meta).not.toBeNull();
  // The four fields share the one line, in that order: it is the hierarchy the header promises.
  expect(within(meta as HTMLElement).getByTestId('player-activity-title')).toBeInTheDocument();
  expect(within(meta as HTMLElement).getByTestId('player-activity-type')).toBeInTheDocument();
  expect(within(meta as HTMLElement).getByTestId('player-activity-duration')).toBeInTheDocument();
  // The three separators are what make it read as a list, and they are decoration, never announced.
  const separators = (meta as HTMLElement).querySelectorAll('.lesson-player-meta-separator');
  expect(separators).toHaveLength(3);
  for (const separator of separators) expect(separator).toHaveAttribute('aria-hidden', 'true');
});

it('keeps the activity out of the document headings, so the class title is the only h1', async () => {
  page();
  await screen.findByTestId('player-activity-title');
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
});

it('shows a real duration in minutes, and a zero duration as 0 min', async () => {
  page();
  expect(await screen.findByTestId('player-activity-duration')).toHaveTextContent('10 min');
  expect(screen.getByTestId('player-activity-duration')).not.toHaveTextContent('Sin duración');
  await userEvent.click(screen.getByTestId('player-next'));
  await userEvent.click(screen.getByTestId('player-next'));
  expect(screen.getByTestId('player-activity-duration')).toHaveTextContent('0 min');
  expect(screen.getByTestId('player-activity-duration')).not.toHaveTextContent('Sin duración');
});

it('renders the activity of its type in the persisted order, one at a time', async () => {
  page();
  expect(await screen.findByTestId('player-instructions')).toHaveTextContent('Habla con tu compañero.');
  await userEvent.click(screen.getByTestId('player-next'));
  expect(screen.getByTestId('player-instructions')).toHaveTextContent('Escribe un correo.');
  expect(screen.queryByText('Habla con tu compañero.')).not.toBeInTheDocument();
});

it('moves with Anterior and Siguiente, with Anterior disabled on the first activity', async () => {
  page();
  await screen.findByTestId('player-activity-title');
  expect(screen.getByTestId('player-previous')).toBeDisabled();
  await userEvent.click(screen.getByTestId('player-next'));
  expect(screen.getByTestId('player-activity-title')).toHaveTextContent('Segunda');
  expect(screen.getByTestId('player-previous')).toBeEnabled();
  await userEvent.click(screen.getByTestId('player-previous'));
  expect(screen.getByTestId('player-activity-title')).toHaveTextContent('Primera');
});

it('makes the arrows equivalent to the buttons and stops at the first activity', async () => {
  page();
  await screen.findByTestId('player-activity-title');
  await userEvent.keyboard('{ArrowRight}');
  expect(screen.getByTestId('player-activity-title')).toHaveTextContent('Segunda');
  await userEvent.keyboard('{ArrowLeft}');
  expect(screen.getByTestId('player-activity-title')).toHaveTextContent('Primera');
  await userEvent.keyboard('{ArrowLeft}');
  expect(screen.getByTestId('player-activity-title')).toHaveTextContent('Primera');
});

it('leaves the arrows inert while the focus is in a field that captures text', async () => {
  page();
  await screen.findByTestId('player-activity-title');
  for (const id of ['note', 'field', 'rich']) {
    const element = screen.getByTestId(id);
    await userEvent.click(element);
    expect(element).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByTestId('player-activity-title'), id).toHaveTextContent('Primera');
  }
});

/** Records every value written to `scrollTop`, so a reset to the top is observable, not assumed. */
function trackScrollTop(element: Element): number[] {
  const written: number[] = [];
  Object.defineProperty(element, 'scrollTop', {
    configurable: true, get: () => 0, set: (value: number) => { written.push(value); },
  });
  return written;
}

it('returns the scrollable body and the document to the top when the activity changes', async () => {
  page();
  await screen.findByTestId('player-activity-title');
  const body = trackScrollTop(document.querySelector('.lesson-player-body')!);
  const html = trackScrollTop(document.documentElement);
  const page1 = trackScrollTop(document.body);
  await userEvent.click(screen.getByTestId('player-next'));
  expect(body).toContain(0);
  expect(html).toContain(0);
  expect(page1).toContain(0);
  expect(screen.getByTestId('player-activity-title')).toHaveTextContent('Segunda');
});

it('pushes one history entry per activity change and walks back through them', async () => {
  page();
  await screen.findByTestId('player-activity-title');
  await userEvent.click(screen.getByTestId('player-next'));
  expect(screen.getByTestId('location')).toHaveTextContent('/lessons/l1/play?actividad=2');
  await userEvent.click(screen.getByTestId('player-next'));
  expect(screen.getByTestId('location')).toHaveTextContent('/lessons/l1/play?actividad=3');
  expect(screen.getByTestId('player-activity-title')).toHaveTextContent('Tercera');
  await userEvent.click(screen.getByRole('button', { name: 'Atrás' }));
  expect(screen.getByTestId('player-activity-title')).toHaveTextContent('Segunda');
  expect(screen.getByTestId('player-progress')).toHaveTextContent('Actividad 2 de 3');
  await userEvent.click(screen.getByRole('button', { name: 'Atrás' }));
  expect(screen.getByTestId('player-activity-title')).toHaveTextContent('Primera');
});

it('opens directly at the activity the URL asks for, so a reload reproduces it', async () => {
  page('/lessons/l1/play?actividad=3');
  expect(await screen.findByTestId('player-activity-title')).toHaveTextContent('Tercera');
  expect(screen.getByTestId('player-progress')).toHaveTextContent('Actividad 3 de 3');
  expect(screen.getByTestId('location')).toHaveTextContent('/lessons/l1/play?actividad=3');
});

it('normalizes an invalid actividad without turning the correction into a history step', async () => {
  page('/lessons/l1/play?actividad=abc');
  expect(await screen.findByTestId('player-activity-title')).toHaveTextContent('Primera');
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/lessons/l1/play?actividad=1'));
  await userEvent.click(screen.getByRole('button', { name: 'Atrás' }));
  // A pushed entry would have replayed the player; a replacement leaves the player in one step.
  expect(screen.getByRole('heading', { name: 'Listado' })).toBeInTheDocument();
});

it('normalizes every invalid shape of actividad, not just the non-numeric one', async () => {
  for (const value of ['0', '-3', '2.5', '99']) {
    const view = page('/lessons/l1/play?actividad=' + value);
    expect(await screen.findByTestId('player-activity-title'), value).toHaveTextContent('Primera');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/lessons/l1/play?actividad=1'));
    view.unmount();
  }
});

it('opens the closing screen from the last activity and keeps it in the URL', async () => {
  page('/lessons/l1/play?actividad=3');
  await userEvent.click(await screen.findByTestId('player-next'));
  expect(screen.getByTestId('player-closing')).toBeInTheDocument();
  expect(screen.getByTestId('location')).toHaveTextContent('/lessons/l1/play?actividad=fin');
  expect(screen.queryByTestId('player-previous')).not.toBeInTheDocument();
  expect(screen.queryByTestId('player-progress')).not.toBeInTheDocument();
});

it('summarises the lesson on the closing screen, without the tools of the activity', async () => {
  page('/lessons/l1/play?actividad=fin');
  const closing = within(await screen.findByTestId('player-closing'));
  expect(closing.getByRole('heading', { name: 'Viajes' })).toBeInTheDocument();
  expect(closing.getByText(/Actividades impartidas:/)).toHaveTextContent('Actividades impartidas: 3');
  expect(closing.getByText(/Duración total:/)).toHaveTextContent('Duración total: 30 min');
  expect(closing.queryByTestId('player-edit')).not.toBeInTheDocument();
  expect(closing.queryByTestId('player-fullscreen')).not.toBeInTheDocument();
});

it('shows the incomplete total on the closing screen instead of inventing one', async () => {
  vi.mocked(getLesson).mockResolvedValue({ ...lesson, estimatedDuration: null });
  page('/lessons/l1/play?actividad=fin');
  const closing = within(await screen.findByTestId('player-closing'));
  expect(closing.getByText(/Duración total:/)).toHaveTextContent('Duración incompleta');
});

it('plays the lesson again from the first activity with Repetir la clase', async () => {
  page('/lessons/l1/play?actividad=fin');
  await screen.findByTestId('player-closing');
  await userEvent.click(screen.getByRole('button', { name: 'Repetir la clase' }));
  expect(screen.getByTestId('player-activity-title')).toHaveTextContent('Primera');
  expect(screen.getByTestId('player-progress')).toHaveTextContent('Actividad 1 de 3');
  expect(screen.getByTestId('location')).toHaveTextContent('/lessons/l1/play?actividad=1');
});

it('leaves the player with Volver a Mis clases', async () => {
  page('/lessons/l1/play?actividad=fin');
  await screen.findByTestId('player-closing');
  await userEvent.click(screen.getByRole('link', { name: 'Volver a Mis clases' }));
  expect(screen.getByRole('heading', { name: 'Listado' })).toBeInTheDocument();
});

it('enters and leaves fullscreen on the player container, following the real state', async () => {
  const { request, exit } = enableFullscreen();
  page();
  await screen.findByTestId('player-activity-title');
  const button = screen.getByTestId('player-fullscreen');
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(button).toHaveTextContent('Pantalla completa');
  await userEvent.click(button);
  expect(request).toHaveBeenCalledTimes(1);
  expect(document.fullscreenElement).toBe(screen.getByTestId('lesson-player'));
  expect(button).toHaveAttribute('aria-pressed', 'true');
  // The label follows the state: it says how to leave the mode the player is actually in.
  expect(button).toHaveTextContent('Salir de pantalla completa');
  // The mode never costs the position: the same activity is still on screen.
  expect(screen.getByTestId('player-activity-title')).toHaveTextContent('Primera');
  await userEvent.click(button);
  expect(exit).toHaveBeenCalledTimes(1);
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(button).toHaveTextContent('Pantalla completa');
  expect(screen.getByTestId('player-activity-title')).toHaveTextContent('Primera');
});

it('follows a fullscreen exit it did not trigger, as when Esc leaves the mode', async () => {
  enableFullscreen();
  page();
  await screen.findByTestId('player-activity-title');
  const button = screen.getByTestId('player-fullscreen');
  await userEvent.click(button);
  expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(button).toHaveTextContent('Salir de pantalla completa');
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  fireEvent(document, new Event('fullscreenchange'));
  expect(button).toHaveAttribute('aria-pressed', 'false');
  // A state change the button did not cause still updates its label, exactly as Esc requires.
  expect(button).toHaveTextContent('Pantalla completa');
});

it('offers no fullscreen button when the browser does not expose the API', async () => {
  page();
  await screen.findByTestId('player-activity-title');
  expect(screen.queryByTestId('player-fullscreen')).not.toBeInTheDocument();
  expect(screen.getByTestId('player-next')).toBeInTheDocument();
});

it('links Editar to the editor of this lesson', async () => {
  page();
  await screen.findByTestId('player-activity-title');
  expect(screen.getByTestId('player-edit')).toHaveAttribute('href', '/lessons/l1/edit');
});

it('reaches the controls with Tab and activates them with Enter and Space', async () => {
  page('/lessons/l1/play?actividad=2');
  await screen.findByTestId('player-activity-title');
  await userEvent.tab();
  expect(screen.getByTestId('player-edit')).toHaveFocus();
  await userEvent.tab();
  expect(screen.getByTestId('player-previous')).toHaveFocus();
  await userEvent.tab();
  expect(screen.getByTestId('player-next')).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  expect(screen.getByTestId('player-activity-title')).toHaveTextContent('Tercera');
  screen.getByTestId('player-previous').focus();
  await userEvent.keyboard(' ');
  expect(screen.getByTestId('player-activity-title')).toHaveTextContent('Segunda');
});
