# Gestión de estudiantes — SPEC 04

## Uso

1. En **Mis clases**, el enlace **Estudiantes** abre **Mis estudiantes**: el listado de tus
   estudiantes activos, más recientes primero.
2. **Crear estudiante** pide **Nombre** y **Nivel** (A2/B1/B2); el resto de campos son opcionales
   (correo, lengua materna, objetivos, intereses y notas). Un opcional vacío se guarda como ausente
   y la ficha lo muestra como **Sin indicar**.
3. **Guardar** crea al estudiante y abre su ficha. **Editar** modifica cualquier campo y el resultado
   se ve sin recargar.
4. La ficha reúne los datos pedagógicos y la sección **Clases asignadas**. El selector
   **Asignar clase** solo ofrece clases activas que aún no estén asignadas; asignar no sale de la
   ficha.
5. Desde el detalle de una clase, el editor incorpora la sección **Estudiantes asignados** con la
   acción **Asignar estudiante** y **Quitar asignación**. La sección vive *fuera* del formulario y
   *fuera* del borrador: se puede usar con actividades a medias y sin guardar, y no marca la clase
   como modificada.
6. **Quitar asignación** no elimina ni la clase ni el estudiante, y no cambia de pantalla.
7. **Enviar a papelera** pide confirmación y **no** elimina ninguna clase. En **Papelera**, una fila
   en papelera conserva sus asignaciones; **Restaurar** pide confirmación y las devuelve sin
   duplicarlas.
8. **Eliminar definitivamente** solo está disponible en la papelera; borra al estudiante y sus
   asignaciones y **no** borra ninguna clase. No se puede deshacer. Lo mismo al revés: eliminar una
   clase con asignaciones no elimina a ningún estudiante.
9. En la ficha y en el editor, una entidad en papelera se muestra con la marca **En papelera** y sin
   acción de quitar hasta restaurarla. La ficha de un estudiante en papelera sigue siendo legible.

## Límites deliberados

- Guardado explícito, sin autoguardado ni borradores en almacenamiento local.
- Sin paginación. Búsqueda y filtro por nivel son locales, sin URL.
- Sin `LessonSession`, historial, progreso, tareas, vocabulario ni IA personalizada: ver §9 de la
  spec. El estudiante **no** es un usuario del sistema.
- La asignación se hace siempre **desde una entidad existente**: no se crean clases desde la ficha
  ni estudiantes desde el editor de clase (solo enlaces a las pantallas de creación).
- Sin concurrencia optimista: `last write wins`.
- Dos estudiantes pueden compartir el mismo correo: el correo es un contacto, no una identidad.
- La relación clase ↔ estudiante es **N:M** mediante `LessonAssignment` (fila con `Id`, `StudentId`,
  `LessonId`, `AssignedAt`), **nunca** un `StudentId` dentro de `Lesson`.

## Decisiones técnicas

- **La asignación es una entidad propia.** `LessonAssignment` es una tabla intermedia con índice
  único `(StudentId, LessonId)`. Asignar de nuevo la misma pareja es **idempotente**: devuelve 201
  con la fila existente y **nunca** 409.
- **El borrado es lógico.** `Student.DeletedAt` y `Lesson.DeletedAt` marcan la papelera. Las
  asignaciones se conservan mientras la entidad esté en papelera y se restauran con ella. La cascada
  (`Student` → `LessonAssignment`) solo se aplica al borrado definitivo.
- **El correo no es único.** Es un dato de contacto; dos estudiantes pueden compartirlo. Se valida
  el formato y el límite de 254 caracteres, no la unicidad.
- **Los opcionales vacíos se normalizan a `null`.** Un campo opcional vacío o con solo espacios se
  guarda como ausente, nunca como cadena vacía, y la ficha lo pinta como **Sin indicar**.
- **`StudentLevel` reutiliza `LessonLevel`.** El nivel está alineado con el de la clase (A2/B1/B2)
  para que la asignación sea coherente; no se declara un segundo enum.
- **La sección de asignados del editor es independiente del borrador.** Lee y escribe contra la API
  por su cuenta, así que asignar un estudiante no marca la clase como modificada ni exige guardarla.
- **`formatLessonDuration` se reutiliza tal cual** (`frontend/src/lessons/lesson-duration.ts`): las
  clases asignadas muestran la misma duración (o **Duración incompleta**) que en Mis clases.

## Contrato con el backend

Las rutas y los DTO están congelados en
[`specs/04-student-management-contract.md`](../specs/04-student-management-contract.md) (C1–C6). En
resumen:

- **Estudiantes:** `GET/POST /api/students`, `GET/PUT/DELETE /api/students/{id}`,
  `POST /api/students/{id}/trash|restore`. `GET /api/students` acepta `state`, `search` y `level`.
