# SPEC 04 — Gestión de estudiantes (Student Management)

> **Estado:** Aprobado
> **Depende de:** SPEC 01 — Gestión de clases; SPEC 02 — Editor de actividades; SPEC 03 — Reproductor de clases.
> **Fecha:** 2026-09-28
> **Objetivo:** Permitir que el profesor mantenga una ficha básica de cada estudiante y asigne sus clases existentes a varios estudiantes, sin convertir el producto en un sistema de gestión educativa.

---

## 1. Objetivo

Esta especificación cierra el flujo que hoy queda abierto: preparar e impartir una clase ya funciona, pero la clase es una pieza aislada y no hay forma de registrar para quién se prepara.

```text
Dashboard → Estudiantes → Alta desde el listado → Ficha con información pedagógica
         → Asignar clases existentes desde la ficha
         → (o) Clase → Asignar estudiantes existentes
         → Ver las dos caras de la misma relación
```

Se conservan .NET 9, las cuatro capas existentes, PostgreSQL con contenido JSONB, y en el frontend React + TypeScript + Vite, TanStack Query, React Hook Form, Zod, React Router, los componentes y el estilo visual existentes, y el patrón de rutas protegidas.

Se introducen **dos** entidades nuevas: `Student` y `LessonAssignment`. `Student` es la primera entidad de dominio nueva desde la Fase 1, y `LessonAssignment` es la entidad intermedia que el modelo conceptual de la Fase 4 ya había decidido en lugar de un `StudentId` dentro de `Lesson`.

No se introduce `LessonSession`, ni progreso, ni vocabulario, ni tareas, ni IA, ni calendario, ni portal del estudiante.

---

## 2. Alcance

**Incluye:**

- Entidad `Student`, colgando del profesor en paralelo a `Lesson`.
- CRUD de estudiantes: crear, listar, consultar, editar y eliminar.
- Papelera de estudiantes, con listado propio, restaurar y eliminar definitivamente.
- Ficha del estudiante: nivel, lengua materna, intereses, objetivos y notas del profesor.
- Entidad intermedia `LessonAssignment` entre `Student` y `Lesson`.
- Asignar una clase existente a un estudiante y quitar la asignación desde los dos lados.
- Clases asignadas visibles en la ficha del estudiante, incluida la clase en papelera.
- Estudiantes asignados visibles en el detalle de la clase, incluido el estudiante en papelera.
- Búsqueda de estudiantes por nombre e intereses, y filtro por nivel.
- Estados de carga, error, vacío y éxito en las pantallas nuevas.
- Estilos de las pantallas nuevas y comportamiento en pantalla estrecha.

**Fuera del alcance (para versiones posteriores):**

- `LessonSession` y fechas de impartición.
- Historial detallado y línea temporal por estudiante.
- `Homework` y tareas asignadas.
- Progreso, analíticas de aprendizaje y vocabulario del estudiante.
- IA personalizada y generación de clases a partir del perfil.
- Calendario y programación de clases.
- Notificaciones y recordatorios.
- Portal o acceso del estudiante: el estudiante **no** es un usuario del sistema.
- Crear una clase desde la ficha del estudiante.
- Duplicar una clase por estudiante, o cualquier materialización de una asignación en copia.
- Importar estudiantes desde un fichero, exportarlos o compartir su ficha.
- Historial de niveles o estructuración de intereses como entidad propia.
- Teléfono, dirección, información financiera o médica, o cualquier otro dato excesivamente personal.
- Cambiar autenticación, framework, arquitectura o dependencias.

---

## 3. Comportamiento

### 3.1 Relación entre estudiantes y clases

- Un estudiante **pertenece a un profesor** y solo ese profesor lo ve, lo edita y lo elimina.
- Una clase **pertenece a un profesor** y conserva las reglas de SPEC 01 sin cambios.
- La relación se representa **siempre** con una fila de `LessonAssignment`. Nunca con un campo `StudentId` dentro de `Lesson` ni con un array de estudiantes dentro de un `Lesson` persistido.
- Una clase **puede estar asignada a varios estudiantes** a la vez.
- Un estudiante **puede tener varias clases asignadas** a la vez.
- Una clase **puede existir sin estudiantes asignados** y un estudiante sin clases asignadas.
- La misma pareja clase–estudiante existe **una sola vez**: repetir la asignación no crea una segunda fila.
- Asignar y quitar una asignación **no modifica la clase**: ni su contenido, ni sus actividades, ni su duración, ni su versión.
- Asignar una clase a un estudiante **no crea una copia** de la clase.
- La clase en papelera **sigue asignada** y se muestra en la ficha del estudiante, marcada como tal. Restaurarla la devuelve a la normalidad con sus asignaciones intactas.

### 3.2 Listado de estudiantes

- Ruta propia, protegida, con el listado de estudiantes del profesor.
- Cada estudiante muestra su nombre, su nivel y, si existe, un resumen de sus intereses.
- Cada estudiante muestra cuántas clases tiene asignadas.
- Cada estudiante ofrece las acciones **Ver ficha**, **Editar** y **Enviar a papelera**.
- La búsqueda por texto casa contra el **nombre** y contra los **intereses** del estudiante.
- El filtro por **nivel** usa los mismos valores que `Lesson.Level`: A2, B1 y B2.
- Búsqueda y filtro se combinan: el listado muestra los estudiantes que cumplen ambos.
- Limpiar filtros devuelve el listado completo, sin recargar la página.
- El listado ordena por fecha de actualización descendente y, en empate, por identificador, igual que el listado de clases.
- La papelera **no** aparece en este listado: vive en su propia ruta.

