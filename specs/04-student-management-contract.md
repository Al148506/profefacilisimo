# SPEC 04 · Fase 0 — Contrato congelado

> **Estado:** Congelado
> **Fecha:** 2026-09-28
> **Plan:** `specs/04-student-management-parallel.md` §3
> **Spec original:** `specs/04-student-management.md`
> **Rama:** `spec-04-student-management--contract`

Este documento materializa los contratos **C1–C6** del §3 del plan paralelo. Las tablas de §3 ya los
cerraban; aquí se copian a un fichero propio, con los nombres exactos y los artefactos concretos, para
que ningún flujo tenga que reabrir el plan para consultarlos.

**Nada de este fichero se inventó en esta fase.** Todo sale del §3 del plan paralelo y del §4.4 y §5
de la spec original. Lo único que se añade es la lista de **nombres de exportación** de C3, que el §3
congelaba por enumeración y aquí queda por escrito con su firma TypeScript.

**Regla de uso:** una vez repartidos los flujos, cualquier cambio en este documento rompe dos flujos a
la vez. Es el único punto del plan que no admite revisión tardía.

---

## C1 · DTO y nombres de campo

Tipos TypeScript, tal como los consume el frontend. `StudentLevel` **no** se declara aquí: es un alias
del `LessonLevel` que ya existe en `frontend/src/lessons/lesson-api.ts` (C3).

```typescript
type StudentLevel = 'A2' | 'B1' | 'B2';   // alias de LessonLevel, no un enum nuevo

type SaveStudentRequest = {
  name: string;
  level: StudentLevel;
  email: string | null;
  nativeLanguage: string | null;
  interests: string | null;
  goals: string | null;
  notes: string | null;
};

type StudentListItemDto = {
  id: string;
  name: string;
  level: StudentLevel;
  /** Resumen de intereses; null cuando no hay. */
  interests: string | null;
  /** Clases asignadas, incluidas las que están en papelera. */
  assignedLessonCount: number;
  updatedAt: string;
  deletedAt: string | null;
};

type StudentDetailsDto = StudentListItemDto & {
  email: string | null;
  nativeLanguage: string | null;
  goals: string | null;
  notes: string | null;
  createdAt: string;
  assignedLessons: AssignedLessonDto[];
};

type AssignedLessonDto = {
  id: string;
  title: string;
  level: StudentLevel;
  /** Total persistido; null significa «Duración incompleta». */
  estimatedDuration: number | null;
  /** Una clase en papelera sigue asignada y se muestra marcada. */
  inTrash: boolean;
  assignedAt: string;
};

type AssignedStudentDto = {
  id: string;
  name: string;
  level: StudentLevel;
  /** Un estudiante en papelera sigue asignado y se muestra marcado. */
  inTrash: boolean;
  assignedAt: string;
};
```

**Invariantes congelados:**

- `assignedLessonCount` **cuenta también las clases en papelera**. Es el mismo número en el listado y
  en la ficha.
- Los campos opcionales viajan como `null`, **nunca** como `''`. La cadena vacía y la cadena de solo
  espacios se normalizan a `null` en el servidor; el esquema Zod hace lo mismo en el cliente.
- `UserId`, `StudentId` y `LessonId` nunca se aceptan como valores autoritativos del cliente.
- Los DTO de `Lesson` **no cambian**: `LessonDetailsDto` / `LessonListItemDto` conservan su forma y no
  devuelven estudiantes.

---

## C2 · Rutas, verbos y códigos de estado

| Método y ruta                                          | Función                                       | Éxito |
| ------------------------------------------------------ | --------------------------------------------- | ----- |
| `GET /api/students?state=active\|trash&search=&level=` | Listar los estudiantes del profesor           | 200   |
| `GET /api/students/{id}`                               | Ficha del estudiante con sus clases asignadas | 200   |
| `POST /api/students`                                   | Crear estudiante                              | 201   |
| `PUT /api/students/{id}`                               | Editar estudiante                             | 200   |
| `POST /api/students/{id}/trash`                        | Enviar a papelera                             | 204   |
| `POST /api/students/{id}/restore`                      | Restaurar de la papelera                      | 204   |
| `DELETE /api/students/{id}`                            | Eliminar definitivamente                      | 204   |
| `POST /api/lessons/{id}/students`                      | Asignar un estudiante a la clase              | 201   |
| `DELETE /api/lessons/{id}/students/{studentId}`        | Quitar la asignación desde la clase           | 204   |
| `POST /api/students/{id}/lessons`                      | Asignar una clase al estudiante               | 201   |
| `DELETE /api/students/{id}/lessons/{lessonId}`         | Quitar la asignación desde la ficha           | 204   |