- **Asignación, cara estudiante:** `GET /api/students/{id}/lessons`, `POST` con `lessonId`,
  `DELETE /api/students/{id}/lessons/{lessonId}`.
- **Asignación, cara clase:** `GET /api/lessons/{id}/students`, `POST` con `studentId`,
  `DELETE /api/lessons/{id}/students/{studentId}`.
- La relación es **simétrica**: las dos caras escriben la misma fila y devuelven el mismo estado.
- Un id ajeno o desconocido responde **404**; una entidad en papelera no se puede asignar. Quitar
  una pareja inexistente responde **404** y no modifica nada.
- `GET /api/lessons/{id}` **conserva** exactamente sus campos (`userId`, `lessonId` y `order` no
  viajan desde el cliente) y **no** devuelve estudiantes.
- Asignar o quitar **no** toca la clase: ni contenido, ni actividades, ni duración, ni versión.

## Verificación de punta a punta

El flujo completo es una prueba permanente: `frontend/e2e/students.spec.ts`. Recorre, en un navegador
real contra la API y PostgreSQL, con el E2E serializado como en SPEC 02 y 03:

| Comprobación | Resultado |
| --- | --- |
| Crear un estudiante, verlo listado y abrir su ficha | Ficha con correo, intereses y un opcional ausente mostrado como «Sin indicar» |
| Guardar sin nombre ni nivel | No se envía escritura; cada campo requerido se marca |
| Asignar desde la ficha y ofrecer la misma clase en el editor | La pareja es la misma fila; el selector ya no la ofrece |
| Quitar la asignación desde el lado de la clase | La sección queda vacía y no se marca la clase como modificada |
| Enviar a papelera, restaurar y eliminar definitivamente | La asignación sobrevive a la papelera, vuelve al restaurar y desaparece al borrar; la clase queda intacta |
| Filtrar por nombre y por nivel y limpiar | Búsqueda y filtro se combinan; **Limpiar filtros** restituye el listado |

Se ejecuta con `./scripts/Test-E2E.ps1`, que levanta una base desechable y una API dedicada, o
directamente con `npx playwright test` desde `frontend/` si ya hay una API en el puerto 5080.

El E2E se ejecuta **por fichero** (`npx playwright test e2e/students.spec.ts`), como en SPEC 02 y 03.
Ejecutar los cuatro ficheros de una vez puede superar el límite de `/api/auth` (30 peticiones por
minuto) y provocar un **429** en `register`/`login`, que falla el test sin que haya un defecto: es el
rate limiter funcionando. Si aparece un 429, esperar un minuto y repetir el fichero.

## Desarrollo y pruebas

Configuración local: [Fase 1](phase-1.md). No cambian SDK, dependencias ni arquitectura.

    dotnet restore Profefacilisimo.slnx
    dotnet build Profefacilisimo.slnx --no-restore -c Release
    ./scripts/Test.ps1 -Configuration Release
    ./scripts/Test-E2E.ps1 -Configuration Release

Frontend:

    cd frontend
    npx tsc -b
    npx eslint .
    npx vitest run

La migración local es `AddStudentsAndLessonAssignments`: **solo añade** `Students` y
`LessonAssignments`. No cambia `Lessons`, `Activities` ni las tablas de identidad.

## Evidencia de aceptación

Numeración de las casillas de la sección 11 de la spec paralela (copiadas literalmente de la §9 de
`specs/04-student-management.md`). Estado: **verificado**. La revisión humana del diff y la
aprobación final siguen siendo del humano.

Suites: `Domain.Tests` 77/77, `Integration.Tests` 139/139, frontend 167/167 en 20 suites,
`frontend/e2e/students.spec.ts` 4/4.

### Estudiantes

