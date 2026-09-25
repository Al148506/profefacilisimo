import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import ActivityForm, { type ActivityFieldErrors } from './ActivityForm';
import ActivityList from './ActivityList';
import StepIndicator from './StepIndicator';
import { STEP_LABELS, type EditorStep } from './editor-steps';
import { notifyLessonSaveFailed, notifyLessonSaved } from '../notifications';
import {
  ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, activityDraftSchema, activityIssueIndex, createDraft, draftFingerprint,
  draftFromSaved, lessonDraftSchema, lessonSchema, toActivityInput,
  type ActivityDraft, type ActivityType, type LessonValues,
} from './lesson-schema';
import { LessonSaveError, getLesson, lessonDetailKey, saveLesson, type LessonDetails, type SaveLessonValues } from './lesson-api';
import { calculateTotalDuration, formatLessonDuration } from './lesson-duration';

type DraftErrors = Record<string, ActivityFieldErrors>;

/**
 * Where a mount of the editor starts. The step lives in component state, but creating a lesson
 * navigates to its `/edit` route, which mounts a fresh editor: this carries the activities step
 * across that remount so the teacher lands where the save was pressed. Read on mount and then reset,
 * so a later navigation — the list, the player — always opens on the metadata again.
 */
let carriedStep: EditorStep = 'info';

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
 * Re-validates one activity as it is edited, so a message never outlives the mistake it reports.
 * Only activities that already carry errors are re-checked: an activity the teacher has not tried to
 * save yet is never marked for fields still left to fill in.
 */
function revalidate(errors: DraftErrors, activity: ActivityDraft): DraftErrors {
  if (!errors[activity.key]) return errors;
  const parsed = activityDraftSchema.safeParse(activity);
  const fields = parsed.success ? {} : (issueErrors(parsed.error.issues, [activity])[activity.key] ?? {});
  if (Object.keys(fields).length > 0) return { ...errors, [activity.key]: fields };
  const remaining = { ...errors };
  delete remaining[activity.key];
  return remaining;
}

