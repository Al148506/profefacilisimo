/**
 * Fase 0 · stub del contrato C3.
 *
 * La firma está congelada en `specs/04-student-management-contract.md` (C3.1): el Flujo A la importa
 * desde `LessonEditorPage.tsx` y no puede cambiarla. El Flujo B sustituye este cuerpo entero por la
 * implementación real, y esta cabecera se elimina con él.
 *
 * Mientras el stub siga aquí, el editor compila pero la sección no renderiza nada. Los puntos de
 * integración I4 e I6 son los que comprueban que la sustitución ocurrió de verdad.
 */
export type AssignedStudentsProps = {
  lessonId: string;
  userId: string;
};

export default function AssignedStudents(_props: AssignedStudentsProps) {
  return <section className="assigned-students" data-testid="assigned-students" />;
}
