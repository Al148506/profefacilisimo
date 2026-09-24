import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth';
import ActivityView from './ActivityView';
import { getLesson, lessonDetailKey, type LessonDetails } from './lesson-api';
import { formatLessonDuration } from './lesson-duration';
import { ACTIVITY_TYPE_LABELS } from './lesson-schema';
import { canonicalPosition, CLOSING_VALUE, POSITION_PARAM, positionParam, readPlayerPosition } from './player-position';

/**
 * The transport already turns a missing, foreign or trashed lesson into this exact message, so the
 * player only has to recognise it to offer the way out instead of a retry that cannot succeed.
 */
const NOT_FOUND_MESSAGE = 'La clase no existe o no está disponible.';

/**
 * How an activity duration is displayed: a real 0 is a duration of zero minutes, and only a null
 * (an activity inherited from before durations existed) reads as «Sin duración».
 */
function activityDuration(minutes: number | null): string {
  return minutes === null ? 'Sin duración' : minutes + ' min';
}

/** Arrow keys must never hijack a caret, so a focused field wins over the navigation. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true;
  return target.isContentEditable === true
    || target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

/** The card the loading, error and 404 states share, with the status class frozen by the contract. */
function PlayerStatusCard({ children }: { children: ReactNode }) {
  return <section className="card lesson-player"><div className="lesson-player-status">{children}</div></section>;
}

/**
 * The player of one lesson: one activity per screen, driven entirely by the URL.
 *
 * The position is never kept in state — it is read from `actividad` on every render, so a reload, the
 * Back button and a hand-edited URL all go through the same single path and cannot disagree.
 */
