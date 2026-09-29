import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { emptyStudentValues, studentSchema, studentValuesFrom, toSaveStudentValues, type StudentFormValues, type StudentValues } from './student-schema';
import { StudentSaveError, getStudent, saveStudent, studentDetailKey, type StudentDetails } from './student-api';

/** Field keys the server can reject, mapped to the form field that owns them. */
const SERVER_FIELDS = ['name', 'level', 'email', 'nativeLanguage', 'interests', 'goals', 'notes'] as const;

function StudentForm({ userId, initial }: { userId: string; initial?: StudentDetails }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const form = useForm<StudentFormValues, unknown, StudentValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: initial ? studentValuesFrom(initial) : emptyStudentValues(),
  });
  const mutation = useMutation({
    mutationFn: (values: StudentValues) => saveStudent(toSaveStudentValues(values), initial?.id),
    retry: false,
    onSuccess: (saved) => {
      form.reset(studentValuesFrom(saved));
      client.setQueryData(studentDetailKey(userId, saved.id), saved);
      void client.invalidateQueries({ queryKey: ['students', userId] });
      if (!initial) navigate('/students/' + saved.id, { replace: true });
    },
    onError: (error) => {
      // The form is kept exactly as it is: a rejected save never discards what was typed.
      if (!(error instanceof StudentSaveError)) return;
      for (const field of SERVER_FIELDS) {
        const message = error.fields[field]?.[0];
        if (message) form.setError(field, { message });
      }
    },
  });
  const saving = mutation.isPending;
  const dirty = form.formState.isDirty;

  function back() {
    if (!dirty || window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?')) navigate('/students');
  }

  return <section className="card student-form" data-testid="student-form">
    <p className="eyebrow">Tu espacio como profe</p>
    <h1>{initial ? 'Editar estudiante' : 'Crear estudiante'}</h1>
    <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate>
      <fieldset disabled={saving}>
        <label htmlFor="student-name">Nombre</label>
        <input id="student-name" {...form.register('name')} aria-invalid={!!form.formState.errors.name} aria-describedby="student-name-error" />
        <small className="error" id="student-name-error">{form.formState.errors.name?.message}</small>
        <label htmlFor="student-form-level">Nivel</label>
        <select id="student-form-level" {...form.register('level')} aria-invalid={!!form.formState.errors.level} aria-describedby="student-form-level-error">
          <option value="A2">A2</option><option value="B1">B1</option><option value="B2">B2</option>
        </select>
        <small className="error" id="student-form-level-error">{form.formState.errors.level?.message}</small>
        <label htmlFor="student-email">Correo</label>
        <input id="student-email" type="email" {...form.register('email')} aria-invalid={!!form.formState.errors.email} aria-describedby="student-email-error" />
        <small className="error" id="student-email-error">{form.formState.errors.email?.message}</small>
        <label htmlFor="student-native-language">Lengua materna</label>
        <input id="student-native-language" {...form.register('nativeLanguage')} aria-invalid={!!form.formState.errors.nativeLanguage} aria-describedby="student-native-language-error" />
        <small className="error" id="student-native-language-error">{form.formState.errors.nativeLanguage?.message}</small>
        <label htmlFor="student-interests">Intereses</label>
        <textarea id="student-interests" rows={3} {...form.register('interests')} aria-invalid={!!form.formState.errors.interests} aria-describedby="student-interests-error" />
        <small className="error" id="student-interests-error">{form.formState.errors.interests?.message}</small>
        <label htmlFor="student-goals">Objetivos</label>
        <textarea id="student-goals" rows={3} {...form.register('goals')} aria-invalid={!!form.formState.errors.goals} aria-describedby="student-goals-error" />
        <small className="error" id="student-goals-error">{form.formState.errors.goals?.message}</small>
        <label htmlFor="student-notes">Notas</label>
        <textarea id="student-notes" rows={4} {...form.register('notes')} aria-invalid={!!form.formState.errors.notes} aria-describedby="student-notes-error" />
        <small className="error" id="student-notes-error">{form.formState.errors.notes?.message}</small>
      </fieldset>
      {mutation.isError && <p role="alert" className="error">{mutation.error instanceof TypeError
        ? 'No pudimos conectar. Conservamos tus cambios; comprueba si se guardaron antes de reintentar.'
        : mutation.error.message}</p>}
      {mutation.isSuccess && !dirty && <p role="status">Estudiante guardado.</p>}
      <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
    </form>
    <button className="secondary" disabled={saving} onClick={back}>Volver a Mis estudiantes</button>
  </section>;
}

export default function StudentFormPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: studentDetailKey(user?.id ?? '', id ?? ''),
    queryFn: ({ signal }) => getStudent(id!, signal),
    enabled: !!(id && user), retry: false,
  });
  const navigate = useNavigate();
  if (!user) return null;
  if (!id) return <StudentForm key={user.id + '-new'} userId={user.id} />;
  if (!query.data) return <section className="card">
    {query.isPending ? <p role="status">Cargando estudiante…</p> : <div role="alert"><p>{query.error?.message}</p><button disabled={query.isFetching} onClick={() => void query.refetch()}>Reintentar</button></div>}
    <button className="secondary" onClick={() => navigate('/students')}>Volver a Mis estudiantes</button>
  </section>;
  return <StudentForm key={user.id + '-' + id} userId={user.id} initial={query.data} />;
}