**Cuerpo de las cuatro operaciones de asignación:**

- Desde la clase: `POST /api/lessons/{id}/students` con `{ "studentId": "<guid>" }`.
- Desde la ficha: `POST /api/students/{id}/lessons` con `{ "lessonId": "<guid>" }`.

**Códigos de error, idénticos en los cuatro endpoints de asignación:**

| Código | Cuándo                                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `401`  | Sin sesión válida, en todos.                                                                                                            |
| `404`  | El estudiante o la clase no existe **o pertenece a otro profesor**. También al quitar una asignación que no existe. No modifica nada.   |
| `400`  | `ValidationProblemDetails` con las claves de campo si el cuerpo no cumple §3.3 de la spec original. Nada se persiste.                   |
| `400`  | Al intentar asignar un estudiante o una clase **en papelera**, con un mensaje que lo explica.                                            |
| `409`  | Al enviar a papelera un estudiante ya en papelera, o al restaurar uno activo.                                                           |

**Idempotencia de la asignación:** asignar una pareja que ya existe responde **`201` con la asignación
existente**, no `409`. Repetir la acción desde las dos pantallas es seguro. El índice único
`(StudentId, LessonId)` protege la integridad.

---

## C3 · Fronteras de módulo

### C3.1 · `frontend/src/students/AssignedStudents.tsx` (Flujo B)

La firma está congelada. El Flujo A la importa desde `LessonEditorPage.tsx` y no puede cambiarla.

```typescript
export type AssignedStudentsProps = {
  lessonId: string;
  userId: string;
};

export default function AssignedStudents({ lessonId, userId }: AssignedStudentsProps): JSX.Element;
```

- El componente se renderiza **fuera** del `<form>` del editor y **fuera** de `lessonDraftSchema` y
  `draftFingerprint`.
- No recibe el borrador ni lo lee. Asignar o quitar no marca la clase como modificada.

### C3.2 · `frontend/src/students/student-api.ts` (Flujo C)

Nombres de exportación congelados. Los consumen el Flujo A (solo los de asignación, vía el envoltorio)
y el Flujo C.

```typescript
export type StudentLevel = 'A2' | 'B1' | 'B2';
export type StudentFilters = { search: string; level: StudentLevel | '' };
export type StudentListItem = { /* = StudentListItemDto de C1 */ };
export type AssignedLesson = { /* = AssignedLessonDto de C1 */ };
export type AssignedStudent = { /* = AssignedStudentDto de C1 */ };
export type StudentDetails = { /* = StudentDetailsDto de C1 */ };
export type SaveStudentValues = { /* = SaveStudentRequest de C1 */ };

/** Error de guardado que conserva las claves del `ValidationProblemDetails`, como `LessonSaveError`. */
export class StudentSaveError extends Error {
  readonly fields: Record<string, string[]>;
}

export const studentListKey: (
  userId: string, filters: StudentFilters, state?: 'active' | 'trash',
) => readonly ['students', string, 'active' | 'trash', string, string];

export const studentDetailKey: (userId: string, id: string) => readonly ['students', string, 'detail', string];

export function listStudents(
  filters: StudentFilters, signal?: AbortSignal, state?: 'active' | 'trash',
): Promise<StudentListItem[]>;

export function getStudent(id: string, signal?: AbortSignal): Promise<StudentDetails>;
export function saveStudent(values: SaveStudentValues, id?: string): Promise<StudentDetails>;
export function transitionStudent(id: string, action: 'trash' | 'restore' | 'delete'): Promise<void>;

export function listAssignedStudents(lessonId: string, signal?: AbortSignal): Promise<AssignedStudent[]>;
export function assignStudentToLesson(lessonId: string, studentId: string): Promise<AssignedStudent>;
export function unassignStudentFromLesson(lessonId: string, studentId: string): Promise<void>;

export function listAssignedLessons(studentId: string, signal?: AbortSignal): Promise<AssignedLesson[]>;
export function assignLessonToStudent(studentId: string, lessonId: string): Promise<AssignedLesson>;
export function unassignLessonFromStudent(studentId: string, lessonId: string): Promise<void>;
```