function LessonPlayer({ lesson }: { lesson: LessonDetails }) {
  const activities = lesson.activities;
  const count = activities.length;
  const [searchParams, setSearchParams] = useSearchParams();
  const containerRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const position = readPlayerPosition(searchParams, count);
  const positionKey = canonicalPosition(position);
  const [fullscreen, setFullscreen] = useState(false);
  // Fullscreen is offered only when the browser exposes it: without the API the player still works.
  const fullscreenSupported = typeof document !== 'undefined' && document.fullscreenEnabled === true;

  /** Anterior, Siguiente, the arrows and «Repetir la clase» all move through here: one entry each. */
  const move = useCallback((target: number) => {
    if (target < 0) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set(POSITION_PARAM, target >= count ? CLOSING_VALUE : positionParam(target));
      return next;
    });
  }, [count, setSearchParams]);

  // Correcting the URL is not an action of the teacher, so it replaces instead of pushing. An absent
  // parameter is already the canonical form of the first activity and is left alone; the empty state
  // ignores the parameter entirely.
  useEffect(() => {
    if (count === 0) return;
    const raw = searchParams.get(POSITION_PARAM);
    if (raw === null || raw === positionKey) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set(POSITION_PARAM, positionKey);
      return next;
    }, { replace: true });
  }, [count, positionKey, searchParams, setSearchParams]);

  // The new activity always starts at its heading: the scrollable body goes home, and so does the
  // document when it carries a scroll of its own.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [positionKey]);

  // Registered only while an activity is on screen, so the arrows stay inert on the closing screen.
  useEffect(() => {
    if (position.kind !== 'activity') return;
    const index = position.index;
    const onKeyDown = (event: KeyboardEvent) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (step === 0 || isTextEntry(event.target)) return;
      event.preventDefault();
      move(index + step);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [move, position]);

  // Esc leaves fullscreen without going through the button, so the button follows the real state.
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function toggleFullscreen() {
    const element = containerRef.current;
    if (!element) return;
    if (document.fullscreenElement === element) void document.exitFullscreen();
    else void element.requestFullscreen();
  }

  if (count === 0) {
    return <section className="card lesson-player" data-testid="lesson-player">
      <div className="lesson-player-empty" data-testid="player-empty">
        <span className="level-badge">{lesson.level}</span>
        <h1>{lesson.title}</h1>
        <p>Esta clase todavía no tiene actividades.</p>
        <Link className="button" to={'/lessons/' + lesson.id + '/edit'}>Editar la clase</Link>
      </div>
    </section>;
  }

  if (position.kind === 'closing') {
    return <section className="card lesson-player" data-testid="lesson-player" ref={containerRef}>
      <div className="lesson-player-closing" data-testid="player-closing">
        <h1>{lesson.title}</h1>
        <p className="lesson-player-summary">Actividades impartidas: <strong>{count}</strong></p>
        <p className="lesson-player-summary">Duración total: <strong>{formatLessonDuration(lesson.estimatedDuration)}</strong></p>
        <div className="lesson-player-controls">
          <button type="button" onClick={() => move(0)}>Repetir la clase</button>
          <Link className="secondary" to="/">Volver a Mis clases</Link>
        </div>
      </div>
    </section>;
  }

  const current = activities[position.index];
  return <section className="card lesson-player" data-testid="lesson-player" ref={containerRef}>
    <header className="lesson-player-header">
      <div className="lesson-player-heading">
        <span className="level-badge">{lesson.level}</span>
        <h1>{lesson.title}</h1>
        {/* The activity is the heading of the body below, not part of the lesson's title, so it sits
            here as the one line of metadata that qualifies what is on screen right now. */}
        <p className="lesson-player-meta">
          <span data-testid="player-progress">Actividad {position.index + 1} de {count}</span>
          <span className="lesson-player-meta-separator" aria-hidden="true">·</span>
          <span data-testid="player-activity-title">{current.title}</span>
          <span className="lesson-player-meta-separator" aria-hidden="true">·</span>
          <span data-testid="player-activity-type">{ACTIVITY_TYPE_LABELS[current.type]}</span>
          <span className="lesson-player-meta-separator" aria-hidden="true">·</span>
          <span data-testid="player-activity-duration">{activityDuration(current.estimatedDuration)}</span>
        </p>
      </div>
      <div className="lesson-player-tools">
        {fullscreenSupported && <button type="button" className="secondary" data-testid="player-fullscreen"
          aria-pressed={fullscreen} onClick={toggleFullscreen}>{fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}</button>}
        <Link data-testid="player-edit" to={'/lessons/' + lesson.id + '/edit'}>Editar</Link>
      </div>
    </header>
    <div className="lesson-player-body" ref={bodyRef}>
      <ActivityView activity={current} />
    </div>
    <div className="lesson-player-controls">
      <button type="button" data-testid="player-previous" disabled={position.index === 0}
        onClick={() => move(position.index - 1)}>Anterior</button>
      <button type="button" data-testid="player-next" onClick={() => move(position.index + 1)}>Siguiente</button>
    </div>
  </section>;
}

export default function LessonPlayerPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: lessonDetailKey(user?.id ?? '', id ?? ''),
    queryFn: ({ signal }) => getLesson(id!, signal),
    enabled: !!(id && user), retry: false,
  });
  if (!user || !id) return null;
  if (query.isPending) return <PlayerStatusCard><p role="status">Cargando clase…</p></PlayerStatusCard>;
  if (query.isError) {
    if (query.error.message === NOT_FOUND_MESSAGE) {
      return <PlayerStatusCard>
        <p role="alert">{NOT_FOUND_MESSAGE}</p>
        <Link className="button" to="/">Volver a Mis clases</Link>
      </PlayerStatusCard>;
    }
    // A failed load stays on the screen: the retry is offered here, without navigating away.
    return <PlayerStatusCard><div role="alert">
      <p>{query.error instanceof TypeError
        ? 'No pudimos cargar la clase. Comprueba tu conexión y vuelve a intentarlo.'
        : query.error.message}</p>
      <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>Reintentar</button>
    </div></PlayerStatusCard>;
  }
  return <LessonPlayer lesson={query.data} />;
}
