import { Fragment, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Plus, X, ArrowLeft, ArrowRight, Save, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth';
import { Button } from '../components/Button';
import Modal from '../components/Modal';
import { LEVELS } from '../levels';
import ActivityForm, { type ActivityFieldErrors } from './ActivityForm';
import ActivityList from './ActivityList';
import StepIndicator from './StepIndicator';
import StudentsStep from './StudentsStep';
import { STEP_LABELS, type EditorStep } from './editor-steps';
import { notifyLessonSaveFailed, notifyLessonSaved, notifyLessonSavedWithIssues } from '../notifications';
import {
  assignStudentToLesson, listAssignedStudents, listStudents, unassignStudentFromLesson,
  type AssignedStudent,
} from '../students/student-api';
import {
  ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, activityDraftSchema, activityIssueIndex, createDraft, draftFingerprint,
  draftFromSaved, lessonDraftSchema, lessonSchema, toActivityInput,
  type ActivityDraft, type ActivityType, type LessonValues, type LessonFormValues,
} from './lesson-schema';
import { LessonSaveError, getLesson, lessonDetailKey, saveLesson, type LessonDetails, type SaveLessonValues } from './lesson-api';
import { calculateTotalDuration, formatLessonDuration } from './lesson-duration';
import { COMMON_TOPICS } from './lesson-topics';

type DraftErrors = Record<string, ActivityFieldErrors>;

/**
 * Where the create-save redirect lands the fresh editor. It travels as router state, not a module
 * variable: a later navigation — the listing after the save alert, the list, the player — replaces
 * the history entry and takes the step with it, so every other mount opens on the metadata again.
 */
type EditorRouteState = { editorStep?: EditorStep };

/** Two assignment sets are the same when they hold exactly the same student ids. */
function sameStudents(a: readonly AssignedStudent[], b: readonly AssignedStudent[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(b.map((student) => student.id));
  return a.every((student) => ids.has(student.id));
}

/** Turns the schema issues into per-activity field messages, keyed by the draft's local key. */
function issueErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[], activities: readonly ActivityDraft[]): DraftErrors {
  const byKey: DraftErrors = {};
  for (const issue of issues) {
    const index = activityIssueIndex(issue.path);
    const activity = index === null ? undefined : activities[index];
    if (!activity) continue;
    // `activities[2].content.text` becomes `content.text` inside the activity that owns it.
    const field = issue.path.slice(2).join('.') || 'activity';
    const fields = (byKey[activity.key] ??= {});
    fields[field] ??= issue.message;
  }
  return byKey;
}

/**
 * Maps the server's `ValidationProblemDetails` keys onto the same per-activity shape the local
 * validation uses, so a rejection marks the activity and the field that the server refused.
 */
function serverErrors(fields: Record<string, string[]>, activities: readonly ActivityDraft[]): DraftErrors {
  const byKey: DraftErrors = {};
  for (const [path, messages] of Object.entries(fields)) {
    const match = /^activities\[(\d+)\](?:\.(.+))?$/.exec(path);
    const activity = match ? activities[Number(match[1])] : undefined;
    if (!activity) continue;
    const target = (byKey[activity.key] ??= {});
    target[match![2] ?? 'activity'] ??= messages[0] ?? 'El servidor rechazó esta actividad.';
  }
  return byKey;
}

/**
 * Re-validates the activity open in the modal as it is edited, so a message never outlives the
 * mistake it reports. Only activities that already carry errors inside the window are re-checked.
 */
function refreshActivityFields(fields: ActivityFieldErrors, activity: ActivityDraft): ActivityFieldErrors {
  if (Object.keys(fields).length === 0) return fields;
  const parsed = activityDraftSchema.safeParse(activity);
  return parsed.success ? {} : activityFieldErrors(parsed.error.issues);
}

/** The single-activity issues arrive without the `activities[i]` prefix, exactly as the form keys them. */
function activityFieldErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]): ActivityFieldErrors {
  const fields: ActivityFieldErrors = {};
  for (const issue of issues) {
    const path = issue.path.join('.');
    fields[path] ??= issue.message;
  }
  return fields;
}