**Nota sobre `listAssignedStudents` / `listAssignedLessons`:** el plan paralelo exige que la lectura se
sostenga sin el transporte del listado filtrado. Como el §3 solo congela los nombres, **las rutas de
lectura se derivan de C2 sin inventar endpoints nuevos**:

- `listAssignedStudents(lessonId)` → `GET /api/lessons/{id}` **no** sirve: C2 prohíbe que un endpoint de
  lección devuelva estudiantes. La lectura sale como filtrado en memoria del listado de estudiantes
  activos del profesor cruzado con el detalle de la clase; **el Flujo B consume la firma congelada y un
  doble**, así que su forma es la que manda y el Flujo C la implementa como considere dentro de su
  propia rama.

Esta es la única parte del contrato donde el plan deja libertad de implementación al Flujo C; **la
firma está congelada y es lo que no se toca.**

### C3.3 · Export por defecto de las cuatro páginas nuevas (Flujo C)

- `frontend/src/students/StudentsPage.tsx` → `export default function StudentsPage({ user })`
- `frontend/src/students/StudentFormPage.tsx` → `export default function StudentFormPage()`
- `frontend/src/students/StudentProfilePage.tsx` → `export default function StudentProfilePage()`
- `frontend/src/students/StudentsTrashPage.tsx` → `export default function StudentsTrashPage()`

Las cuatro usan `useParams` / `useAuth` / `useNavigate`, como `LessonEditorPage`. Las rutas las registra
la fase de integración en `App.tsx`, no el Flujo C.

---

## C4 · Clases CSS y ganchos E2E

Propietario de la hoja: **Flujo C** (`frontend/src/styles.css`, solo adiciones al final del fichero).
Los Flujos A y B las **leen**, nunca las escriben.

**Clases nuevas:**

| Clase                      | Dónde                                                        |
| -------------------------- | ------------------------------------------------------------ |
| `students-page`            | contenedor del listado y de la papelera                      |
| `students-navigation`      | bloque de navegación (Crear estudiante / Papelera)           |
| `students-filters`         | formulario de búsqueda y filtro por nivel                    |
| `student-list`             | lista de estudiantes                                         |
| `student-actions`          | acciones por estudiante dentro de la lista                   |
| `student-profile`          | contenedor de la ficha                                       |
| `student-profile-fields`   | bloque de campos de la ficha                                 |
| `student-assigned-lessons` | sección de clases asignadas en la ficha                      |
| `assigned-lessons-empty`   | estado vacío de la ficha                                     |
| `student-picker`           | selector de entidades activas (acción **Asignar**)           |
| `assigned-students`        | sección de estudiantes asignados en el editor                |
| `assigned-students-empty`  | estado vacío de la sección del editor                        |
| `trash-mark`               | marca «En papelera»                                          |

**Se reutilizan sin cambios:** `card`, `button`, `button secondary`, `danger`, `eyebrow`, `level-badge`,
`lesson-list`, `lesson-actions`, `error`, `status`, `footnote`.

**`data-testid` congelados:**

| `data-testid`       | Elemento                                              |
| ------------------- | ----------------------------------------------------- |
| `students-page`     | sección raíz del listado / papelera                   |
| `student-form`      | formulario de alta y edición                          |
| `student-profile`   | sección raíz de la ficha                              |
| `assigned-lessons`  | sección de clases asignadas en la ficha               |
| `assigned-students` | sección de estudiantes asignados en el editor         |
| `student-picker`    | selector de asignación de estudiantes (editor)          |
| `lesson-picker`     | selector de asignación de clases (ficha)                |
| `trash-mark`        | marca «En papelera»                                   |

> Enmienda (Ronda 2, P2-2): el picker de la ficha pasa de `student-picker` a `lesson-picker` para que
> cada selector tenga un gancho único; `student-picker` queda solo para el editor.

---

## C5 · Textos literales

