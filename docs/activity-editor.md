# Editor de actividades — SPEC 02

## Uso

1. En **Mis clases**, cada clase muestra su duración total o «Duración incompleta» cuando alguna
   actividad heredada no tiene duración.
2. **Crear clase** y **Editar** abren el mismo editor, organizado en dos bloques: metadatos
   (título, nivel, tema, objetivo) y actividades.
3. Elige el **tipo de la nueva actividad** y pulsa **Agregar actividad**. La actividad se añade al
   final de la lista, queda seleccionada y abre su formulario.
4. **Título de la actividad**, **Instrucciones** y **Duración (minutos)** existen en los cuatro
   tipos. El resto de campos depende del tipo:
   - Speaking: lista de preguntas.
   - Reading: texto de lectura y lista de preguntas.
   - Writing: consigna.
   - Vocabulario y gramática: explicación y lista de ejercicios.
5. Añade y quita filas con **Añadir pregunta** / **Añadir ejercicio** y **Quitar**. Siempre queda
   al menos una fila.
6. Cambia el tipo con el selector **Tipo**. Si hay contenido específico que descartar, se pide
   confirmación; cancelar deja intacto el tipo y todos los campos, y confirmar conserva Id, título,
   instrucciones y duración y vacía solo el contenido específico.
7. Selecciona una actividad de la lista para editarla. Cambiar de selección conserva los valores
   locales de las demás.
8. **Subir** y **Bajar** reordenan la actividad. Están deshabilitados en los extremos, funcionan con
   teclado (Tab y Enter o Espacio) y solo cambian el borrador.
9. **Quitar** retira la actividad de la lista. Tampoco se escribe nada todavía.
10. **Guardar** valida el conjunto completo y, si todo es correcto, persiste metadatos, actividades,
    orden y total en una sola operación. Una actividad inválida impide guardar toda la clase y queda
    marcada en la lista aunque no esté seleccionada.
11. La **Duración total** se recalcula en pantalla al añadir, quitar, reordenar o editar duraciones.
    No es un campo editable.

## Límites deliberados

- Guardado explícito y único: añadir, editar, cambiar tipo, quitar y reordenar no envían ninguna
  solicitud de escritura.
- Sin arrastrar y soltar: solo botones Subir / Bajar. Sin dependencias nuevas.
- Sin autoguardado, historial, undo/redo, colaboración ni persistencia del borrador en el navegador.
- Sin tiempos de transición entre actividades y sin duplicación ni papelera individual de actividades.
- Sin concurrencia optimista: `last write wins`, sin ETag, `If-Match`, 412 ni 428.
- La duración de una actividad es obligatoria al guardar. Una actividad nueva no recibe una duración
  inventada: el campo queda vacío y la clase se muestra como «Duración incompleta».
- Los datos heredados sin duración se conservan como `null` y deben completarse para poder guardar.
- El contenido se muestra siempre como texto; nunca se interpreta como HTML ejecutable.

## Decisiones técnicas

- **Metadatos en React Hook Form, actividades en estado local.** Los cuatro metadatos siguen en
  RHF con Zod; el borrador de actividades vive en `useState`. El guardado valida el conjunto
  completo con `lessonDraftSchema` antes de enviar, de modo que una sola pasada de Zod produce rutas
  como `activities[2].content.text`, que es lo que el editor usa para marcar la actividad y el campo
  exactos.
- **Clave local separada del Id.** `ActivityDraft.key` es estable durante la edición y `id` es
  `null` mientras la actividad no se ha guardado. Tras el éxito, las claves locales se regeneran a
  partir de los Id devueltos y solo entonces se limpia el indicador de cambios pendientes. El
  indicador compara una huella del borrador que excluye la clave local.
- **Unión discriminada por tipo.** `ActivityDraft` es una unión discriminada por `type`, así que el
  formulario no puede renderizar el contenido de un tipo con las reglas de otro y `applyType`
  conserva Id, título, instrucciones y duración al cambiar de tipo.
- **`draftFromSaved` usa la columna `Type` como discriminador autoritativo.** Un `type` redundante
  dentro del JSON antiguo se ignora y nunca puede contradecirla. Un tipo desconocido detiene la
  lectura en lugar de reinterpretar el contenido.
- **Los errores del servidor se reparten por actividad.** `LessonSaveError` conserva las claves de
  `ValidationProblemDetails`; las que siguen el formato `activities[i].campo` se asignan a la
  actividad correspondiente y el resto se muestra como mensaje general.