/**
 * The activity window: a local copy of one activity, created or edited. The draft list only ever
 * sees it when the teacher presses «Guardar actividad», so closing without saving changes nothing.
 */
type ActivityModalState = {
  /** What the window opened with: the `createDraft` result for a new activity, the list row for an edit. */
  base: ActivityDraft;
  /** Every form change lands here; the class draft stays untouched until the commit. */
  working: ActivityDraft;
  /** Editing replaces the row that carries this key; creating appends the committed draft. */
  editing: boolean;
  errors: ActivityFieldErrors;
  /** The exit animation is playing; the window answers no interaction until it is gone. */
  closing: boolean;
};

function LessonForm({ userId, initial, initialStep = 'info' }: { userId: string; initial?: LessonDetails; initialStep?: EditorStep }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const bypassBlocker = useRef(false);
  const form = useForm<LessonFormValues, unknown, LessonValues>({
    resolver: zodResolver(lessonSchema),
    defaultValues: initial
      ? { title: initial.title, level: initial.level, topic: initial.topic ?? '', objective: initial.objective }
      : { title: '', level: 'A2', topic: '', objective: '' },
  });
  // The step lives in state, not in the URL: the wizard is local to the draft, and a plain reload
  // simply starts again at the first step without losing the values RHF keeps in memory. The save
  // redirect of a new lesson hands over the step where the save was pressed through router state.
  const [step, setStep] = useState<EditorStep>(initialStep);
  // The draft is built once from the loaded lesson, so a refetch can never overwrite local edits.
  const [activities, setActivities] = useState<ActivityDraft[]>(() => (initial?.activities ?? []).map(draftFromSaved));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [newType, setNewType] = useState<ActivityType>('Speaking');
  const [errors, setErrors] = useState<DraftErrors>({});
  // The activity window holds only local state: closing it without saving cannot touch the draft.
  const [modal, setModal] = useState<ActivityModalState | null>(null);
  // What the server currently holds. Saving regenerates the local keys, so the key is not part of it.
  const [baseline, setBaseline] = useState(() => draftFingerprint(activities));
  const total = calculateTotalDuration(activities.map((activity) => activity.duration));
  const activitiesDirty = draftFingerprint(activities) !== baseline;
  // The staged selection of the third step. It lives in the editor, not in the step, so walking
  // back and forth never drops it, and it only reaches the server through the save below.
  const [selectedStudents, setSelectedStudents] = useState<AssignedStudent[]>([]);
  const assignmentsSeeded = useRef(false);
  // A new lesson has nothing to read assignments from: the query stays disabled until it has an id.
  const assignedQuery = useQuery({
    queryKey: ['assigned-students', initial?.id ?? 'new'],
    queryFn: ({ signal }) => listAssignedStudents(initial!.id, signal),
    enabled: !!initial,
    retry: false,
  });
  const candidatesQuery = useQuery({
    queryKey: ['students', userId, 'active'],
    queryFn: ({ signal }) => listStudents({ search: '', level: '' }, signal, 'active'),
    retry: false,
  });
  // The server's assignments seed the staged selection exactly once, so a later refetch can never
  // overwrite what the teacher has been staging meanwhile.
  useEffect(() => {
    if (!initial || assignmentsSeeded.current || !assignedQuery.isSuccess) return;
    assignmentsSeeded.current = true;
    setSelectedStudents(assignedQuery.data ?? []);
  }, [initial, assignedQuery.isSuccess, assignedQuery.data]);
  const selectedStudentIds = new Set(selectedStudents.map((student) => student.id));
  const candidates = (candidatesQuery.data ?? []).filter((student) => !selectedStudentIds.has(student.id));
  // Until the server's list has been read there is no way to tell "untouched" from "emptied on
  // purpose", so the selection is not dirty and, more importantly, no diff will ever be applied.
  const studentsDirty = initial
    ? (assignedQuery.data ? !sameStudents(selectedStudents, assignedQuery.data) : false)
    : selectedStudents.length > 0;

  /**
   * Applies the staged selection on top of the saved lesson: additions with POST, explicit removals
   * with DELETE, one pair at a time. An untouched selection writes nothing — not changing the
   * assignments and clearing them on purpose are different operations — and while the server state
   * has not been read in an edit, the step keeps its hands off entirely. A failed pair is collected
   * by name instead of aborting the rest: the lesson itself is already saved, so the save must never
   * be repeated and would duplicate a new class.
   */
  async function applyAssignments(lessonId: string): Promise<string[]> {
    if (initial && !assignedQuery.data) return [];
    const assigned = assignedQuery.data ?? [];
    if (sameStudents(selectedStudents, assigned)) return [];
    const assignedIds = new Set(assigned.map((student) => student.id));
    const selectedIds = new Set(selectedStudents.map((student) => student.id));
    const failures: string[] = [];
    const added: AssignedStudent[] = [];
    for (const student of selectedStudents.filter((s) => !assignedIds.has(s.id))) {
      try { added.push(await assignStudentToLesson(lessonId, student.id)); }
      catch { failures.push(student.name); }
    }
    const removedIds = new Set<string>();
    for (const student of assigned.filter((s) => !selectedIds.has(s.id))) {
      try { await unassignStudentFromLesson(lessonId, student.id); removedIds.add(student.id); }
      catch { failures.push(student.name); }
    }
    // The selection ends up where the server really is: failed adds drop out, failed removals come back.
    setSelectedStudents([...assigned.filter((s) => !removedIds.has(s.id)), ...added]);
    void client.invalidateQueries({ queryKey: ['assigned-students', lessonId] });
    return failures;
  }

  const mutation = useMutation({
    mutationFn: async (values: SaveLessonValues) => {
      const saved = await saveLesson(values, initial?.id);
      return { saved, assignmentFailures: await applyAssignments(saved.id) };
    },
    retry: false,
    onSuccess: ({ saved, assignmentFailures }) => {
      const canonical = saved.activities.map(draftFromSaved);
      const index = activities.findIndex((activity) => activity.key === selectedKey);
      form.reset({ title: saved.title, level: saved.level, topic: saved.topic ?? '', objective: saved.objective });
      // Only after the server confirms are the local keys replaced by the returned Ids, and only
      // then the pending changes indicator is cleared.
      setActivities(canonical);
      setBaseline(draftFingerprint(canonical));
      setErrors({});
      setSelectedKey(canonical[index]?.key ?? null);
      client.setQueryData(lessonDetailKey(userId, saved.id), saved);
      void client.invalidateQueries({ queryKey: ['lessons', userId] });
      if (!initial) { bypassBlocker.current = true; navigate('/lessons/' + saved.id + '/edit', { replace: true, state: { editorStep: step } }); }
      // The alert is a complement: it fires after the server confirmed and the state is already
      // settled, so it cannot interfere with the save or with the navigation above. The class is
      // saved in both cases; the warning only names the assignments that did not make it. With a
      // clean save, dismissing the alert ends the editing session: back to the teacher's classes.
      // With assignment failures the editor stays open, where the staged pairs can be retried.
      if (assignmentFailures.length > 0) void notifyLessonSavedWithIssues(assignmentFailures);
      else void Promise.resolve(notifyLessonSaved()).then(() => { bypassBlocker.current = true; navigate('/', { replace: true }); });
    },
    onError: (error) => {
      // The draft is kept exactly as it is: a failed save never discards the teacher's work.
      if (error instanceof LessonSaveError) setErrors(serverErrors(error.fields, activities));
      // The API message wins when there is one; a network failure has none and falls back.
      void notifyLessonSaveFailed(error.message);
    },
  });

  const dirty = form.formState.isDirty || activitiesDirty || studentsDirty;
  const saving = mutation.isPending;
  const blocker = useBlocker(() => !bypassBlocker.current && (dirty || saving));

  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('beforeunload', unload); };
  }, [dirty, saving]);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (!saving && window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?')) blocker.proceed();
    else blocker.reset();
  }, [blocker, saving]);

  function back() {
    navigate('/');
  }
  /**
   * Moves to the activities step, but only once the metadata is valid. The three messages the form
   * would show on submit are revealed here too, so the teacher sees what is missing inline instead
   * of being silently blocked.
   */
  async function goToActivities() {
    if (await form.trigger()) setStep('activities');
  }
  /** Going back never validates and never discards: the draft keeps every field as it was typed. */
  function goToInfo() {
    setStep('info');
  }
  /** The students step asks nothing of its own: activities are optional and re-checked at the save. */
  function goToStudents() {
    setStep('students');
  }
  function goToActivitiesStep() {
    setStep('activities');
  }
  /** Staging an add: the candidate leaves the picker and joins the selection, nothing is sent. */
  function addStudent(studentId: string) {
    const candidate = candidates.find((student) => student.id === studentId);
    if (!candidate || selectedStudentIds.has(studentId)) return;
    setSelectedStudents((current) => [...current, {
      id: candidate.id, name: candidate.name, level: candidate.level,
      inTrash: !!candidate.deletedAt, assignedAt: new Date().toISOString(),
    }]);
  }
  /** Staging a removal: the pair only leaves the server if the teacher saves afterwards. */
  function removeStudent(studentId: string) {
    setSelectedStudents((current) => current.filter((student) => student.id !== studentId));
  }
  function openNewActivity() {
    if (saving || modal !== null) return;
    const draft = createDraft(newType);
    setModal({ base: draft, working: draft, editing: false, errors: {}, closing: false });
  }
  /** Opening a row edits a copy of it: the list itself only changes when the window commits. */
  function openActivity(key: string) {
    if (saving || modal !== null) return;
    const activity = activities.find((current) => current.key === key);
    if (!activity) return;
    setSelectedKey(key);
    setModal({ base: activity, working: activity, editing: true, errors: errors[key] ?? {}, closing: false });
  }
  function updateModal(next: ActivityDraft) {
    setModal((current) => (current === null || current.closing ? current
      : { ...current, working: next, errors: refreshActivityFields(current.errors, next) }));
  }
  /** Saving one activity: a valid draft commits and closes; an invalid one stays open and marked. */
  function commitModalActivity() {
    if (saving || modal === null || modal.closing) return;
    const parsed = activityDraftSchema.safeParse(modal.working);
    if (!parsed.success) {
      setModal({ ...modal, errors: activityFieldErrors(parsed.error.issues) });
      return;
    }
    const next = parsed.data;
    setActivities((current) => (modal.editing
      ? current.map((activity) => (activity.key === next.key ? next : activity))
      : [...current, next]));
    setErrors((current) => (current[next.key] === undefined ? current
      : Object.fromEntries(Object.entries(current).filter(([other]) => other !== next.key))));
    setSelectedKey(next.key);
    setModal({ ...modal, closing: true });
  }
  function requestCloseModal() {
    if (saving || modal === null || modal.closing) return;
    // Nothing really typed means nothing to lose: the fingerprint answers in both modes,
    // a new activity against its `createDraft` base, an edit against the row it was opened from.
    const dirty = draftFingerprint([modal.working]) !== draftFingerprint([modal.base]);
    if (dirty && !window.confirm('La actividad tiene cambios sin guardar. Cerrarla los descartará. ¿Quieres continuar?')) return;
    setModal({ ...modal, closing: true });
  }
  function closeModal() { setModal(null); }
  function removeActivity(key: string) {
    const index = activities.findIndex((activity) => activity.key === key);
    const remaining = activities.filter((activity) => activity.key !== key);
    setActivities(remaining);
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([other]) => other !== key)));
    if (selectedKey === key) setSelectedKey(remaining[index]?.key ?? remaining[index - 1]?.key ?? null);
  }
  function moveActivity(key: string, direction: -1 | 1) {
    const index = activities.findIndex((activity) => activity.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= activities.length) return;
    const reordered = [...activities];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setActivities(reordered);
  }
  async function onSubmit(values: LessonValues) {
    // The metadata is re-checked here only to cover a programmatic submit: the plain path to this
    // point already went through `goToActivities`, which refuses to advance on invalid metadata.
    if (!(await form.trigger())) { setStep('info'); return; }
    // The whole set is validated before anything is written: one invalid activity stops the save
    // and walks the teacher back to the step where the activity lives.
    const parsed = lessonDraftSchema.safeParse({ ...values, activities });
    if (!parsed.success) {
      const found = issueErrors(parsed.error.issues, activities);
      setErrors(found);
      setStep('activities');
      const first = activities.find((activity) => found[activity.key]);
      if (first) {
        // The first activity that needs attention opens in the window, where its exact fields show.
        setSelectedKey(first.key);
        setModal({ base: first, working: first, editing: true, errors: found[first.key] ?? {}, closing: false });
      }
      return;
    }
    setErrors({});
    mutation.mutate({
      title: parsed.data.title, level: parsed.data.level, topic: parsed.data.topic, objective: parsed.data.objective,
      activities: parsed.data.activities.map(toActivityInput),
    });
  }

  const listErrors: Record<string, string> = {};
  for (const [key, fields] of Object.entries(errors)) {
    const first = Object.values(fields)[0];
    if (first) listErrors[key] = first;
  }

  return <section className="card lesson-editor">
    <p className="eyebrow">Tu espacio como profe</p><h1>{initial ? 'Editar clase' : 'Crear clase'}</h1>
    <StepIndicator current={step} onGoTo={setStep} />
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      {step === 'info'
        ? <fieldset disabled={saving}>
          <legend>{STEP_LABELS.info}</legend>
          <p className="editor-step-hint">Los datos que identifican la clase. Podrás añadir las actividades en el paso siguiente.</p>
          <label htmlFor="title">Título</label>
          <input id="title" {...form.register('title')} aria-invalid={!!form.formState.errors.title} aria-describedby="title-error" />
          <small className="error" id="title-error">{form.formState.errors.title?.message}</small>
          <label htmlFor="level">Nivel</label>
          <select id="level" {...form.register('level')} aria-invalid={!!form.formState.errors.level} aria-describedby="level-error">
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <small className="error" id="level-error">{form.formState.errors.level?.message}</small>
          <label htmlFor="topic">Tema <span className="optional">(opcional)</span></label>
          <input
            id="topic"
            list="common-topics"
            placeholder="Ej. Viajes y turismo, Gastronomía…"
            {...form.register('topic')}
            aria-invalid={!!form.formState.errors.topic}
            aria-describedby="topic-error"
          />
          <datalist id="common-topics">
            {COMMON_TOPICS.map((topic) => (
              <option key={topic} value={topic} />
            ))}
          </datalist>
          <small className="error" id="topic-error">{form.formState.errors.topic?.message}</small>
          <label htmlFor="objective">Objetivo</label>
          <textarea id="objective" rows={5} {...form.register('objective')} aria-invalid={!!form.formState.errors.objective} aria-describedby="objective-error" />
          <small className="error" id="objective-error">{form.formState.errors.objective?.message}</small>
        </fieldset>
        : step === 'activities'
        ? <fieldset className="activity-section" disabled={saving}>
          <legend>{STEP_LABELS.activities}</legend>
          <p className="activity-total">Duración total: <strong>{formatLessonDuration(total)}</strong></p>
          <div className="activity-add">
            <div>
              <label htmlFor="new-activity-type">Tipo de la nueva actividad</label>
              <select id="new-activity-type" value={newType} onChange={(event) => setNewType(event.target.value as ActivityType)}>
                {ACTIVITY_TYPES.map((type) => <option key={type} value={type}>{ACTIVITY_TYPE_LABELS[type]}</option>)}
              </select>
            </div>
            <Button variant="secondary" type="button" icon={Plus} disabled={saving} onClick={openNewActivity}>Agregar actividad</Button>
          </div>
          {/* Clicking a card opens the activity window; order and removal stay on the list rows. */}
          <ActivityList activities={activities} selectedKey={modal && !modal.closing ? modal.working.key : null}
            errors={listErrors}
            onSelect={openActivity} onRemove={removeActivity} onMove={moveActivity} />
        </fieldset>
        : <fieldset className="students-step-section" disabled={saving}>
          <legend>{STEP_LABELS.students}</legend>
          <StudentsStep
            selected={selectedStudents}
            candidates={candidates}
            loading={(!!initial && assignedQuery.isPending) || candidatesQuery.isPending}
            loadError={(!!initial && assignedQuery.isError) || candidatesQuery.isError}
            onRetry={() => { void assignedQuery.refetch(); void candidatesQuery.refetch(); }}
            onAdd={addStudent}
            onRemove={removeStudent}
          />
        </fieldset>}
      {mutation.isError && <p role="alert" className="error">{mutation.error instanceof TypeError
        ? 'No pudimos conectar. Conservamos tus cambios; comprueba si se guardaron antes de reintentar.'
        : mutation.error.message}</p>}
      {/* The saved confirmation is the `notifyLessonSaved` alert above: this screen deliberately has
          no second success channel, so the teacher hears the same thing once per save. */}
      {/* Keyed so the bars never share a DOM node: «Continuar», «Siguiente» and «Guardar clase» sit in
          the same position, and reusing the node would rewrite its type to submit while the click that
          changed the step is still being dispatched, so the browser would then submit the form on its own. */}
      <div className="editor-actions">
        {step === 'info'
          ? <Fragment key="info">
            <Button variant="secondary" type="button" icon={X} disabled={saving} onClick={back}>Cancelar</Button>
            <Button type="button" icon={ArrowRight} disabled={saving} onClick={() => void goToActivities()}>Continuar</Button>
          </Fragment>
          : step === 'activities'
          ? <Fragment key="activities">
            <Button variant="secondary" type="button" icon={ArrowLeft} disabled={saving} onClick={goToInfo}>Atrás</Button>
            <Button type="button" icon={ArrowRight} disabled={saving} onClick={goToStudents}>Siguiente</Button>
          </Fragment>
          : <Fragment key="students">
            <Button variant="secondary" type="button" icon={ArrowLeft} disabled={saving} onClick={goToActivitiesStep}>Atrás</Button>
            <Button type="submit" icon={Save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar clase'}</Button>
          </Fragment>}
      </div>
    </form>
    {/* The activity window lives outside the <form> on purpose: its buttons are plain pushes of a
      local copy, and a save of the class can never be provoked from inside it. The fieldset keeps
      the whole form inert while a save runs, portal included. */}
    {modal && <Modal
      title={modal.editing ? 'Editar actividad' : 'Nueva actividad'}
      closing={modal.closing}
      busy={saving}
      onRequestClose={requestCloseModal}
      onClosed={closeModal}
      footer={<>
        <Button variant="secondary" type="button" icon={X} disabled={saving} onClick={requestCloseModal}>Cancelar</Button>
        <Button type="button" icon={Save} disabled={saving} onClick={commitModalActivity}>Guardar actividad</Button>
      </>}
    >
      <fieldset className="modal-fieldset" disabled={saving} aria-label="Formulario de la actividad">
        <ActivityForm activity={modal.working} errors={modal.errors} onChange={updateModal} />
      </fieldset>
    </Modal>}
    <Button variant="secondary" className="editor-back" icon={ArrowLeft} disabled={saving} onClick={back}>Volver a Mis clases</Button>
  </section>;
}