### 3.3 Alta y edición del estudiante

- El alta y la edición comparten el mismo formulario, con las mismas reglas.
- **Obligatorios:** `Name` y `Level`. El resto de campos son opcionales.
- Un campo opcional vacío se guarda como ausente, no como cadena vacía.
- Guardar con `Name` o `Level` inválidos no envía ninguna petición de escritura.
- La edición carga la ficha actual y solo escribe al confirmar.
- Una vez confirmado el guardado, el listado y la ficha muestran los datos nuevos sin recargar.
- El alta no crea ninguna clase ni ninguna asignación.

| Campo            | Obligatorio | Regla                                                                                      |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `name`           | Sí          | No vacío tras recortar. Máximo 200 caracteres.                                             |
| `level`          | Sí          | Uno de A2, B1, B2.                                                                         |
| `email`          | No          | Formato de correo válido y máximo 254 caracteres. No es una cuenta ni un inicio de sesión. |
| `nativeLanguage` | No          | Máximo 100 caracteres.                                                                     |
| `interests`      | No          | Máximo 2000 caracteres.                                                                    |
| `goals`          | No          | Máximo 2000 caracteres.                                                                    |
| `notes`          | No          | Máximo 4000 caracteres.                                                                    |

- El correo **no** se exige único: dos estudiantes pueden compartir el correo de un tutor.
- `NativeLanguage`, `Interests`, `Goals` y `Notes` son texto libre. No se estructuran como listas ni como entidades en esta especificación.

### 3.4 Ficha del estudiante

- Ruta propia, protegida, con la información pedagógica completa y las clases asignadas.
- La ficha muestra nombre, nivel, correo, lengua materna, intereses, objetivos y notas del profesor.
- Un campo opcional sin valor se muestra explícitamente como **«Sin indicar»**, no como un hueco en blanco.
- La ficha ofrece **Editar**, **Enviar a papelera** y el regreso al listado de estudiantes.
- La ficha lista las clases asignadas con su título, su nivel y su duración, reutilizando `formatLessonDuration` para la duración y **«Duración incompleta»** cuando el total persistido es `null`.
- Cada clase asignada enlaza a su detalle y ofrece la acción **Quitar asignación**.
- Quitar una asignación desde la ficha **no elimina la clase** y **no sale de la ficha**.
- La ficha incluye una acción **Asignar clase**, que abre un selector con las clases del profesor.
- Las clases en papelera aparecen marcadas **«En papelera»** y no ofrecen **Quitar asignación** hasta que se restauren.
- La ficha de un estudiante en papelera sigue siendo legible, con el estado de papelera visible.

### 3.5 Estudiantes asignados en el detalle de la clase

- El detalle de una clase incorpora una sección de **estudiantes asignados**.
- La sección lista los estudiantes asignados con su nombre y su nivel, cada uno enlazado a su ficha.
- La sección ofrece la acción **Asignar estudiante**, que abre un selector con los estudiantes activos del profesor.
- Cada estudiante asignado ofrece la acción **Quitar asignación**, que desasocia sin eliminar al estudiante.
- Un estudiante en papelera aparece marcado **«En papelera»** y no ofrece **Quitar asignación** hasta que se restaure.
- Quitar una asignación desde la clase **no elimina al estudiante** y **no sale del detalle de la clase**.
- Una clase sin estudiantes asignados muestra un estado vacío explícito, no una sección oculta.
- El detalle de la clase sigue siendo de solo lectura en todo lo relativo al contenido: asignar no abre el editor ni modifica actividades.

### 3.6 Asignar y quitar asignaciones

- La asignación se realiza **siempre desde una entidad que ya existe**: desde la ficha del estudiante se elige una clase, y desde la clase se elige un estudiante.
- Esta especificación **no** incluye crear clases desde la ficha del estudiante ni crear estudiantes desde la clase.
- El selector muestra únicamente entidades **activas** del profesor: una clase activa para la ficha, un estudiante activo para la clase.
- La asignación se guarda como **acción suelta**: añadir o quitar una asignación es una petición propia, sin botón **Guardar** conjunto y sin borrador local. Esto la separa deliberadamente del guardado conjunto de SPEC 02.
- Asignar una pareja que ya existe es idempotente: el servidor responde con éxito y no crea una segunda fila.
- Quitar una asignación que no existe responde 404 sin modificar nada.
- El selector no ofrece entidades ya asignadas, para que la acción de asignar nunca pueda duplicar.
- Un fallo de red al asignar o al quitar deja la pantalla como estaba y muestra un mensaje con reintento; no deja la interfaz mostrando una asignación que no se ha guardado.

### 3.7 Papelera de estudiantes

