import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentUser, logout, type User } from '../auth';
import { duplicateLesson, lessonDetailKey, lessonListKey, listLessons, type LessonFilters, type LessonLevel } from './lesson-api';

export default function LessonsPage({ user }: { user: User }) {
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
    queryKey: lessonListKey(user.id, filters),
    queryFn: ({ signal }) => listLessons(filters, signal),
    retry: false,
  });
  const profile = useQuery({ queryKey: ['me', user.id], queryFn: getCurrentUser, retry: false });
  const signOut = useMutation({ mutationFn: logout, retry: false, onSuccess: () => client.clear() });
  const filtered = !!(filters.search || filters.level);
  function clearFilters() {
    setSearch(''); setLevel(''); setFilters({ search: '', level: '' });
  }
  return <section className="card lessons-page">
    <p className="eyebrow">Tu espacio como profe</p>
    <h1>Mis clases</h1><Link className="button" to="/lessons/new">Crear clase</Link>
    <p>Encuentra tus clases por título o nivel.</p>
    <form className="lesson-filters" onSubmit={(event) => { event.preventDefault(); setFilters({ search: search.trim(), level }); }}>
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
    </form>
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
          ? <p>{filtered ? 'No hay clases que coincidan con estos filtros.' : 'Aún no tienes clases.'}</p>
          : <ul className="lesson-list">{lessons.data.map((lesson) =>
            <li key={lesson.id}><h2>{lesson.title}</h2><span className="level-badge">{lesson.level}</span><p>{lesson.topic}</p><Link to={"/lessons/" + lesson.id + "/edit"}>Editar {lesson.title}</Link>
              <button className="secondary duplicate-button" type="button" disabled={duplicate.isPending}
                aria-label={'Duplicar ' + lesson.title} onClick={() => duplicate.mutate(lesson.id)}>
                {duplicate.isPending && duplicate.variables === lesson.id ? 'Duplicando…' : 'Duplicar'}
              </button></li>)}</ul>}
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
