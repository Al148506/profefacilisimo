import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatLessonDuration } from '../lessons/lesson-duration';
import { listLessons, type LessonListItem } from '../lessons/lesson-api';
import { assignLessonToStudent, unassignLessonFromStudent, type StudentDetails } from './student-api';
import { readErrorMessage } from './student-errors';

const ACTIVE = 'active' as const;

/** The lessons assigned to a student, read from the profile that already carries them. */
export default function AssignedLessons({ student, userId }: { student: StudentDetails; userId: string }) {
  const client = useQueryClient();
  const [pendingUnassign, setPendingUnassign] = useState<string | null>(null);
  const [failedUnassign, setFailedUnassign] = useState<{ lessonId: string; message: string } | null>(null);
  const [assignFailure, setAssignFailure] = useState<string | null>(null);
  const assigned = student.assignedLessons;
  const assignedIds = new Set(assigned.map((lesson) => lesson.id));

  const candidatesQuery = useQuery({
    queryKey: ['lessons', userId, ACTIVE, '', ''],
    queryFn: ({ signal }) => listLessons({ search: '', level: '' }, signal, ACTIVE),
    retry: false,
  });
  const candidates = (candidatesQuery.data ?? []).filter((lesson: LessonListItem) => !assignedIds.has(lesson.id));

  const invalidate = () => client.invalidateQueries({ queryKey: ['students', userId, 'detail', student.id] });

  const assign = useMutation({
    mutationFn: (lessonId: string) => {
      setAssignFailure(null);
      return assignLessonToStudent(student.id, lessonId);
    },
    retry: false,
    onSuccess: async () => {
      await invalidate();
    },
    onError: (error) => setAssignFailure(readErrorMessage(error, 'No pudimos asignar la clase. Vuelve a intentarlo.')),
  });

  const unassign = useMutation({
    mutationFn: ({ lessonId }: { lessonId: string }) => {
      setPendingUnassign(lessonId);
      setFailedUnassign(null);
      return unassignLessonFromStudent(student.id, lessonId);
    },
    retry: false,
    onSuccess: async () => {
      await invalidate();
    },
    onError: (error, { lessonId }) =>
      setFailedUnassign({ lessonId, message: readErrorMessage(error, 'No pudimos quitar la asignación. Vuelve a intentarlo.') }),
    onSettled: () => setPendingUnassign(null),
  });

  const busy = assign.isPending || unassign.isPending;

  return <section className="student-assigned-lessons" data-testid="assigned-lessons">
    <h2>Clases asignadas</h2>
    <p>Añade o quita clases sin salir de la ficha del estudiante.</p>

    {assignFailure && <p role="alert" className="error">{assignFailure}
      <button className="secondary" onClick={() => assign.variables && assign.mutate(assign.variables)}>Reintentar</button></p>}

    {candidatesQuery.isError && <div role="alert" className="error">
      <p>No pudimos cargar tus clases.</p>
      <button disabled={candidatesQuery.isFetching} onClick={() => void candidatesQuery.refetch()}>Reintentar clases</button>
    </div>}

    {assigned.length === 0
      ? <p className="assigned-lessons-empty">Este estudiante todavía no tiene clases asignadas.</p>
      : <ul className="lesson-list">
        {assigned.map((lesson) => <li key={lesson.id}>
          <h3 className="assigned-lesson-title">{lesson.title}</h3>
          <span className="level-badge">{lesson.level}</span>
          <p className="lesson-duration">{formatLessonDuration(lesson.estimatedDuration)}</p>
          {lesson.inTrash && <span className="trash-mark" data-testid="trash-mark">En papelera</span>}
          <div className="lesson-actions">
            {lesson.inTrash
              ? <small>Restaura la clase para poder quitar la asignación.</small>
              : <button className="secondary" disabled={busy} aria-label={'Quitar asignación de ' + lesson.title}
                onClick={() => unassign.mutate({ lessonId: lesson.id })}>Quitar asignación</button>}
            {pendingUnassign === lesson.id && <span role="status">Quitando…</span>}
            {failedUnassign?.lessonId === lesson.id && <span role="alert" className="error">{failedUnassign.message}
              <button className="secondary" onClick={() => unassign.mutate({ lessonId: lesson.id })}>Reintentar</button></span>}
          </div>
        </li>)}
      </ul>}

    <div className="student-picker" data-testid="student-picker">
      <label htmlFor="assigned-lesson-picker">Asignar clase</label>
      {candidatesQuery.isSuccess && candidates.length === 0
        ? <p>No tienes clases activas que asignar. <Link to="/lessons/new">Crear clase</Link></p>
        : <>
          <select id="assigned-lesson-picker" defaultValue="" disabled={busy || !candidatesQuery.isSuccess}
            onChange={(event) => { if (event.target.value) assign.mutate(event.target.value); }}>
            <option value="" disabled>Elige una clase</option>
            {candidates.map((lesson: LessonListItem) => <option key={lesson.id} value={lesson.id}>{lesson.title} · {lesson.level}</option>)}
          </select>
          {assign.isPending && <span role="status">Asignando…</span>}
        </>}
    </div>
  </section>;
}
