import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assignStudentToLesson, listAssignedStudents, listStudents, unassignStudentFromLesson } from './student-api';
import type { AssignedStudent } from './student-api';

export type AssignedStudentsProps = {
  lessonId: string;
  userId: string;
};

const ACTIVE = 'active' as const;

async function readErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof Response) {
    try {
      const problem = await error.json();
      if (Array.isArray(problem?.errors)) return problem.errors.join(' ');
      if (typeof problem?.detail === 'string' && problem.detail) return problem.detail;
      if (typeof problem?.title === 'string' && problem.title) return problem.title;
    } catch { /* The body may not be JSON at all. */ }
    return fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export default function AssignedStudents({ lessonId, userId }: AssignedStudentsProps) {
  const client = useQueryClient();
  const [pendingUnassign, setPendingUnassign] = useState<string | null>(null);
  const [failedUnassign, setFailedUnassign] = useState<{ studentId: string; message: string } | null>(null);
  const [assignFailure, setAssignFailure] = useState<string | null>(null);

  const assignedQuery = useQuery({
    queryKey: ['assigned-students', lessonId],
    queryFn: ({ signal }) => listAssignedStudents(lessonId, signal),
    retry: false,
  });
  const candidatesQuery = useQuery({
    queryKey: ['students', userId, 'active'],
    queryFn: ({ signal }) => listStudents({ search: '', level: '' }, signal, ACTIVE),
    retry: false,
  });

  const assigned = assignedQuery.data ?? [];
  const assignedIds = new Set(assigned.map((student) => student.id));
  const candidates = (candidatesQuery.data ?? []).filter((student) => !assignedIds.has(student.id));

  const invalidate = () => client.invalidateQueries({ queryKey: ['assigned-students', lessonId] });

  const assign = useMutation({
    mutationFn: (studentId: string) => {
      setAssignFailure(null);
      return assignStudentToLesson(lessonId, studentId);
    },
    retry: false,
    onSuccess: async (student: AssignedStudent) => {
      client.setQueryData<AssignedStudent[]>(['assigned-students', lessonId], (current = []) =>
        current.some((item) => item.id === student.id) ? current : [...current, student]);
      await invalidate();
    },
    onError: async (error) => setAssignFailure(await readErrorMessage(error, 'No pudimos asignar al estudiante. Vuelve a intentarlo.')),
  });

  const unassign = useMutation({
    mutationFn: ({ studentId }: { studentId: string }) => {
      setPendingUnassign(studentId);
      setFailedUnassign(null);
      return unassignStudentFromLesson(lessonId, studentId);
    },
    retry: false,
    onSuccess: async (_, { studentId }) => {
      client.setQueryData<AssignedStudent[]>(['assigned-students', lessonId], (current = []) =>
        current.filter((student) => student.id !== studentId));
      await invalidate();
    },
    onError: async (error, { studentId }) =>
      setFailedUnassign({ studentId, message: await readErrorMessage(error, 'No pudimos quitar la asignación. Vuelve a intentarlo.') }),
    onSettled: () => setPendingUnassign(null),
  });

  const busy = assign.isPending || unassign.isPending;

  return <section className="assigned-students" data-testid="assigned-students">
    <h2>Estudiantes asignados</h2>
    <p>Añade o quita estudiantes sin guardar la clase: esta sección va por su cuenta y no toca el borrador.</p>

    {assignedQuery.isPending && <p role="status">Cargando estudiantes asignados…</p>}

    {(assignedQuery.isError || candidatesQuery.isError) && <div role="alert" className="error">
      <p>No pudimos cargar los estudiantes.</p>
      <button disabled={assignedQuery.isFetching || candidatesQuery.isFetching}
        onClick={() => { void assignedQuery.refetch(); void candidatesQuery.refetch(); }}>Reintentar estudiantes</button>
    </div>}

    {assignedQuery.isSuccess && assigned.length === 0 && <p className="assigned-students-empty">
      Esta clase todavía no tiene estudiantes asignados.
    </p>}

    {assigned.length > 0 && <ul className="lesson-list">
      {assigned.map((student) => <li key={student.id}>
        <Link to={'/students/' + student.id}>{student.name}</Link>
        <span className="level-badge">{student.level}</span>
        {student.inTrash && <span className="trash-mark" data-testid="trash-mark">En papelera</span>}
        <div className="lesson-actions">
          {student.inTrash
            ? <small>Restaura al estudiante para poder quitar la asignación.</small>
            : <button className="secondary" disabled={busy} aria-label={'Quitar asignación de ' + student.name}
                onClick={() => unassign.mutate({ studentId: student.id })}>Quitar asignación</button>}
          {pendingUnassign === student.id && <span role="status">Quitando…</span>}
          {failedUnassign?.studentId === student.id && <span role="alert" className="error">{failedUnassign.message}
            <button className="secondary" onClick={() => unassign.mutate({ studentId: student.id })}>Reintentar</button></span>}
        </div>
      </li>)}
    </ul>}

    <div className="student-picker" data-testid="student-picker">
      <label htmlFor="assigned-student-picker">Asignar estudiante</label>
      {candidatesQuery.isSuccess && candidates.length === 0
        ? <p>No tienes estudiantes activos que asignar. <Link to="/students/new">Crear estudiante</Link></p>
        : <>
          <select id="assigned-student-picker" defaultValue="" disabled={busy || !candidatesQuery.isSuccess}
            onChange={(event) => { if (event.target.value) assign.mutate(event.target.value); }}>
            <option value="" disabled>Elige un estudiante</option>
            {candidates.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.level}</option>)}
          </select>
          {assign.isPending && <span role="status">Asignando…</span>}
          {assignFailure && <span role="alert" className="error">{assignFailure}
            <button className="secondary" onClick={() => assign.variables && assign.mutate(assign.variables)}>Reintentar</button></span>}
        </>}
    </div>
  </section>;
}