Ningún flujo inventa una cadena. Estas son las únicas permitidas:

| Literal                                                      | Dónde                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `Sin indicar`                                                | campo opcional vacío en la ficha                             |
| `Duración incompleta`                                        | total persistido `null` (ya existe como `INCOMPLETE_DURATION_LABEL`) |
| `En papelera`                                                | marca en la ficha y en el editor                             |
| `Asignar clase`                                              | acción en la ficha                                           |
| `Asignar estudiante`                                         | acción en la sección del editor                              |
| `Quitar asignación`                                          | acción en las dos caras                                      |
| `Crear estudiante`                                           | navegación y estados vacíos                                  |
| `Limpiar filtros`                                            | vacío filtrado                                               |
| `Aún no tienes estudiantes.`                                 | listado vacío                                                |
| `No hay estudiantes que coincidan con estos filtros.`        | listado filtrado vacío                                       |
| `La papelera está vacía.`                                    | papelera vacía                                               |
| `Este estudiante todavía no tiene clases asignadas.`         | sin clases asignadas                                         |
| `Esta clase todavía no tiene estudiantes asignados.`         | sin estudiantes asignados                                    |
| `El estudiante no existe o no está disponible.`              | 404 de estudiante, con enlace al listado                     |
| `La clase no existe o no está disponible.`                   | 404 de clase, con enlace a Mis clases                        |

**`formatLessonDuration` se reutiliza tal cual**, importado de `frontend/src/lessons/lesson-duration.ts`.
Nunca se reimplementa, ni se copia su lógica, ni se declara un segundo «Duración incompleta».

---

## C6 · Modelo de datos cerrado

```csharp
public sealed class Student
{
    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }
    public string Name { get; private set; } = "";
    public string? Email { get; private set; }
    public LessonLevel Level { get; private set; }
    public string? NativeLanguage { get; private set; }
    public string? Interests { get; private set; }
    public string? Goals { get; private set; }
    public string? Notes { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public DateTimeOffset? DeletedAt { get; private set; }
}

public sealed class LessonAssignment
{
    public Guid Id { get; private set; }
    public Guid StudentId { get; private set; }
    public Guid LessonId { get; private set; }
    public DateTimeOffset AssignedAt { get; private set; }
}
```

| Longitud / índice                    | Valor                                                        |
| ------------------------------------ | ------------------------------------------------------------ |
| `Name`                               | obligatorio, máximo 200, no único                            |
| `Email`                              | opcional, máximo 254, **no único**                           |
| `NativeLanguage`                     | opcional, máximo 100                                         |
| `Interests`, `Goals`                 | opcional, máximo 2000                                        |
| `Notes`                              | opcional, máximo 4000                                        |
| `Level`                              | `LessonLevel` (A2, B1, B2), **sin segundo enum**             |
| Restricción `CK_Student_Level`       | mismos valores que `CK_Lesson_Level`                         |
| Restricción `CK_Student_Name`        | nombre no vacío                                               |
| Índice único                         | `(StudentId, LessonId)` sobre `LessonAssignments`            |
| Índices de consulta                  | `(UserId, UpdatedAt)` y `(UserId, DeletedAt)` en `Students`; `(LessonId)` en `LessonAssignments` |
| Claves foráneas                      | las dos, `ON DELETE CASCADE`                                 |
| Navegación de `Lesson`               | solo lectura hacia asignaciones, con `HasField("_assignments")` y `PropertyAccessMode.Field`, como `Lesson._activities` |
| `LessonAssignment.Status`            | **no existe**                                                 |
| Columnas nuevas en `Lessons`/`Activities` | **ninguna**                                              |

---

## Verificación de la Fase 0

| Comprobación                                                        | Resultado |
| ------------------------------------------------------------------- | --------- |
| `cd frontend && npx tsc -b` con el stub presente                     | ✅ |
| `dotnet build Profefacilisimo.slnx --no-restore` con el árbol intacto | ✅ |
| C1–C6 sin ningún nombre escrito de dos formas distintas              | ✅ |
| El stub `frontend/src/students/AssignedStudents.tsx` existe          | ✅ |

**Criterio de finalización cumplido:** C1–C6 cerrados, los dos comandos en verde y el stub presente.
