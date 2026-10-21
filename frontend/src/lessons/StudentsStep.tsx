import { Link } from 'react-router-dom';
import { RefreshCw, Unlink } from 'lucide-react';
import { Button } from '../components/Button';
import type { AssignedStudent, StudentListItem } from '../students/student-api';

export type StudentsStepProps = {
  /** The staged selection: what will be on the server after the next save. Owned by the editor. */
  selected: AssignedStudent[];
  /** Active students still missing from the selection, in listing order. */
  candidates: StudentListItem[];
  /** The assignment or candidate load is still running: the step answers nothing while it shows. */
  loading: boolean;
  /** One of the loads failed: the teacher must retry before touching the selection. */
  loadError: boolean;
  onRetry: () => void;
  onAdd: (studentId: string) => void;
  onRemove: (studentId: string) => void;
};

/**
 * The third step of the editor: the student assignment, kept entirely inside the draft. Nothing
 * here writes to the server on its own — adds and removals only move the staged selection, and the
 * editor applies the difference when the class is saved. A trashed student stays in the selection
 * marked and cannot be removed, exactly like the old immediate section refused it.
 */
export default function StudentsStep({ selected, candidates, loading, loadError, onRetry, onAdd, onRemove }: StudentsStepProps) {
  return <section className="students-step" data-testid="students-step">
    <p className="editor-step-hint">Asigna estudiantes a la clase. Es opcional: puedes guardar sin seleccionar ninguno, y nada se aplica hasta que guardes la clase.</p>

    {loading && <p role="status">Cargando estudiantes…</p>}

    {loadError && <div role="alert" className="error">
      <p>No pudimos cargar los estudiantes.</p>
      <Button variant="secondary" icon={RefreshCw} onClick={onRetry}>Reintentar estudiantes</Button>
    </div>}

    {!loading && !loadError && selected.length === 0 && <p className="assigned-students-empty" data-testid="students-empty">
      Todavía no has asignado estudiantes a esta clase.
    </p>}

    {selected.length > 0 && <ul className="lesson-list" data-testid="selected-students">
      {selected.map((student) => <li key={student.id}>
        <Link to={'/students/' + student.id}>{student.name}</Link>
        <span className="level-badge">{student.level}</span>
        {student.inTrash && <span className="trash-mark" data-testid="trash-mark">En papelera</span>}
        <div className="lesson-actions">
          {student.inTrash
            ? <small>Restaura al estudiante para poder quitar la asignación.</small>
            : <Button variant="secondary" icon={Unlink} aria-label={'Quitar a ' + student.name}
                onClick={() => onRemove(student.id)}>Quitar</Button>}
        </div>
      </li>)}
    </ul>}

    <div className="student-picker" data-testid="student-picker">
      <label htmlFor="students-step-picker">Asignar estudiante</label>
      {!loading && !loadError && candidates.length === 0
        ? <p>No tienes estudiantes activos que asignar. <Link to="/students/new">Crear estudiante</Link></p>
        : <select id="students-step-picker" value="" disabled={loading || loadError}
            onChange={(event) => { if (event.target.value) onAdd(event.target.value); }}>
            <option value="">Elige un estudiante</option>
            {candidates.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.level}</option>)}
          </select>}
    </div>
  </section>;
}
