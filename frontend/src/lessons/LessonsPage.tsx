import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentUser, logout, type User } from '../auth';
import { transitionLesson, duplicateLesson, lessonDetailKey, lessonListKey, listLessons, type LessonFilters, type LessonLevel } from './lesson-api';

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
  const profile = useQuery({ queryKey: ['me', user.id], queryFn: getCurrentUser, retry: false });
  const signOut = useMutation({ mutationFn: logout, retry: false, onSuccess: () => client.clear() });
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
      <Link className="button" to="/lessons/new">Crear clase</Link><Link to="/lessons/trash">Papelera</Link>
    </>}</nav>
    <p>{trash ? 'Restaura tus clases o elimínalas definitivamente.' : 'Encuentra tus clases por título o nivel.'}</p>
    {!trash && <form className="lesson-filters" onSubmit={(event) => { event.preventDefault(); setFilters({ search: search.trim(), level }); }}>
      <div><label htmlFor="lesson-search">Buscar por título</label>
        <input id="lesson-search" type="search" maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <div><label htmlFor="lesson-level">Nivel</label>
        <select id="lesson-level" value={level} onChange={(event) => setLevel(event.target.value as LessonLevel | '')}>
          <option value="">Todos los niveles</option>
          <option value="A2">A2</option><option value="B1">B1</option><option value="B2">B2</option>
        </select>
      </div>
      <button type="submit">Buscar</button>
      <button className="secondary" type="button" onClick={clearFilters}>Limpiar filtros</button>
    </form>}
    {transition.isError && <div role="alert" className="error"><p>{transition.error instanceof TypeError
      ? 'No pudimos confirmar la operación. Actualiza el listado antes de volver a intentarlo.' : transition.error.message}</p>
      <button disabled={lessons.isFetching} onClick={() => void lessons.refetch()}>Actualizar listado</button></div>}
    {duplicate.isError && <p role="alert" className="error">{duplicate.error instanceof TypeError
      ? 'No pudimos confirmar la copia. Actualiza el listado antes de volver a duplicar para evitar copias repetidas.'
      : duplicate.error.message}</p>}
    <div aria-live="polite" aria-busy={lessons.isFetching}>
      {lessons.isPending && <p role="status">Cargando tus clases…</p>}
      {lessons.isError && <div role="alert" className="error">
        <p>No pudimos cargar tus clases.</p>
        <button type="button" onClick={() => void lessons.refetch()} disabled={lessons.isFetching}>Reintentar clases</button>
      </div>}
      {lessons.isSuccess && <>
        {lessons.isFetching && <p role="status">Actualizando clases…</p>}
        {lessons.data.length === 0
          ? <p>{trash ? 'La papelera está vacía.' : filtered ? 'No hay clases que coincidan con estos filtros.' : 'Aún no tienes clases.'}</p>
          : <ul className="lesson-list">{lessons.data.map((lesson) =>
            <li key={lesson.id}><h2>{lesson.title}</h2><span className="level-badge">{lesson.level}</span><p>{lesson.topic}</p><div className="lesson-actions">{!trash && <><Link to={"/lessons/" + lesson.id + "/edit"}>Editar {lesson.title}</Link>
              <button className="secondary duplicate-button" type="button" disabled={busy}
                aria-label={'Duplicar ' + lesson.title} onClick={() => duplicate.mutate(lesson.id)}>
                {duplicate.isPending && duplicate.variables === lesson.id ? 'Duplicando…' : 'Duplicar'}
              </button>
              <button className="secondary" disabled={busy} aria-label={'Enviar a papelera ' + lesson.title} onClick={() => act(lesson.id, lesson.title, 'trash')}>Enviar a papelera</button>
              </>}
              {trash && <>
                <button className="secondary" disabled={busy} aria-label={'Restaurar ' + lesson.title} onClick={() => act(lesson.id, lesson.title, 'restore')}>Restaurar</button>
                <button className="danger" disabled={busy} aria-label={'Eliminar definitivamente ' + lesson.title} onClick={() => act(lesson.id, lesson.title, 'delete')}>Eliminar definitivamente</button>
              </>}
              {transition.isPending && transition.variables.id === lesson.id && <span role="status">Procesando…</span>}
              </div></li>)}</ul>}
      </>}
    </div>
    <div className="lesson-session">
      <p>Sesión iniciada como <strong>{user.email}</strong>.</p>
      {profile.isPending && <p role="status">Verificando tu cuenta…</p>}
      {profile.isError && <p role="alert" className="error">{profile.error.message} <button onClick={() => void profile.refetch()}>Reintentar cuenta</button></p>}
      {profile.isSuccess && <p className="status">Cuenta verificada con la API</p>}
      {signOut.isError && <p role="alert" className="error">No se pudo cerrar la sesión en el servidor. Vuelve a intentarlo.</p>}
      <button className="secondary" onClick={() => signOut.mutate()} disabled={signOut.isPending}>{signOut.isPending ? 'Cerrando…' : 'Cerrar sesión'}</button>
    </div>
  </section>;
}