| Criterio | Evidencia |
| --- | --- |
| Se puede crear un estudiante con nombre y nivel; el resto de campos son opcionales | `CreateRequiresOnlyNameAndLevelAndNormalisesEmptyOptionalsToNull`; `student-schema.test.ts` «requires a name and a level» |
| Crear sin nombre o sin nivel no envía ninguna petición de escritura | `StudentFormPage.test.tsx` «never writes when the name or the level is missing»; `CreateRejectsInvalidNameOrLevelAndPersistsNothing` |
| Un campo opcional vacío se guarda como ausente y se muestra como «Sin indicar» | `EmptyOptionalFieldsAreStoredAsNull`, `student-schema.test.ts`, `StudentProfilePage.test.tsx` «shows an absent optional as Sin indicar» |
| Un campo opcional con solo espacios se guarda como ausente | `OptionalFieldsAreTrimmedAndKept`; `student-schema.test.ts` «turns an empty or whitespace-only optional into null, never into an empty string» |
| Se puede editar cualquier campo de la ficha y el resultado se ve sin recargar | `UpdateChangesEveryFieldAndRejectsAStudentOfAnotherTeacher`; `StudentFormPage.test.tsx` «loads the current profile, edits a field and writes only on confirm» |
| Un correo con formato inválido, o de más de 254 caracteres, se rechaza | `CreateRejectsAnInvalidEmail`, `EmailOverTwoHundredFiftyFourCharactersIsRejected`; `student-schema.test.ts` «rejects a malformed email but accepts an absent one» |
| Dos estudiantes pueden compartir el mismo correo | `TwoStudentsMayShareTheSameEmail`, `TwoStudentsMayShareTheSameName` |
| El listado muestra nombre, nivel, resumen de intereses y número de clases asignadas | `StudentsPage.test.tsx` «shows the name, the level, the interests summary and the assigned lesson count» |
| La búsqueda casa por nombre y por intereses; el filtro por nivel usa A2, B1 y B2 | `SearchMatchesNameAndInterestsAndLevelFilterCombinesWithIt` |
| Búsqueda y filtro se combinan y **Limpiar filtros** restituye el listado completo | `StudentsPage.test.tsx` «combines the search and the level filter into a single listing request» y «offers to clear the filters…»; E2E test de filtros |
| El listado se ordena por actualización descendente | `TheListIsOrderedByMostRecentlyUpdatedWithStableTies` |
| Un profesor no ve, no edita y no elimina estudiantes de otro profesor | `ForeignOrUnknownEntitiesAreANotFoundInAllFourDirections`, `UpdateChangesEveryFieldAndRejectsAStudentOfAnotherTeacher`, `EveryStudentEndpointRequiresAuthenticatedValidSubject` |
| El listado vacío ofrece **Crear estudiante** y el filtrado vacío ofrece **Limpiar filtros** | `StudentsPage.test.tsx` «offers to create the first student when the listing is empty» y «offers to clear the filters when the filtered listing is empty» |

### Asignación de clases

| Criterio | Evidencia |
| --- | --- |
| Se asigna un estudiante a una clase desde el detalle de la clase | `AssignedStudents.test.tsx` «assigns the chosen student without touching the lesson draft»; E2E |
| Se asigna una clase a un estudiante desde su ficha | `AssignedLessons.test.tsx` «assigns the chosen lesson through the frozen transport»; E2E |
| La relación se guarda con una fila de `LessonAssignment`, nunca con un campo en `Lesson` | `AssignmentHasNoStatusField`, `LessonExposesAssignmentsReadOnly`; `LessonAssignmentTests` |
| Una misma clase puede estar asignada a varios estudiantes a la vez | `OneLessonTakesManyStudentsAndOneStudentTakesManyLessons` |
| Un mismo estudiante puede tener varias clases asignadas a la vez | `OneLessonTakesManyStudentsAndOneStudentTakesManyLessons` |
| Asignar dos veces la misma pareja no crea una segunda fila y no devuelve error | `AssigningTheSamePairTwiceIsIdempotentAndNeverDuplicates`, `TheDatabaseRefusesASecondRowForTheSamePair` |
| El selector no ofrece entidades ya asignadas | `AssignedStudents.test.tsx` «offers only active students that are not assigned yet»; `AssignedLessons.test.tsx` «offers only active lessons that are not assigned yet» |
| Quitar una asignación no elimina ni la clase ni el estudiante | `RemovingAnAssignmentFromEitherSideRemovesTheRowAndKeepsBothEntities` |
| Quitar la asignación desde la ficha no sale de la ficha; quitarla desde la clase no sale de la clase | `AssignedLessons.test.tsx` «unassigns without leaving the profile and without deleting the lesson»; `AssignedStudents.test.tsx` «removes an assignment without leaving or deleting the student» |
| Quitar una asignación que no existe responde 404 y no modifica nada | `RemovingAPairThatDoesNotExistIsANotFoundAndChangesNothing` |
| Asignar una clase ajena o un estudiante ajeno responde 404 | `ForeignOrUnknownEntitiesAreANotFoundInAllFourDirections` |
| No se puede asignar una clase en papelera ni un estudiante en papelera | `ATrashedStudentOrLessonCannotBeAssignedAndIsAValidationProblem` |
| Asignar o quitar no modifica la clase: ni su contenido, ni sus actividades, ni su duración, ni su versión | `AssigningOrRemovingNeverTouchesTheLessonContent` |
| Un fallo de red al asignar o al quitar deja la pantalla como estaba y muestra un reintento | `AssignedStudents.test.tsx` «leaves the screen untouched and offers a retry when a network failure happens»; `AssignedLessons.test.tsx` «leaves the row untouched and offers a retry…» |
| La sección de asignados del editor no participa en el borrador y no marca la clase como modificada | `LessonEditorPage.test.tsx` «keeps the assigned-students section outside the draft and the form»; `AssignedStudents.test.tsx` «assigns the chosen student without touching the lesson draft» |
| Se puede usar la sección de asignados con el borrador de actividades a medias y sin guardar | `LessonEditorPage.test.tsx` «places the assigned-students section outside the form» |