- Ruta propia, protegida, con el listado de estudiantes en papelera.
- La papelera ofrece **Restaurar** y **Eliminar definitivamente** por estudiante.
- Enviar a papelera y eliminar definitivamente piden confirmación explícita, con el mismo patrón que la papelera de clases.
- Restaurar devuelve el estudiante y **conserva todas sus asignaciones**, que siguen existiendo durante la papelera.
- Eliminar definitivamente borra al estudiante y, en cascada, sus filas de `LessonAssignment`.
- Eliminar definitivamente un estudiante **no elimina ninguna clase**, ni sus actividades.
- El estado de papelera no impide leer la ficha del estudiante.

### 3.8 Estados

| Estado                    | Qué se muestra                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando                  | Mensaje de espera, con el mismo patrón que el resto de la aplicación                                                                               |
| Error de red              | Mensaje y acción de reintento, sin salir de la pantalla                                                                                            |
| 404 de estudiante         | «El estudiante no existe o no está disponible.» y enlace al listado                                                                                |
| 404 de clase              | «La clase no existe o no está disponible.» y enlace a Mis clases                                                                                   |
| Listado vacío             | «Aún no tienes estudiantes.» con la acción **Crear estudiante**                                                                                    |
| Listado filtrado vacío    | «No hay estudiantes que coincidan con estos filtros.» con la acción **Limpiar filtros**                                                            |
| Papelera vacía            | «La papelera está vacía.»                                                                                                                          |
| Sin clases asignadas      | «Este estudiante todavía no tiene clases asignadas.» con la acción **Asignar clase**                                                               |
| Sin estudiantes asignados | «Esta clase todavía no tiene estudiantes asignados.» con la acción **Asignar estudiante**                                                          |
| Sin selector disponible   | Si no hay clases activas que asignar, el selector lo dice y enlaza a **Crear clase**; si no hay estudiantes activos, enlaza a **Crear estudiante** |
| Campo opcional vacío      | «Sin indicar» en la ficha, ausente en el formulario                                                                                                |

- Un estudiante en papelera no se ofrece en el selector de la clase, y una clase en papelera no se ofrece en el selector de la ficha.

---

## 4. Modelo de datos

### 4.1 Entidad `Student`

```csharp
public sealed class Student
{
    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }          // propietario: el profesor
    public string Name { get; private set; } = "";    // obligatorio, máximo 200
    public string? Email { get; private set; }        // opcional, máximo 254, no único
    public LessonLevel Level { get; private set; }    // obligatorio: A2, B1, B2
    public string? NativeLanguage { get; private set; } // opcional, máximo 100
    public string? Interests { get; private set; }    // opcional, máximo 2000
    public string? Goals { get; private set; }        // opcional, máximo 2000
    public string? Notes { get; private set; }        // opcional, máximo 4000
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public DateTimeOffset? DeletedAt { get; private set; } // papelera, igual que Lesson
}
```

- `Level` **reutiliza** `LessonLevel`, el enum que ya existe en el dominio: no se crea un segundo enum de niveles.
- Los campos opcionales vacíos se normalizan a `null` al guardar.
- `Student` **no** contiene ninguna colección de clases: la relación vive en `LessonAssignment`.
- El nombre no es único: dos estudiantes pueden llamarse igual.

### 4.2 Entidad `LessonAssignment`

```csharp
public sealed class LessonAssignment
{
    public Guid Id { get; private set; }
    public Guid StudentId { get; private set; }
    public Guid LessonId { get; private set; }
    public DateTimeOffset AssignedAt { get; private set; }
}
```

- La pareja (`StudentId`, `LessonId`) lleva un **índice único**, que es lo que hace idempotente la asignación y descarta la duplicación de filas.
- `AssignedAt` se asigna al crear la fila y no cambia al consultarla.
- **No se añade `Status`.** El modelo conceptual lo mencionaba como posibilidad futura; sin un caso de uso que lo consuma, un campo sin uso es deuda. Si llega, va en su propia especificación.
- Las dos claves foráneas apuntan a `Students` y `Lessons`. Ambas **en cascada**: borrar definitivamente un estudiante o una clase elimina sus asignaciones, que es exactamente lo que exige el borrado en cascada de §3.7 y lo que SPEC 01 ya hace con las actividades.
- Una clave foránea en cascada **no** convierte la asignación en propiedad: eliminar un estudiante nunca elimina la clase, y eliminar una clase nunca elimina al estudiante.

### 4.3 Migración `AddStudentsAndLessonAssignments`

- Crear la tabla `Students` con sus columnas, longitudes máximas y `DeletedAt` opcional.
- Crear la restricción de comprobación `CK_Student_Level` con los mismos valores que `CK_Lesson_Level`: `A2`, `B1`, `B2`.
- Crear la restricción de comprobación `CK_Student_Name` exigiendo nombre no vacío.
- Crear la tabla `LessonAssignments` con `AssignedAt` obligatorio.
- Crear el índice único `(StudentId, LessonId)` sobre `LessonAssignments`.
- Crear los índices de consulta: `(UserId, UpdatedAt)` y `(UserId, DeletedAt)` sobre `Students`, y `(LessonId)` sobre `LessonAssignments`.
- Las dos claves foráneas se crean con `ON DELETE CASCADE`.
- Añadir la navegación de `Lesson` hacia sus asignaciones y registrarla con `HasField("_assignments")` y `PropertyAccessMode.Field`, siguiendo el patrón que ya usa `Lesson._activities`.
- **No se toca ninguna tabla existente**: ni `Lessons`, ni `Activities`, ni las tablas de identidad. No se añade ninguna columna a `Lesson` ni a `Activity`.
- **Datos heredados:** no hay ninguno que migrar. Un profesor sin estudiantes ve el listado vacío y su comportamiento actual no cambia.
- **Rollback:** elimina `LessonAssignments` y `Students` completas. No puede recuperar asignaciones, porque no había ninguna antes de esta migración. Ninguna clase, actividad o cuenta se ve afectada por el rollback.

