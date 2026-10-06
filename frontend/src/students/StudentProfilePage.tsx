import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth';
import { Button } from '../components/Button';
import { getStudent, studentDetailKey, transitionStudent } from './student-api';
import AssignedLessons from './AssignedLessons';

/** An absent optional is shown as this, never as a blank line. */
const ABSENT = 'Sin indicar';

function Field({ label, value }: { label: string; value: string | null }) {
  return <div><dt>{label}</dt><dd>{value ?? ABSENT}</dd></div>;
}

export default function StudentProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: studentDetailKey(user?.id ?? '', id ?? ''),
    queryFn: ({ signal }) => getStudent(id!, signal),
    enabled: !!(id && user), retry: false,
  });
  const transition = useMutation({
    mutationFn: ({ action }: { action: 'trash' | 'restore' | 'delete' }) => transitionStudent(id!, action),
    retry: false,
    onSuccess: async () => {
      client.removeQueries({ queryKey: studentDetailKey(user?.id ?? '', id ?? '') });
      await client.invalidateQueries({ queryKey: ['students', user?.id ?? ''] });
      navigate('/students');
    },
  });
  if (!user) return null;
  if (!query.data) return <section className="card">
    {query.isPending
      ? <p role="status">Cargando estudiante…</p>
      : <div role="alert" className="error"><p>{query.error?.message}</p>
        <Button icon={RefreshCw} disabled={query.isFetching} onClick={() => void query.refetch()}>Reintentar</Button></div>}
    <Link className="button secondary pf-btn" to="/students"><ArrowLeft aria-hidden="true" size={17} />Volver a Mis estudiantes</Link>
  </section>;
  const student = query.data;
  function act() {
    const question = '¿Enviar a "' + student.name + '" a la papelera?';
    if (window.confirm(question)) transition.mutate({ action: 'trash' });
  }
  return <section className="card student-profile" data-testid="student-profile">
    <p className="eyebrow">Ficha del estudiante</p>
    <h1>{student.name}</h1>
    <nav className="students-navigation">
      <Link to="/students">Volver a Mis estudiantes</Link>
      <Link className="button pf-btn pf-btn--warning" to={'/students/' + student.id + '/edit'}><Pencil aria-hidden="true" size={17} />Editar</Link>
      <Button variant="secondary" icon={Trash2} disabled={transition.isPending} onClick={act}>Enviar a papelera</Button>
    </nav>
    {transition.isError && <p role="alert" className="error">{transition.error instanceof TypeError
      ? 'No pudimos confirmar la operación. Actualiza la ficha antes de volver a intentarlo.' : transition.error.message}</p>}
    <dl className="student-profile-fields">
      <Field label="Nivel" value={student.level} />
      <Field label="Correo" value={student.email} />
      <Field label="Lengua materna" value={student.nativeLanguage} />
      <Field label="Intereses" value={student.interests} />
      <Field label="Objetivos" value={student.goals} />
      <Field label="Notas" value={student.notes} />
    </dl>
    <AssignedLessons student={student} userId={user.id} />
  </section>;
}
