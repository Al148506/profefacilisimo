import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Pencil, Copy, Plus, Trash2, RotateCcw, Ban, Search, FilterX, RefreshCw } from 'lucide-react';
import type { User } from '../auth';
import { Button } from '../components/Button';
import { LEVELS } from '../levels';
import { transitionLesson, duplicateLesson, lessonDetailKey, lessonListKey, listLessons, type LessonFilters, type LessonLevel } from './lesson-api';
import { formatLessonDuration } from './lesson-duration';

export default function LessonsPage({ user, trash = false }: { user: User; trash?: boolean }) {
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<LessonLevel | ''>('');
  const [filters, setFilters] = useState<LessonFilters>({ search: '', level: '' });
  const client = useQueryClient();
  const navigate = useNavigate();
  const duplicate = useMutation({
    mutationFn: duplicateLesson, retry: false,
    onSuccess: (copy) => {
      client.setQueryData(lessonDetailKey(user.id, copy.id), copy);
      void client.invalidateQueries({ queryKey: ['lessons', user.id] });
      navigate('/lessons/' + copy.id + '/edit');
    },
  });
  const lessons = useQuery({
    queryKey: lessonListKey(user.id, filters, trash ? 'trash' : 'active'),
    queryFn: ({ signal }) => listLessons(filters, signal, trash ? 'trash' : 'active'),
    retry: false,
  });
  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'trash' | 'restore' | 'delete' }) => transitionLesson(id, action),
    retry: false,
    onSuccess: async (_, { id }) => {
      client.removeQueries({ queryKey: lessonDetailKey(user.id, id) });
      await client.invalidateQueries({ queryKey: ['lessons', user.id] });
    },
  });
  const busy = duplicate.isPending || transition.isPending;
  function act(id: string, title: string, action: 'trash' | 'restore' | 'delete') {
    const question = action === 'delete'
      ? '¿Eliminar definitivamente "' + title + '" y todas sus actividades? Esta acción no se puede deshacer.'
      : action === 'restore' ? '¿Restaurar "' + title + '"?' : '¿Enviar "' + title + '" a la papelera?';
    if (window.confirm(question)) transition.mutate({ id, action });
  }
  const filtered = !!(filters.search || filters.level);
  function clearFilters() {
    setSearch(''); setLevel(''); setFilters({ search: '', level: '' });
  }
  return <section className="card lessons-page">
    <p className="eyebrow">Tu espacio como profe</p>
    <h1>{trash ? 'Papelera' : 'Mis clases'}</h1>
    <nav className="lesson-navigation">{trash ? <Link to="/">Volver a Mis clases</Link> : <>
      <Link className="button pf-btn" to="/lessons/new"><Plus aria-hidden="true" size={17} />Crear clase</Link><Link to="/lessons/trash">Papelera</Link><Link to="/students">Estudiantes</Link>
    </>}</nav>
    <p>{trash ? 'Restaura tus clases o elimínalas definitivamente.' : 'Encuentra tus clases por título o nivel.'}</p>
    {!trash && <form className="lesson-filters" onSubmit={(event) => { event.preventDefault(); setFilters({ search: search.trim(), level }); }}>
      <div><label htmlFor="lesson-search">Buscar por título</label>
        <input id="lesson-search" type="search" maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <div><label htmlFor="lesson-level">Nivel</label>
        <select id="lesson-level" value={level} onChange={(event) => setLevel(event.target.value as LessonLevel | '')}>
          <option value="">Todos los niveles</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <Button type="submit" icon={Search}>Buscar</Button>
      <Button variant="secondary" type="button" icon={FilterX} onClick={clearFilters}>Limpiar filtros</Button>
    </form>}
    {transition.isError && <div role="alert" className="error"><p>{transition.error instanceof TypeError
      ? 'No pudimos confirmar la operación. Actualiza el listado antes de volver a intentarlo.' : transition.error.message}</p>
      <Button icon={RefreshCw} disabled={lessons.isFetching} onClick={() => void lessons.refetch()}>Actualizar listado</Button></div>}
    {duplicate.isError && <p role="alert" className="error">{duplicate.error instanceof TypeError
      ? 'No pudimos confirmar la copia. Actualiza el listado antes de volver a duplicar para evitar copias repetidas.'
      : duplicate.error.message}</p>}
    <div aria-live="polite" aria-busy={lessons.isFetching}>
      {lessons.isPending && <p role="status">Cargando tus clases…</p>}
      {lessons.isError && <div role="alert" className="error">
        <p>No pudimos cargar tus clases.</p>
        <Button type="button" icon={RefreshCw} onClick={() => void lessons.refetch()} disabled={lessons.isFetching}>Reintentar clases</Button>
      </div>}
      {lessons.isSuccess && <>
        {lessons.isFetching && <p role="status">Actualizando clases…</p>}
        {lessons.data.length === 0
          ? <>
              <p>{trash ? 'La papelera está vacía.' : filtered ? 'No hay clases que coincidan con estos filtros.' : 'Aún no tienes clases.'}</p>
              {!trash && !filtered && <p><Link to="/lessons/new">Crear clase</Link></p>}
            </>
          : <ul className="lesson-list">{lessons.data.map((lesson) =>
            <li key={lesson.id}><h2>{lesson.title}</h2><span className="level-badge">{lesson.level}</span><p>{lesson.topic}</p>{!trash && <p className="lesson-duration">{formatLessonDuration(lesson.estimatedDuration)}</p>}<div className="lesson-actions">{!trash && <><Link className="button pf-btn" to={"/lessons/" + lesson.id + "/play"}><Play aria-hidden="true" size={17} />Iniciar clase</Link>
              <Link className="button secondary pf-btn" to={"/lessons/" + lesson.id + "/edit"} aria-label={'Editar ' + lesson.title}><Pencil aria-hidden="true" size={17} />Editar clase</Link>
              <Button variant="accent" className="duplicate-button" type="button" disabled={busy}
                icon={Copy}
                aria-label={'Duplicar ' + lesson.title} onClick={() => duplicate.mutate(lesson.id)}>
                {duplicate.isPending && duplicate.variables === lesson.id ? 'Duplicando…' : 'Duplicar'}
              </Button>
              <Button variant="secondary" disabled={busy} icon={Trash2} aria-label={'Enviar a papelera ' + lesson.title} onClick={() => act(lesson.id, lesson.title, 'trash')}>Enviar a papelera</Button>
              </>}
              {trash && <>
                <Button variant="accent" disabled={busy} icon={RotateCcw} aria-label={'Restaurar ' + lesson.title} onClick={() => act(lesson.id, lesson.title, 'restore')}>Restaurar</Button>
                <Button variant="danger" disabled={busy} icon={Ban} aria-label={'Eliminar definitivamente ' + lesson.title} onClick={() => act(lesson.id, lesson.title, 'delete')}>Eliminar definitivamente</Button>
              </>}
              {transition.isPending && transition.variables.id === lesson.id && <span role="status">Procesando…</span>}
              </div></li>)}</ul>}
      </>}
    </div>
  </section>;
}
