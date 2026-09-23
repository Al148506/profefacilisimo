import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { getLesson, lessonDetailKey, saveLesson, type LessonDetails } from './lesson-api';
import { lessonSchema, type LessonValues } from './lesson-schema';

function LessonForm({ userId, initial }: { userId: string; initial?: LessonDetails }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const form = useForm<LessonValues>({
    resolver: zodResolver(lessonSchema),
    defaultValues: initial
      ? { title: initial.title, level: initial.level, topic: initial.topic, objective: initial.objective }
      : { title: '', level: 'A2', topic: '', objective: '' },
  });
  const mutation = useMutation({
    mutationFn: (values: LessonValues) => saveLesson(values, initial?.id),
    retry: false,
    onSuccess: (saved) => {
      form.reset({ title: saved.title, level: saved.level, topic: saved.topic, objective: saved.objective });
      client.setQueryData(lessonDetailKey(userId, saved.id), saved);
      void client.invalidateQueries({ queryKey: ['lessons', userId] });
      if (!initial) navigate('/lessons/' + saved.id + '/edit', { replace: true });
    },
  });
  const dirty = form.formState.isDirty;
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
  return <section className="card lesson-editor">
    <p className="eyebrow">Tu espacio como profe</p><h1>{initial ? 'Editar clase' : 'Crear clase'}</h1>
    <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate>
      <fieldset disabled={saving}>
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
      {mutation.isError && <p role="alert" className="error">{mutation.error instanceof TypeError ? 'No pudimos conectar. Conservamos tus cambios; comprueba si se guardaron antes de reintentar.' : mutation.error.message}</p>}
      {mutation.isSuccess && !dirty && <p role="status">Clase guardada.</p>}
      <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
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