### Papelera y borrado

| Criterio | Evidencia |
| --- | --- |
| Enviar un estudiante a papelera pide confirmación y no elimina ninguna clase | E2E test de papelera; `StudentProfilePage.test.tsx` «sends the student to the trash after the confirmation» |
| Un estudiante en papelera conserva sus asignaciones | `TrashedEntitiesStayAssignedAndAreShownMarked` |
| Al restaurarlo vuelven sus clases asignadas, sin duplicarse | `TheTrashListsRestoresAndDeletesForGoodWithTheStateTransitions`; E2E |
| Eliminar definitivamente borra al estudiante y sus asignaciones, y no borra ninguna clase | `RemovingAStudentForGoodRemovesItsAssignmentsAndNoLesson` |
| Eliminar definitivamente una clase con asignaciones no elimina a ningún estudiante | `RemovingALessonForGoodRemovesItsAssignmentsAndNoStudent` |
| La papelera de estudiantes lista, restaura y elimina definitivamente, y pide confirmación | `TheTrashListsRestoresAndDeletesForGoodWithTheStateTransitions`; `StudentsTrashPage.test.tsx` y `StudentsPage.test.tsx` |
| Una clase en papelera se muestra marcada en la ficha y sin acción de quitar hasta restaurarla | `AssignedLessons.test.tsx` «marks a trashed lesson and withholds the unassign action until it is restored» |
| Un estudiante en papelera se muestra marcado en la clase y sin acción de quitar hasta restaurarlo | `AssignedStudents.test.tsx` «marks a trashed student and withholds the unassign action until it is restored» |
| La ficha de un estudiante en papelera sigue siendo legible | La ficha se lee por `GET /api/students/{id}` sin filtrar por estado; E2E |

### Regresión y alcance

| Criterio | Evidencia |
| --- | --- |
| El listado, el editor y el reproductor de clases siguen funcionando igual | `LessonManagementTests`, `LessonEditorTests`, `LessonPlayerPage.test.tsx`, `e2e/lesson-builder.spec.ts` en verde |
| `GET /api/lessons/{id}` conserva exactamente sus campos y no devuelve estudiantes | Contrato C1 congelado; integración de lecciones sin cambios |
| La papelera de clases y el guardado conjunto de SPEC 02 no cambian | `LessonManagementTests`, `LessonEditorTests` |
| No se añade `StudentId` ni ninguna colección de estudiantes a `Lesson` ni a `Activity` | `LessonExposesAssignmentsReadOnly`; migración aditiva |
| No se añade `Status` a `LessonAssignment` | `AssignmentHasNoStatusField` |
| No hay ninguna entidad por estudiante además de `Student` y `LessonAssignment` | Modelo cerrado C6; solo dos tablas nuevas |
| Las tablas `Lessons`, `Activities` y de identidad no cambian en la migración | `StudentMigrationTests`; `HasPendingModelChanges()` = false |
| No se añaden dependencias ni se cambia autenticación, framework o arquitectura | Sin cambios en `package.json`/`Directory.Build.props`; cuatro capas intactas |
| `npx tsc -b`, `npx eslint .` y las suites existentes siguen en verde | Verificación final de la etapa 10 |

### Comprobaciones ejecutables

- `dotnet build Profefacilisimo.slnx --no-restore` desde la raíz.
- `./scripts/Test.ps1` con `StudentTests.cs` y los ficheros nuevos de integración, con
  `TEST_DATABASE_CONNECTION` y PostgreSQL real.
- `cd frontend && npx tsc -b && npx eslint .`
- `npx vitest run` con las suites nuevas de estudiantes.
- `npx playwright test e2e/students.spec.ts` sobre la base desechable y la API en el puerto 5080,
  con el E2E serializado como en SPEC 02 y 03.

### Pendiente

- La revisión humana del diff y la aprobación final siguen siendo del humano, igual que el cambio de
  estado de la spec.
- El E2E (`frontend/e2e/students.spec.ts`) queda fuera de `tsc -b`, porque `tsconfig.json` solo
  incluye `src`. Playwright lo compila al ejecutarlo, así que un error de tipos se detectaría en la
  propia ejecución, no en la comprobación estática.