export default function LessonEditorPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // A redirected mount starts on the step the save pressed; the state is wiped right after, so a
  // plain reload — or any later visit to this URL — opens on the metadata again.
  const [startStep] = useState<EditorStep>(() => (location.state as EditorRouteState | null)?.editorStep ?? 'info');
  const stepStateCleared = useRef(false);
  useEffect(() => {
    if (stepStateCleared.current) return;
    stepStateCleared.current = true;
    if ((location.state as EditorRouteState | null)?.editorStep) {
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
    }
  }, [location, navigate]);
  const query = useQuery({
    queryKey: lessonDetailKey(user?.id ?? '', id ?? ''),
    queryFn: ({ signal }) => getLesson(id!, signal),
    enabled: !!(id && user), retry: false,
  });
  if (!user) return null;
  if (!id) return <LessonForm key={user.id + '-new'} userId={user.id} />;
  if (!query.data) return <section className="card">
    {query.isPending ? <p role="status">Cargando clase…</p> : <div role="alert" className="error"><p>{query.error?.message}</p><Button icon={RefreshCw} disabled={query.isFetching} onClick={() => void query.refetch()}>Reintentar</Button></div>}
    <Link className="button secondary pf-btn" to="/"><ArrowLeft aria-hidden="true" size={17} />Volver a Mis clases</Link>
  </section>;
  return <LessonForm key={user.id + '-' + id} userId={user.id} initial={query.data} initialStep={startStep} />;
}