function LessonForm({ userId, initial }: { userId: string; initial?: LessonDetails }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const form = useForm<LessonValues>({
    resolver: zodResolver(lessonSchema),
    defaultValues: initial
      ? { title: initial.title, level: initial.level, topic: initial.topic, objective: initial.objective }
      : { title: '', level: 'A2', topic: '', objective: '' },
  });
  // The step lives in state, not in the URL: the wizard is local to the draft, and a plain reload
  // simply starts again at the first step without losing the values RHF keeps in memory.
  // The carried step is consumed exactly once, when this editor mounts.
  const [step, setStep] = useState<EditorStep>(carriedStep);
  // The draft is built once from the loaded lesson, so a refetch can never overwrite local edits.
  const [activities, setActivities] = useState<ActivityDraft[]>(() => (initial?.activities ?? []).map(draftFromSaved));
  // Once this editor is alive it owns the step, so nothing else can claim it on the next mount.
  useEffect(() => { carriedStep = 'info'; }, []);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [newType, setNewType] = useState<ActivityType>('Speaking');
  const [errors, setErrors] = useState<DraftErrors>({});
  // What the server currently holds. Saving regenerates the local keys, so the key is not part of it.
  const [baseline, setBaseline] = useState(() => draftFingerprint(activities));
  const total = calculateTotalDuration(activities.map((activity) => activity.duration));
  const activitiesDirty = draftFingerprint(activities) !== baseline;

  const mutation = useMutation({
    mutationFn: (values: SaveLessonValues) => saveLesson(values, initial?.id),
    retry: false,
    onSuccess: (saved) => {
      const canonical = saved.activities.map(draftFromSaved);
      const index = activities.findIndex((activity) => activity.key === selectedKey);
      form.reset({ title: saved.title, level: saved.level, topic: saved.topic, objective: saved.objective });
      // Only after the server confirms are the local keys replaced by the returned Ids, and only
      // then the pending changes indicator is cleared.
      setActivities(canonical);
      setBaseline(draftFingerprint(canonical));
      setErrors({});
      setSelectedKey(canonical[index]?.key ?? null);
      client.setQueryData(lessonDetailKey(userId, saved.id), saved);
      void client.invalidateQueries({ queryKey: ['lessons', userId] });
      if (!initial) { carriedStep = step; navigate('/lessons/' + saved.id + '/edit', { replace: true }); }
      // The alert is a complement: it fires after the server confirmed and the state is already
      // settled, so it cannot interfere with the save or with the navigation above.
      void notifyLessonSaved();
    },
    onError: (error) => {
      // The draft is kept exactly as it is: a failed save never discards the teacher's work.
      if (error instanceof LessonSaveError) setErrors(serverErrors(error.fields, activities));
      // The API message wins when there is one; a network failure has none and falls back.
      void notifyLessonSaveFailed(error.message);
    },
  });

  const dirty = form.formState.isDirty || activitiesDirty;
  const saving = mutation.isPending;

  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ''; } };
    // The header brand is the other controlled navigation link available from this editor.
    const brand = document.querySelector('a.brand');
    const leave = (event: Event) => {
      if (saving || (dirty && !window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?'))) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', unload);
    brand?.addEventListener('click', leave, true);
    return () => { window.removeEventListener('beforeunload', unload); brand?.removeEventListener('click', leave, true); };
  }, [dirty, saving]);

  function back() {
    if (!dirty || window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?')) navigate('/');
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
  function addActivity() {
    const draft = createDraft(newType);
    setActivities([...activities, draft]);
    setSelectedKey(draft.key);
  }
  function updateActivity(next: ActivityDraft) {
    setActivities(activities.map((activity) => (activity.key === next.key ? next : activity)));
    setErrors((current) => revalidate(current, next));
  }
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
    // The whole set is validated before anything is written: one invalid activity stops the save.
    const parsed = lessonDraftSchema.safeParse({ ...values, activities });
    if (!parsed.success) {
      const found = issueErrors(parsed.error.issues, activities);
      setErrors(found);
      const first = activities.find((activity) => found[activity.key]);
      if (first) setSelectedKey(first.key);
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
  const selected = activities.find((activity) => activity.key === selectedKey);

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
            <option value="A2">A2</option><option value="B1">B1</option><option value="B2">B2</option>
          </select>
          <small className="error" id="level-error">{form.formState.errors.level?.message}</small>
          <label htmlFor="topic">Tema</label>
          <input id="topic" {...form.register('topic')} aria-invalid={!!form.formState.errors.topic} aria-describedby="topic-error" />
          <small className="error" id="topic-error">{form.formState.errors.topic?.message}</small>
          <label htmlFor="objective">Objetivo</label>
          <textarea id="objective" rows={5} {...form.register('objective')} aria-invalid={!!form.formState.errors.objective} aria-describedby="objective-error" />
          <small className="error" id="objective-error">{form.formState.errors.objective?.message}</small>
        </fieldset>
        : <fieldset className="activity-section" disabled={saving}>
          <legend>{STEP_LABELS.activities}</legend>
          <p className="activity-total">Duración total: <strong>{formatLessonDuration(total)}</strong></p>
          <div className="activity-add">
            <div>
              <label htmlFor="new-activity-type">Tipo de la nueva actividad</label>
              <select id="new-activity-type" value={newType} onChange={(event) => setNewType(event.target.value as ActivityType)}>
                {ACTIVITY_TYPES.map((type) => <option key={type} value={type}>{ACTIVITY_TYPE_LABELS[type]}</option>)}
              </select>
            </div>
            <button type="button" className="secondary" onClick={addActivity}>Agregar actividad</button>
          </div>
          <ActivityList activities={activities} selectedKey={selectedKey} errors={listErrors}
            onSelect={setSelectedKey} onRemove={removeActivity} onMove={moveActivity} />
          {selected && <ActivityForm activity={selected} errors={errors[selected.key] ?? {}} onChange={updateActivity} />}
        </fieldset>}
      {mutation.isError && <p role="alert" className="error">{mutation.error instanceof TypeError
        ? 'No pudimos conectar. Conservamos tus cambios; comprueba si se guardaron antes de reintentar.'
        : mutation.error.message}</p>}
      {mutation.isSuccess && !dirty && <p role="status">Clase guardada.</p>}
      <div className="editor-actions">
        {step === 'info'
          ? <>
            <button type="button" className="secondary" disabled={saving} onClick={back}>Cancelar</button>
            <button type="button" disabled={saving} onClick={() => void goToActivities()}>Continuar</button>
          </>
          : <>
            <button type="button" className="secondary" disabled={saving} onClick={goToInfo}>Atrás</button>
            <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar clase'}</button>
          </>}
      </div>
    </form>
    <button className="secondary editor-back" disabled={saving} onClick={back}>Volver a Mis clases</button>
  </section>;
}

export default function LessonEditorPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: lessonDetailKey(user?.id ?? '', id ?? ''),
    queryFn: ({ signal }) => getLesson(id!, signal),
    enabled: !!(id && user), retry: false,
  });
  const navigate = useNavigate();
  if (!user) return null;
  if (!id) return <LessonForm key={user.id + '-new'} userId={user.id} />;
  if (!query.data) return <section className="card">
    {query.isPending ? <p role="status">Cargando clase…</p> : <div role="alert"><p>{query.error?.message}</p><button disabled={query.isFetching} onClick={() => void query.refetch()}>Reintentar</button></div>}
    <button className="secondary" onClick={() => navigate('/')}>Volver a Mis clases</button>
  </section>;
  return <LessonForm key={user.id + '-' + id} userId={user.id} initial={query.data} />;
}