- **Al fallar el guardado se selecciona la primera actividad con error.** La lista ya marca todas
  las actividades afectadas; además el editor abre la primera que necesita atención.
- **Sin selección automática al cargar.** Al abrir una clase no se selecciona ninguna actividad: la
  lista es la vista principal y el formulario aparece al elegir una o al agregar una nueva.
- **Quitar la última fila está deshabilitado.** Mantiene el borrador siempre dentro de la regla de
  1 a 50 preguntas o ejercicios, en lugar de permitir un estado que el profesor no podría corregir
  sin volver a añadir la fila.
- **`ActivityList` es totalmente controlado.** No guarda copia de las actividades, por lo que
  cambiar de selección no puede perder los valores locales de las demás.

## Contrato con el backend

La escritura conjunta (etapa 5 de SPEC 02) está implementada en `LessonDtos.cs`, `LessonService.cs`
y `Lesson.cs`, y el frontend se apoya en este contrato:

- `SaveLessonRequest` transporta `Activities`. Un array ausente significa «no toques las
  actividades»: `POST` lo acepta y `PUT` responde 400 con la clave `activities`.
- Una actividad sin `id` es nueva; con `id`, debe pertenecer a la misma clase y al mismo profesor.
  Un `id` repetido, ajeno o desconocido rechaza el guardado completo con 400.
- Las claves de error por actividad usan el formato `activities[i]` y `activities[i].<campo>`, por
  ejemplo `activities[2].content.text`. `LessonSaveError` las reparte por actividad; el resto se
  muestra como mensaje general.
- La respuesta 200/201 devuelve las actividades canónicas con sus `id` definitivos, su `order`
  consecutivo y el total recalculado.
- `UserId`, `LessonId` y `Order` no viajan nunca desde el cliente.

## Verificación de punta a punta

El flujo completo es una prueba permanente: `frontend/e2e/lesson-builder.spec.ts`. Recorre
`login → abrir una clase → crear → editar → eliminar → reordenar → guardar → recargar` en un
navegador real contra la API y PostgreSQL, y comprueba en cada paso lo que el servidor persistió:

| Comprobación | Resultado |
| --- | --- |
| Guardar dos actividades de tipos distintos | 200; el servidor guarda `order` 0 y 1 con sus duraciones |
| Total calculado por el servidor | 25 con actividades de 15 y 10 |
| Recargar tras guardar | Reproduce títulos, tipos, duraciones, orden y total exactos |
| Reordenar y guardar | El nuevo orden persiste y el total no cambia |
| Quitar una actividad y guardar | Se elimina en el servidor y el total pasa a 10 |
| Guardar un array vacío | Se eliminan todas las actividades y el total queda en 0 |
| Ancho de 390 px | Sin desbordamiento horizontal |

Se ejecuta con `./scripts/Test-E2E.ps1`, que levanta una base desechable y una API dedicada, o
directamente con `npx playwright test` desde `frontend/` si ya hay una API en el puerto 5080.

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

## Evidencia de aceptación

Numeración de las casillas de la sección 11 de SPEC 02. Estado: **verificado en su totalidad**.
Suites: frontend 57/57, `Domain.Tests` 55/55, `Integration.Tests` 101/101.

