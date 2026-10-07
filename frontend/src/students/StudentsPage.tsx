import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, RotateCcw, Ban, Search, FilterX, RefreshCw, Eye } from 'lucide-react';
import type { User } from '../auth';
import { Button } from '../components/Button';
import { LEVELS } from '../levels';
import { listStudents, studentDetailKey, studentListKey, transitionStudent, type StudentFilters, type StudentLevel } from './student-api';

/** A trashed student keeps no filters: the listing of the trash is a flat list, like the lesson one. */
export default function StudentsPage({ user, trash = false }: { user: User; trash?: boolean }) {
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<StudentLevel | ''>('');
  const [filters, setFilters] = useState<StudentFilters>({ search: '', level: '' });
  const client = useQueryClient();
  const state = trash ? 'trash' : 'active';
  const students = useQuery({
    queryKey: studentListKey(user.id, filters, state),
    queryFn: ({ signal }) => listStudents(filters, signal, state),
    retry: false,
  });
  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'trash' | 'restore' | 'delete' }) => transitionStudent(id, action),
    retry: false,
    onSuccess: async (_, { id }) => {
      client.removeQueries({ queryKey: studentDetailKey(user.id, id) });
      await client.invalidateQueries({ queryKey: ['students', user.id] });
    },
  });
  function act(id: string, name: string, action: 'trash' | 'restore' | 'delete') {
    const question = action === 'delete'
      ? '¿Eliminar definitivamente a "' + name + '"? Sus clases asignadas dejarán de estarlo. Esta acción no se puede deshacer.'
      : action === 'restore' ? '¿Restaurar a "' + name + '"?' : '¿Enviar a "' + name + '" a la papelera?';
    if (window.confirm(question)) transition.mutate({ id, action });
  }
  const filtered = !!(filters.search || filters.level);
  function clearFilters() {
    setSearch(''); setLevel(''); setFilters({ search: '', level: '' });
  }
  return <section className="card students-page" data-testid="students-page">
    <p className="eyebrow">Tus estudiantes</p>
    <h1>{trash ? 'Papelera de estudiantes' : 'Mis estudiantes'}</h1>
    <nav className="students-navigation">{trash ? <Link to="/students">Volver a Mis estudiantes</Link> : <>
      <Link className="button pf-btn" to="/students/new"><Plus aria-hidden="true" size={17} />Crear estudiante</Link><Link to="/students/trash">Papelera</Link><Link to="/">Mis clases</Link>
    </>}</nav>
    <p>{trash
      ? 'Restaura tus estudiantes o elimínalos definitivamente.'
      : 'Encuentra a tus estudiantes por nombre o intereses.'}</p>
    {!trash && <form className="students-filters" onSubmit={(event) => { event.preventDefault(); setFilters({ search: search.trim(), level }); }}>
      <div><label htmlFor="student-search">Buscar por nombre o intereses</label>
        <input id="student-search" type="search" maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <div><label htmlFor="student-level">Nivel</label>
        <select id="student-level" value={level} onChange={(event) => setLevel(event.target.value as StudentLevel | '')}>
          <option value="">Todos los niveles</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <Button type="submit" icon={Search}>Buscar</Button>
      <Button variant="secondary" type="button" icon={FilterX} onClick={clearFilters}>Limpiar filtros</Button>
    </form>}
    {transition.isError && <div role="alert" className="error"><p>{transition.error instanceof TypeError
      ? 'No pudimos confirmar la operación. Actualiza el listado antes de volver a intentarlo.' : transition.error.message}</p>
      <Button icon={RefreshCw} disabled={students.isFetching} onClick={() => void students.refetch()}>Actualizar listado</Button></div>}
    <div aria-live="polite" aria-busy={students.isFetching}>
      {students.isPending && <p role="status">Cargando tus estudiantes…</p>}
      {students.isError && <div role="alert" className="error">
        <p>No pudimos cargar tus estudiantes.</p>
        <Button type="button" icon={RefreshCw} onClick={() => void students.refetch()} disabled={students.isFetching}>Reintentar estudiantes</Button>
      </div>}
      {students.isSuccess && <>
        {students.isFetching && <p role="status">Actualizando estudiantes…</p>}
        {students.data.length === 0
          ? <p>{trash
            ? 'La papelera está vacía.'
            : filtered ? 'No hay estudiantes que coincidan con estos filtros.' : 'Aún no tienes estudiantes.'}</p>
          : <ul className="student-list">{students.data.map((student) =>
            <li key={student.id}><h2><Link to={'/students/' + student.id}>{student.name}</Link></h2>
              <span className="level-badge">{student.level}</span>
              <p className="student-interests">{student.interests ?? 'Sin indicar'}</p>
              <p className="student-assigned-count">{student.assignedLessonCount === 1
                ? '1 clase asignada' : student.assignedLessonCount + ' clases asignadas'}</p>
              <div className="student-actions">{!trash && <>
                <Link className="button pf-btn" to={'/students/' + student.id}><Eye aria-hidden="true" size={17} />Ver ficha</Link>
                <Link className="button pf-btn pf-btn--warning" to={'/students/' + student.id + '/edit'} aria-label={'Editar ' + student.name}><Pencil aria-hidden="true" size={17} />Editar</Link>
                <Button variant="danger" disabled={transition.isPending} icon={Trash2}
                  aria-label={'Enviar a papelera ' + student.name} onClick={() => act(student.id, student.name, 'trash')}>Enviar a papelera</Button>
              </>}
                {trash && <>
                  <Button variant="accent" disabled={transition.isPending} icon={RotateCcw}
                    aria-label={'Restaurar ' + student.name} onClick={() => act(student.id, student.name, 'restore')}>Restaurar</Button>
                  <Button variant="danger" disabled={transition.isPending} icon={Ban}
                    aria-label={'Eliminar definitivamente ' + student.name} onClick={() => act(student.id, student.name, 'delete')}>Eliminar definitivamente</Button>
                </>}
                {transition.isPending && transition.variables.id === student.id && <span role="status">Procesando…</span>}
              </div></li>)}</ul>}
      </>}
    </div>
  </section>;
}