### 4.4 Contratos

```typescript
type StudentLevel = "A2" | "B1" | "B2";

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
  /** Resumen de intereses para el listado; null cuando no hay. */
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

- `UserId`, `StudentId` y `LessonId` **nunca** se aceptan como valores autoritativos del cliente: la propiedad sale del JWT y las entidades se identifican por su `{id}` en la ruta.
- `assignedLessonCount` cuenta también las clases en papelera, para que coincida con lo que muestra la ficha.
- El esquema Zod usa un correo validado con máximo 254, y transforma la cadena vacía de un opcional en `null`, nunca en `""`.
- Los errores de validación conservan las claves del `ValidationProblemDetails` existente, de modo que el formulario puede señalar el campo exacto.

---

## 5. API necesaria

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

- Los siete endpoints de estudiantes viven en un grupo `/api/students` con `RequireAuthorization()`, como `/api/lessons`.
- Los cuatro endpoints de asignación son **dos parejas simétricas** con la misma semántica y distintas rutas, porque la relación se gestiona desde los dos lados. Internamente las cuatro operaciones comparten un único servicio de asignación.
- **Códigos de error:**
  - `401` sin sesión válida, en todos.
  - `404` si el estudiante o la clase no existe, o pertenece a otro profesor. La comprobación de propiedad se hace siempre sobre el recurso de la ruta.
  - `400` con `ValidationProblemDetails` y las claves de campo si el cuerpo no cumple el apartado 3.3. Nada se persiste.
  - `400` si se intenta asignar un estudiante o una clase **en papelera**, con un mensaje que lo explica.
  - `404` al quitar una asignación que no existe. No es un error del profesor: no modifica nada.
  - `409` al enviar a papelera un estudiante que ya está en papelera, o al restaurar uno que está activo, igual que la transición de `Lesson`.
- **Idempotencia de la asignación:** asignar una pareja que ya existe responde **201 con la asignación existente** en lugar de 409. El índice único protege la integridad y la operación no falla por repetirla.
- Los DTO de `Lesson` **no cambian**: `LessonDetailsDto` y `LessonListItemDto` conservan su forma y sus campos. La sección de estudiantes asignados se alimenta de su propia lectura.
- Ningún endpoint de lección devuelve estudiantes, y ningún endpoint de estudiante devuelve el contenido de las clases.

---

## 6. Pantallas frontend

| Ruta                 | Pantalla                | Cambio                                                                           |
| -------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `/`                  | Mis clases              | Añade el enlace a **Estudiantes** en la navegación                               |
| `/lessons/:id/edit`  | Editor de la clase      | Añade la sección de **estudiantes asignados**, fuera del borrador de actividades |
| `/lessons/:id/play`  | Reproductor             | Sin cambios                                                                      |
| `/lessons/trash`     | Papelera de clases      | Sin cambios                                                                      |
| `/students`          | Listado de estudiantes  | Nueva                                                                            |
| `/students/new`      | Alta de estudiante      | Nueva                                                                            |
| `/students/:id`      | Ficha del estudiante    | Nueva                                                                            |
| `/students/:id/edit` | Edición de estudiante   | Nueva                                                                            |
| `/students/trash`    | Papelera de estudiantes | Nueva                                                                            |

- El enlace a **Estudiantes** va en el mismo bloque de navegación que **Papelera** dentro de Mis clases, y ambas pantallas se enlazan entre sí.
- Las cinco rutas nuevas viven dentro del bloque de rutas protegidas: sin sesión redirigen a `/login`.
- La sección de estudiantes asignados en el editor de la clase es **independiente del borrador**: no forma parte de `lessonDraftSchema`, no participa en `draftFingerprint`, no marca la clase como con cambios sin guardar y no se envía en `SaveLessonRequest`.
- La sección se puede usar con el borrador de actividades a medias, sin guardar la clase antes.
- La sección se coloca en la ficha de la clase, separada de la lista de actividades, para que no se confunda con el contenido que sí se guarda en bloque.
- Se reutilizan los componentes existentes: `card`, `button`, `button secondary`, `danger`, `eyebrow`, `level-badge`, `lesson-list`, `lesson-actions`, los patrones de filtros y de confirmación con `window.confirm`.
- Se conserva el marco actual de la aplicación y el estilo visual. No se crea otro sistema de diseño ni se añade ninguna dependencia.

---

## 7. Archivos a crear o modificar

**Modificar:**

- `backend/Domain/Lesson.cs` — navegación de solo lectura hacia `LessonAssignment`, con respaldo en campo privado, siguiendo el patrón de `_activities`.
- `backend/Application/Contracts.cs` — `IStudentReader` y `IStudentService` junto a los contratos existentes.
- `backend/Infrastructure/AppDbContext.cs` — `DbSet<Student>`, `DbSet<LessonAssignment>`, longitudes, restricciones, índices y cascadas.
- `backend/Infrastructure/Migrations/AppDbContextModelSnapshot.cs` — regenerado por la migración.
- `backend/Api/Program.cs` — registro de los dos servicios nuevos y `app.MapStudentEndpoints()`.
- `frontend/src/App.tsx` — las cinco rutas protegidas de estudiantes.
- `frontend/src/lessons/LessonsPage.tsx` — enlace a **Estudiantes** en la navegación.
- `frontend/src/lessons/LessonEditorPage.tsx` — la sección de estudiantes asignados.
- `frontend/src/styles.css` — estilos de las pantallas nuevas y de la sección de asignados, como adiciones al final del archivo.
- `README.md` — enlace a la guía y actualización del estado de la Fase 4.

**Crear:**

- `backend/Domain/Student.cs`.
- `backend/Domain/LessonAssignment.cs`.
- `backend/Application/Students/StudentDtos.cs`.
- `backend/Application/Students/IStudentReader.cs`.
- `backend/Application/Students/IStudentService.cs`.
- `backend/Infrastructure/StudentReader.cs`.
- `backend/Infrastructure/StudentService.cs`.
- `backend/Infrastructure/Migrations/<timestamp>_AddStudentsAndLessonAssignments.cs` y su `Designer`.
- `backend/Api/StudentEndpoints.cs`.
- `frontend/src/students/student-api.ts`.
- `frontend/src/students/student-schema.ts`.
- `frontend/src/students/StudentsPage.tsx`.
- `frontend/src/students/StudentFormPage.tsx`.
- `frontend/src/students/StudentProfilePage.tsx`.
- `frontend/src/students/StudentsTrashPage.tsx`.
- `frontend/src/students/AssignedLessons.tsx`.
- `frontend/src/students/AssignedStudents.tsx`.
- `frontend/src/students/student-api.test.ts`.
- `frontend/src/students/student-schema.test.ts`.
- `frontend/src/students/StudentsPage.test.tsx`.
- `frontend/src/students/StudentFormPage.test.tsx`.
- `frontend/src/students/StudentProfilePage.test.tsx`.
- `frontend/src/students/AssignedLessons.test.tsx`.
- `frontend/src/students/AssignedStudents.test.tsx`.
- `tests/Domain.Tests/StudentTests.cs`.
- `tests/Integration.Tests/StudentManagementTests.cs`.
- `tests/Integration.Tests/LessonAssignmentTests.cs`.
- `frontend/e2e/students.spec.ts`.
- `docs/student-management.md` — reescrito como guía de uso y límites, con la estructura de `docs/activity-editor.md`. Conserva su valor como documento conceptual, pero deja de afirmar que no se implementa nada.

**Sin cambios previstos:** `backend/Domain/Activity.cs`, `backend/Application/Lessons/*`, `backend/Infrastructure/LessonService.cs`, `backend/Infrastructure/LessonReader.cs`, `backend/Api/LessonEndpoints.cs`, `frontend/src/lessons/lesson-api.ts`, `frontend/src/lessons/lesson-schema.ts`, `frontend/src/lessons/LessonPlayerPage.tsx`, `frontend/src/lessons/ActivityView.tsx`, `frontend/src/auth.ts`, `frontend/src/validation.ts`.

No se añaden dependencias. No se incorpora ninguna biblioteca de selección, de etiquetas ni de formularios: el selector de asignación es un desplegable nativo con las entidades del profesor.

---

## 8. Plan de implementación

Cada etapa deja el proyecto compilando, se puede probar por separado y acerca directamente al flujo de organizar las clases por estudiante.

| Etapa | Entrega                                                                                                                                                              | Verificación                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1     | Entidad `Student` con sus reglas: nombre y nivel obligatorios, opcionales recortados y normalizados a `null`                                                         | `StudentTests.cs`: campos obligatorios, longitudes máximas, opcionales vacíos, nivel inválido                          |
| 2     | Entidad `LessonAssignment` y su regla de unicidad en el dominio: asignar dos veces la misma pareja no produce una segunda fila                                       | `StudentTests.cs`: creación, `AssignedAt`, igualdad de pareja                                                          |
| 3     | Configuración de EF: tablas, longitudes, `CK_Student_Level`, `CK_Student_Name`, índice único de pareja, índices de consulta y cascadas                               | `dotnet build backend/Infrastructure/Infrastructure.csproj --no-restore` en verde                                      |
| 4     | Migración `AddStudentsAndLessonAssignments` y verificación de que no toca ninguna tabla existente                                                                    | `LessonMigrationTests.cs` ampliado: aplicar sobre una base con clases y actividades y comprobar que siguen intactas    |
| 5     | `IStudentReader` y `StudentReader`: listado con búsqueda por nombre e intereses, filtro por nivel, orden, conteo de asignadas, ficha con clases asignadas y papelera | `StudentManagementTests.cs` contra PostgreSQL: filtros, orden, aislamiento entre profesores, papelera                  |
| 6     | `IStudentService` y `StudentService`: crear, editar, enviar a papelera, restaurar y eliminar definitivamente, con validación previa y sin persistencia parcial       | `StudentManagementTests.cs`: validación, 404 de ajeno, 409 de estado, cascada de asignaciones                          |
| 7     | Servicio de asignación: asignar y quitar en las dos direcciones, idempotencia, rechazo de entidades en papelera y de entidades ajenas                                | `LessonAssignmentTests.cs` contra PostgreSQL: idempotencia, unicidad, simetría, cascada al eliminar                    |
| 8     | `StudentEndpoints` y los cuatro endpoints de asignación, con registro en `Program.cs`                                                                                | pruebas de integración de códigos 201, 204, 400, 404 y 409                                                             |
| 9     | Transporte del frontend: `student-api.ts` con listado, ficha, guardado, transiciones y las cuatro operaciones de asignación                                          | `student-api.test.ts`: construcción de rutas, errores 401, 404 y 409                                                   |
| 10    | Esquema Zod del estudiante: nombre y nivel obligatorios, opcionales que se transforman a `null`, correo validado                                                     | `student-schema.test.ts`: campo vacío, cadena solo con espacios, correo inválido, longitud excedida                    |
| 11    | Listado de estudiantes con búsqueda, filtro por nivel, estados de carga, error y vacío, y acciones por estudiante                                                    | `StudentsPage.test.tsx`: filtros combinados, vacío, vacío filtrado, acciones                                           |
| 12    | Alta y edición con el formulario compartido y los errores señalados por campo                                                                                        | `StudentFormPage.test.tsx`: alta, edición, campos obligatorios, sin escritura con datos inválidos                      |
| 13    | Ficha del estudiante con la información pedagógica, «Sin indicar» en los opcionales y el regreso al listado                                                          | `StudentProfilePage.test.tsx`: todos los campos, opcionales ausentes, 404 con salida                                   |
| 14    | `AssignedLessons`: clases asignadas en la ficha, con duración, marca de papelera y **Quitar asignación**, sin salir de la ficha                                      | `AssignedLessons.test.tsx`: duración, «Duración incompleta», papelera sin acción, quitar sin navegar                   |
| 15    | `AssignedStudents`: estudiantes asignados en el detalle de la clase, con marca de papelera, **Asignar estudiante** y **Quitar asignación**                           | `AssignedStudents.test.tsx`: estados vacío y con datos, papelera sin acción, independencia del borrador                |
| 16    | Papelera de estudiantes con restaurar y eliminar definitivamente, incluida la confirmación                                                                           | `StudentsPage.test.tsx` o suite propia de la papelera                                                                  |
| 17    | Integración de las rutas y los enlaces, pantalla estrecha, E2E y documentación                                                                                       | `App.tsx`, enlace desde Mis clases, `npx tsc -b`, `npx eslint .`, E2E `students.spec.ts`, `docs/student-management.md` |

- Cada etapa incorpora las pruebas focalizadas de la regla o el componente que conecta.
- Los tests de integración corren contra PostgreSQL real, nunca con EF InMemory, como el resto del repositorio.
- El E2E se escribe y se ejecuta **solo en la etapa 17**, porque necesita la aplicación entera y el puerto libre.
- Las etapas 1 a 8 son backend y son estrictamente secuenciales entre sí: comparten `AppDbContext` y la carpeta de migraciones, que son recursos de escritor único en este repositorio.
- Las etapas 9 a 16 son frontend y dependen del contrato de la etapa 8, no de su implementación interna.

---

## 9. Criterios de aceptación

**Estudiantes**

- [ ] Se puede crear un estudiante con nombre y nivel; el resto de campos son opcionales.
- [ ] Crear sin nombre o sin nivel no envía ninguna petición de escritura.
- [ ] Un campo opcional vacío se guarda como ausente y se muestra como «Sin indicar» en la ficha.
- [ ] Un campo opcional con solo espacios se guarda como ausente.
- [ ] Se puede editar cualquier campo de la ficha y el resultado se ve sin recargar.
- [ ] Un correo con formato inválido, o de más de 254 caracteres, se rechaza.
- [ ] Dos estudiantes pueden compartir el mismo correo.
- [ ] El listado muestra nombre, nivel, resumen de intereses y número de clases asignadas.
- [ ] La búsqueda casa por nombre y por intereses; el filtro por nivel usa A2, B1 y B2.
- [ ] Búsqueda y filtro se combinan y **Limpiar filtros** restituye el listado completo.
- [ ] El listado se ordena por actualización descendente.
- [ ] Un profesor no ve, no edita y no elimina estudiantes de otro profesor.
- [ ] El listado vacío ofrece **Crear estudiante** y el filtrado vacío ofrece **Limpiar filtros**.

**Asignación de clases**

- [ ] Se asigna un estudiante a una clase desde el detalle de la clase.
- [ ] Se asigna una clase a un estudiante desde su ficha.
- [ ] La relación se guarda con una fila de `LessonAssignment`, nunca con un campo en `Lesson`.
- [ ] Una misma clase puede estar asignada a varios estudiantes a la vez.
- [ ] Un mismo estudiante puede tener varias clases asignadas a la vez.
- [ ] Asignar dos veces la misma pareja no crea una segunda fila y no devuelve error.
- [ ] El selector no ofrece entidades ya asignadas.
- [ ] Quitar una asignación no elimina ni la clase ni el estudiante.
- [ ] Quitar la asignación desde la ficha no sale de la ficha; quitarla desde la clase no sale de la clase.
- [ ] Quitar una asignación que no existe responde 404 y no modifica nada.
- [ ] Asignar una clase ajena o un estudiante ajeno responde 404.
- [ ] No se puede asignar una clase en papelera ni un estudiante en papelera.
- [ ] Asignar o quitar no modifica la clase: ni su contenido, ni sus actividades, ni su duración, ni su versión.
- [ ] Un fallo de red al asignar o al quitar deja la pantalla como estaba y muestra un reintento.
- [ ] La sección de asignados del editor no participa en el borrador y no marca la clase como modificada.
- [ ] Se puede usar la sección de asignados con el borrador de actividades a medias y sin guardar.

**Papelera y borrado**

- [ ] Enviar un estudiante a papelera pide confirmación y no elimina ninguna clase.
- [ ] Un estudiante en papelera conserva sus asignaciones.
- [ ] Al restaurarlo vuelven sus clases asignadas, sin duplicarse.
- [ ] Eliminar definitivamente borra al estudiante y sus asignaciones, y no borra ninguna clase.
- [ ] Eliminar definitivamente una clase con asignaciones no elimina a ningún estudiante.
- [ ] La papelera de estudiantes lista, restaura y elimina definitivamente, y pide confirmación.
- [ ] Una clase en papelera se muestra marcada en la ficha y sin acción de quitar hasta restaurarla.
- [ ] Un estudiante en papelera se muestra marcado en la clase y sin acción de quitar hasta restaurarlo.
- [ ] La ficha de un estudiante en papelera sigue siendo legible.

**Regresión y alcance**

- [ ] El listado, el editor y el reproductor de clases siguen funcionando igual.
- [ ] `GET /api/lessons/{id}` conserva exactamente sus campos y no devuelve estudiantes.
- [ ] La papelera de clases y el guardado conjunto de SPEC 02 no cambian.
- [ ] No se añade `StudentId` ni ninguna colección de estudiantes a `Lesson` ni a `Activity`.
- [ ] No se añade `Status` a `LessonAssignment`.
- [ ] No hay ninguna entidad por estudiante además de `Student` y `LessonAssignment`.
- [ ] Las tablas `Lessons`, `Activities` y de identidad no cambian en la migración.
- [ ] No se añaden dependencias ni se cambia autenticación, framework o arquitectura.
- [ ] `npx tsc -b`, `npx eslint .` y las suites existentes siguen en verde.

**Comprobaciones ejecutables al implementar**

- `dotnet build Profefacilisimo.slnx --no-restore` desde la raíz.
- `./scripts/Test.ps1` con `StudentTests.cs` y los dos ficheros nuevos de integración, usando `TEST_DATABASE_CONNECTION` y PostgreSQL real.
- `cd frontend && npx tsc -b && npx eslint .`
- `npx vitest run` con las suites nuevas de estudiantes.
- `npx playwright test e2e/students.spec.ts` sobre la base desechable y la API en el puerto 5080, con el E2E serializado como en SPEC 02 y 03.

No se han ejecutado estas comprobaciones durante la redacción.

---

## 10. Decisiones tomadas y descartadas

**Confirmadas por el usuario:**

- Se implementa `LessonAssignment` como entidad intermedia real, con `Id`, `StudentId`, `LessonId` y `AssignedAt`.
- La asignación se guarda como acción suelta sobre clases y estudiantes que ya existen, no con un borrador y un botón **Guardar** conjunto.
- El alta exige `Name` y `Level`; `Email`, `NativeLanguage`, `Interests`, `Goals` y `Notes` son opcionales.
- `Student` se comporta como `Lesson`: papelera con `DeletedAt`, listado propio, restaurar y eliminar definitivamente, con su propia pantalla.
- Mientras el estudiante está en papelera, sus asignaciones se conservan y se muestran marcadas «En papelera».
- La relación es simétrica: se puede asignar y quitar desde la ficha del estudiante y desde el detalle de la clase.

**Diseño técnico propuesto para revisión en este borrador:**

- La pareja (`StudentId`, `LessonId`) lleva índice único, y asignar una pareja existente responde 201 con la asignación actual, en lugar de 409. Es lo que hace segura la repetición de la acción desde dos pantallas distintas.
- Los cuatro endpoints de asignación comparten un único servicio: dos parejas simétricas de rutas, una implementación.
- `LessonAssignment` **no** lleva `Status`, aunque el modelo conceptual lo mencionaba. Sin consumidor, es deuda.
- Las claves foráneas de `LessonAssignment` son en cascada. Lo que protege a la clase del borrado del estudiante no es la ausencia de cascada, sino que la cascada sea de la asignación y no de la lección.
- Los endpoints de estudiantes se separan de los de lección en un grupo propio `/api/students`, y los DTO de `Lesson` no cambian.
- La sección de estudiantes asignados vive en la ficha de la clase, fuera de `lessonDraftSchema` y de `draftFingerprint`, para no reabrir el guardado conjunto de SPEC 02.
- Los campos opcionales se normalizan a `null` en lugar de guardarse como cadena vacía, y la ficha los muestra como «Sin indicar», en la línea del «Sin duración» de SPEC 03.
- `Student.Level` reutiliza `LessonLevel` en vez de declarar un segundo enum, para que no puedan divergir.
- `assignedLessonCount` cuenta también las clases en papelera, para que el listado y la ficha no digan cosas distintas.
- No se añade ninguna dependencia: el selector de asignación es un desplegable nativo.

**Descartadas:**

- `StudentId` dentro de `Lesson`: haría imposible reutilizar una clase con varios estudiantes, que es exactamente la razón por la que la Fase 4 se modeló con una entidad intermedia.
- Relación N:M con tabla de unión implícita generada por EF: funciona, pero se queda sin `AssignedAt` ni sitio para un estado futuro, y obliga a migrar después hacia la entidad propia.
- Borrado duro del estudiante con cascada de asignaciones: se descartó tras elegir papelera. Perdería las asignaciones de forma irreversible al primer envío a papelera.
- Guardado conjunto de asignaciones con ETag, como SPEC 02: la asignación no tiene borrador que descartar ni conflictos que resolver, y reutilizar el protocolo habría exigido tocar el `SaveLessonRequest` y la versión de `Lesson`.
- Añadir `Status` a `LessonAssignment`: sin caso de uso que lo consuma.
- `Status` como enumeración en lugar de `DeletedAt` en `Student`: `Lesson` ya usa `DeletedAt` y la simetría se mantiene.
- Guardar los opcionales como cadena vacía: obligaría a distinguir «vacío» de «sin rellenar» en cada lectura.
- Mostrar los campos opcionales vacíos como un hueco en blanco: no se distingue de un dato perdido.
- Estructurar `Interests` o `NativeLanguage` como listas: la Fase 4 pide información básica, y la estructura llegará cuando haya un consumidor.
- Un endpoint de búsqueda de estudiantes para el selector: el profesor tiene pocos estudiantes y ya se traen todos en el listado.
- Materializar la asignación como copia de la clase: contradice la reutilización, que es el motivo de la entidad intermedia.

---

## 11. Riesgos

| Riesgo                                                                       | Tratamiento                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| El formulario de asignación se confunde con el guardado conjunto del editor  | Aviso explícito en la sección de asignados: no hay que guardar la clase para asignar                         |
| Duplicar una fila de asignación al actuar desde dos pantallas                | Índice único de pareja y asignación idempotente que devuelve la fila existente                               |
| El borrador de actividades se pierde al usar la sección de asignados         | La sección no forma parte del borrador y no dispara ninguna escritura de la clase                            |
| Un estudiante ajeno aparece en el selector                                   | La lectura de candidatos filtra siempre por `UserId` del JWT                                                 |
| Asignar una entidad en papelera y confundirlo después con datos incoherentes | Se rechaza al asignar y se marca «En papelera» al mostrar                                                    |
| Mostrar una asignación que no llegó a guardarse                              | La interfaz espera la respuesta antes de reflejarla, y ante un fallo de red no la muestra y ofrece reintento |
| El conteo de clases asignadas no coincide con la ficha                       | El conteo incluye las clases en papelera, como la ficha                                                      |
| Crecimiento del detalle de la clase y de la ficha                            | La lista de asignados es un componente propio con sus propios estados                                        |
| Longitudes de texto sin límite claro en los campos pedagógicos               | Máximos definidos en el dominio, el DTO y el esquema Zod, con las mismas cifras                              |
| Papelera de estudiantes y papelera de clases divergiendo en comportamiento   | La de estudiantes reutiliza el patrón de confirmación y transición de la de clases                           |
| El E2E choca con otro runner en el mismo puerto                              | Se escribe y se ejecuta solo en la etapa 17, serializado                                                     |

---

## 12. Qué NO se hará en esta especificación

- No se introduce `LessonSession`, ni fechas de impartición, ni historial por estudiante.
- No hay progreso, analíticas de aprendizaje, vocabulario, tareas ni corrección.
- No hay IA, ni generación de clases a partir del perfil, ni personalización automática.
- No hay calendario, programación, notificaciones ni recordatorios.
- No hay portal ni acceso del estudiante: el estudiante no es un usuario del sistema.
- No se crean clases desde la ficha del estudiante, ni se duplica una clase por estudiante.
- No se toca el contenido de las clases: ni actividades, ni duración, ni versiones, ni el contrato de guardado de SPEC 02.
- No se añade `StudentId` ni colecciones de estudiantes a `Lesson` ni a `Activity`.
- No se añade `Status` a `LessonAssignment`.
- No se guarda teléfono, dirección, información financiera ni médica, ni ningún otro dato excesivamente personal.
- No se importan ni exportan estudiantes, ni se comparte su ficha.
- No cambian autenticación, framework, arquitectura, dependencias ni el estilo visual.
- No hay papelera individual de asignaciones: una asignación se quita o se elimina con su entidad.

Cada uno de esos puntos, si llega, va en su propia especificación.