| Criterios | Evidencia |
| --- | --- |
| Flujo principal (crear, editar, eliminar, reordenar, guardar) | `frontend/e2e/lesson-builder.spec.ts` (recorrido completo en navegador real); `CreateSavesMetadataAndTheWholeSetInOneRequest`, `UpdateSavesEditsAdditionsDeletionsAndOrderTogether` |
| Recargar reproduce el estado guardado | `lesson-builder.spec.ts`: recarga real tras guardar con títulos, tipos, duraciones, orden y total idénticos |
| Crear, editar y quitar una actividad de los cuatro tipos | `ActivityForm.test.tsx` («shows the fields of each type and hides the others», «adds and removes rows locally without writing anything»); `LessonEditorPage.test.tsx` |
| Cambiar de selección conserva el borrador | `ActivityList.test.tsx`: el componente es controlado y no muta el borrador recibido |
| El HTML se muestra como texto y nunca se ejecuta | Sin `dangerouslySetInnerHTML`; el contenido se pinta en `input`, `textarea` y `select`, y viaja como JSONB |
| El servidor rechaza contenido incompatible con el tipo | `OneInvalidActivityRejectsTheWholeSaveAndPointsAtIt`; en cliente, la unión discriminada de `LessonEditorPage.test.tsx` |
| Cancelar el cambio de tipo conserva todo; confirmarlo vacía solo el contenido específico | `ActivityForm.test.tsx`: «asks before discarding specific content when the type changes» |
| Una actividad inválida impide guardar e identifica actividad y campo | `LessonEditorPage.test.tsx`: «blocks the whole save when one activity is invalid and marks it even if it is not selected»; verificado además en navegador |
| El borrador permanece tras un error de validación o de red | `LessonEditorPage.test.tsx`: «keeps the activity draft and marks the activity the server rejected» |
| Clase sin actividades: total 0 | `lesson-duration.test.ts`, `LessonEditorPage.test.tsx`, `CreateAcceptsAnAbsentOrEmptySetAndLeavesTotalZero` |
| Duración ausente, 0, negativa o fraccionaria rechazada | `lesson-duration.test.ts`, `LessonEditorPage.test.tsx`, `ActivityForm.test.tsx` y la validación del servidor |
| 10 + 15 + 5 = 30 en cualquier orden, 20 al quitar la de 10 | `lesson-duration.test.ts`: mismo ejemplo que el dominio (`LessonTests`) |
| Reordenar no cambia el total | `lesson-duration.test.ts`; en navegador, el total siguió siendo 25 tras reordenar |
| Datos heredados muestran «Duración incompleta» | `LessonsPage.test.tsx`, `lesson-duration.test.ts` y `LegacyActivityWithoutDurationMustBeCompletedBeforeSaving` |
| Guardar una clase heredada exige completar las duraciones | `LegacyActivityWithoutDurationMustBeCompletedBeforeSaving`; el total `null` se propaga a la validación del borrador |
| El total persistido coincide con el servidor | Recorrido en navegador: 15 + 10 → `estimatedDuration` 25 en `GET /api/lessons/{id}` |
| Subir y Bajar con teclado y deshabilitados en los extremos | `ActivityList.test.tsx`: «disables Up on the first activity and Down on the last one» y «reorders with the pointer and with the keyboard»; confirmado en navegador (Enter) |
| Cada actividad conserva Id, contenido y duración al moverse | `ActivityList.test.tsx`, la huella del borrador y el orden persistido tras reordenar |
| Editar, quitar o reordenar no escribe antes de Guardar | `LessonEditorPage.test.tsx`: `saveLesson` no se llama antes de pulsar Guardar |
| Guardar persiste metadatos, contenido, orden, eliminaciones y total conjuntamente | `UpdateSavesEditsAdditionsDeletionsAndOrderTogether`, `RollsBackMetadataActivitiesOrderAndTotalWhenAFailureHappensBeforeCommit` |
| Id ajeno, repetido o desconocido rechaza todo el guardado | `UpdateRejectsForeignRepeatedAndUnknownIdsWithoutPartialPersistence` |
| Omitir `activities` en PUT devuelve 400 | `UpdateWithoutTheActivitySetIsRejectedAndNeverDeletes` |
| Guardar un array vacío elimina las actividades y deja total 0 | `UpdateWithAnEmptySetDeletesEveryActivityAndLeavesTotalZero`; verificado en navegador |
| Intercambiar dos actividades no viola el índice único | `SwappingTwoActivitiesDoesNotViolateTheUniqueOrderIndex` |
| Un fallo a mitad de la transacción deja todo intacto | `RollsBackMetadataActivitiesOrderAndTotalWhenAFailureHappensBeforeCommit` |
| Duplicar y restaurar conservan actividades, orden y duraciones | `LessonManagementTests`; el total se recalcula en `Lesson.Duplicate` |
| Sin endpoints de guardado por actividad | No se añadió ninguna ruta |
| Sin ETag, `If-Match`, 412 ni 428 | No hay cabeceras ni códigos en el transporte del editor |
| Sin arrastrar y soltar, autoguardado, historial ni recuperación de borradores | `ActivityList` usa botones; no hay persistencia local ni historial |
| Sin campos de transición entre actividades | El formulario solo tiene título, instrucciones, duración y contenido por tipo |
| Registro, login, refresh, logout, papelera y duplicación siguen funcionando | `AuthTests`, `LessonManagementTests`, `App.test.tsx`, `LessonsPage.test.tsx` |

### Pendiente

- La revisión humana del diff y la aprobación final siguen siendo del humano, igual que el cambio de
  estado de la spec.
- El E2E (`frontend/e2e/lesson-builder.spec.ts`) queda fuera de `tsc -b`, porque `tsconfig.json` solo
  incluye `src`. Playwright lo compila al ejecutarlo, así que un error de tipos se detectaría en la
  propia ejecución, no en la comprobación estática.
