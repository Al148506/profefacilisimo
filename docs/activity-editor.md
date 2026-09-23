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

## Dependencias pendientes del backend

> **Bloqueante para el flujo completo.** La etapa 5 de SPEC 02 (escritura conjunta) no está
> implementada. El frontend ya envía `activities` en `POST /api/lessons` y `PUT /api/lessons/{id}`,
> pero hoy:

- `SaveLessonRequest` sigue siendo `(Title, Level, Topic, Objective)`: no declara `Activities`, así
  que el servidor **ignora el array** y el guardado persiste solo metadatos.
- `LessonService.CreateAsync` y `UpdateAsync` nunca llaman a `Lesson.ApplyActivities`.
- `PUT /api/lessons/{id}` no devuelve 400 cuando falta `activities`, ni rechaza Id ajeno, repetido o
  desconocido, ni aplica el orden en dos pasos.
- No existe `tests/Integration.Tests/LessonEditorTests.cs`.

El dominio necesario ya está listo (`Lesson.ApplyActivities`, `Activity.Update`,
`Activity.ValidateEditableData`), por lo que la etapa 5 es fundamentalmente trabajo de
`LessonDtos.cs` y `LessonService.cs`.

**Consecuencia práctica:** hoy el editor es correcto en pantalla y en validación, pero al recargar
una clase las actividades creadas o editadas no estarán ahí. Hasta que la etapa 5 se implemente, el
flujo `crear → editar → eliminar → reordenar → guardar → recargar` no se puede verificar de punta a
punta.

**Contrato que el frontend espera del backend:** claves de error por actividad con el formato
`activities[i].<campo>`, por ejemplo `activities[2].content.text`, y la respuesta 200/201 con las
actividades canónicas, sus Id definitivos y su `order`.

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

Numeración de las casillas de la sección 11 de SPEC 02. Estado de la revisión: **parcial**, porque
la escritura conjunta depende de la etapa 5 del backend y el E2E no está escrito.

| Criterios | Evidencia |
| --- | --- |
| Flujo principal (crear, editar, eliminar, reordenar, guardar) | `LessonEditorPage.test.tsx`: «saves the whole set in the arranged order and adopts the Ids the server returns». El recorrido de recarga queda bloqueado por la etapa 5 del backend |
| Recargar reproduce el estado guardado | **No verificado**: requiere la etapa 5 del backend |
| Crear, editar y quitar una actividad de los cuatro tipos | `ActivityForm.test.tsx`: «shows the fields of each type and hides the others» y «adds and removes rows locally without writing anything» |
| Cambiar de selección conserva el borrador | `ActivityList.test.tsx`: el componente es controlado y no muta el borrador recibido |
| El HTML se muestra como texto y nunca se ejecuta | Sin `dangerouslySetInnerHTML` en el editor; el contenido viaja como JSONB y se pinta en `input`, `textarea` y `select` |
| El servidor rechaza contenido incompatible con el tipo | `LessonEditorPage.test.tsx` verifica la unión discriminada en cliente; el rechazo en servidor es de la etapa 5 |
| Cancelar el cambio de tipo conserva todo; confirmarlo vacía solo el contenido específico | `ActivityForm.test.tsx`: «asks before discarding specific content when the type changes» |
| Una actividad inválida impide guardar e identifica actividad y campo | `LessonEditorPage.test.tsx`: «blocks the whole save when one activity is invalid and marks it even if it is not selected» |
| El borrador permanece tras un error de validación o de red | `LessonEditorPage.test.tsx`: «keeps the activity draft and marks the activity the server rejected» |
| Clase sin actividades: total 0 | `lesson-duration.test.ts` y `LessonEditorPage.test.tsx` |
| Duración ausente, 0, negativa o fraccionaria rechazada | `lesson-duration.test.ts`, `LessonEditorPage.test.tsx` y `ActivityForm.test.tsx` |
| 10 + 15 + 5 = 30 en cualquier orden, 20 al quitar la de 10 | `lesson-duration.test.ts`: mismo ejemplo que el dominio |
| Reordenar no cambia el total | `lesson-duration.test.ts` (el total no depende del orden) |
| Datos heredados muestran «Duración incompleta» | `LessonsPage.test.tsx` y `lesson-duration.test.ts` |
| Guardar una clase heredada exige completar las duraciones | `lesson-duration.test.ts` (total `null` mientras falte una) y la validación del borrador |
| El total persistido coincide con el servidor | **No verificado**: requiere la etapa 5 del backend |
| Subir y Bajar con teclado y deshabilitados en los extremos | `ActivityList.test.tsx`: «disables Up on the first activity and Down on the last one» y «reorders with the pointer and with the keyboard» |
| Cada actividad conserva Id, contenido y duración al moverse | `ActivityList.test.tsx` y la huella del borrador en `LessonEditorPage.test.tsx` |
| Editar, quitar o reordenar no escribe antes de Guardar | `LessonEditorPage.test.tsx`: `saveLesson` no se llama antes de pulsar Guardar |
| Guardar persiste metadatos, contenido, orden, eliminaciones y total conjuntamente | Envío de un único `SaveLessonRequest`; la persistencia depende de la etapa 5 |
| Id ajeno, repetido o desconocido rechaza todo el guardado | **No verificado**: etapa 5 del backend |
| Omitir `activities` en PUT devuelve 400 | **No verificado**: etapa 5 del backend. El editor siempre envía el array |
| Guardar un array vacío elimina las actividades y deja total 0 | **No verificado**: etapa 5 del backend |
| Intercambiar dos actividades no viola el índice único | **No verificado**: etapa 5 del backend (orden en dos pasos) |
| Un fallo a mitad de la transacción deja todo intacto | **No verificado**: etapa 5 del backend |
| Duplicar y restaurar conservan actividades, orden y duraciones | `LessonsPage.test.tsx` y `LessonManagementTests`; el total se recalcula en `Lesson.Duplicate` |
| Sin endpoints de guardado por actividad | No se añadió ninguna ruta |
| Sin ETag, `If-Match`, 412 ni 428 | No hay cabeceras ni códigos en el transporte del editor |
| Sin arrastrar y soltar, autoguardado, historial ni recuperación de borradores | `ActivityList` usa botones; no hay persistencia local ni historial |
| Sin campos de transición entre actividades | El formulario solo tiene título, instrucciones, duración y contenido por tipo |
| Registro, login, refresh, logout, papelera y duplicación siguen funcionando | `AuthTests`, `LessonManagementTests`, `App.test.tsx`, `LessonsPage.test.tsx` |

`frontend/e2e/lesson-builder.spec.ts` (etapa 10) **no se ha escrito**: el flujo que debe recorrer
depende de la escritura conjunta del backend, así que la prueba fallaría por una causa ajena al
frontend. Se añadirá junto con la etapa 5.
