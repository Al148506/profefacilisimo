# SPEC 02 — Reporte de validación final

**Fecha:** 2026-09-23
**Spec de referencia:** `specs/02-editor-de-actividades-mvp.md` (`Estado: Aprobado`)
**Rama validada:** `spec-02-editor-de-actividades-mvp` (tip `0026a60`)
**Integración:** `main` → `89b30c8` (merge commit, `--no-ff`)
**Resultado global: los 31 criterios de aceptación cumplidos. `main` queda listo para continuar.**

---

## 1. Resumen de cumplimiento

| Sección de §11 | Criterios | Cumplido | Parcial | No cumplido |
| --- | ---: | ---: | ---: | ---: |
| Flujo principal | 2 | 2 | 0 | 0 |
| Contenido | 7 | 7 | 0 | 0 |
| Duración | 7 | 7 | 0 | 0 |
| Orden y persistencia | 10 | 10 | 0 | 0 |
| Alcance | 5 | 5 | 0 | 0 |
| **Total** | **31** | **31** | **0** | **0** |

No se detectó ningún requisito incompleto, ninguna desviación de alcance y ninguna funcionalidad
faltante respecto a lo descrito en la especificación.

---

## 2. Auditoría de criterios (Fase 1)

### 2.1 Flujo principal

| # | Criterio | Estado | Evidencia | Archivos |
| ---: | --- | --- | --- | --- |
| 1 | Se completa `login → abrir una clase → crear → editar → eliminar → reordenar → guardar` | Cumplido | `frontend/e2e/lesson-builder.spec.ts` recorre el flujo completo contra la API y PostgreSQL reales y verifica en cada paso lo persistido. Pasa en ejecución real. | `frontend/e2e/lesson-builder.spec.ts` |
| 2 | Recargar tras guardar reproduce el estado guardado | Cumplido | El E2E hace `page.reload()` tras guardar y compara títulos, tipos, duraciones, orden y total (`.activity-name`, `.activity-duration`, `Duración total:`). | `frontend/e2e/lesson-builder.spec.ts` |

### 2.2 Contenido

| # | Criterio | Estado | Evidencia | Archivos |
| ---: | --- | --- | --- | --- |
| 3 | Crear, editar y quitar una actividad de cada uno de los cuatro tipos | Cumplido | `ActivityForm.tsx` renderiza los cuatro formularios; el E2E crea Reading, VocabularyGrammar y Writing; `ActivityForm.test.tsx` cubre campos por tipo. | `frontend/src/lessons/ActivityForm.tsx`, `ActivityForm.test.tsx` |
| 4 | Cambiar de selección conserva el borrador local de las demás | Cumplido | `ActivityList` es totalmente controlado: no guarda copia del borrador, y `LessonEditorPage` mantiene el array en `useState`. `ActivityList.test.tsx` lo verifica. | `frontend/src/lessons/ActivityList.tsx`, `LessonEditorPage.tsx` |
| 5 | El texto HTML se muestra como texto y nunca se ejecuta | Cumplido | No existe `dangerouslySetInnerHTML` ni `innerHTML` en `frontend/src`. El contenido se pinta en `input`, `textarea` y `select`, y viaja como JSONB. | `frontend/src/lessons/ActivityForm.tsx`, `lesson-schema.ts` |
| 6 | El servidor rechaza contenido incompatible con el tipo | Cumplido | `LessonService.ReadContent` deserializa el JSON según el `Type` declarado y aplica `ActivityContent.Validate()`; un fallo produce 400 con la clave `activities[i].content`. `OneInvalidActivityRejectsTheWholeSaveAndPointsAtIt`. | `backend/Infrastructure/LessonService.cs`, `backend/Domain/Activity.cs` |
| 7 | Cancelar el cambio de tipo conserva todo; confirmarlo vacía solo el contenido específico | Cumplido | `ActivityForm.changeType` pide confirmación solo si `hasSpecificContent`; `applyType` conserva `id`, título, instrucciones y duración. Test «asks before discarding specific content when the type changes». | `frontend/src/lessons/ActivityForm.tsx`, `lesson-schema.ts` |
| 8 | Una actividad inválida impide guardar e identifica actividad y campo | Cumplido | `onSubmit` valida el conjunto con `lessonDraftSchema` antes de enviar y reparte los `issues` por actividad; la lista marca las no seleccionadas. `LessonEditorPage.test.tsx` + verificación en navegador. | `frontend/src/lessons/LessonEditorPage.tsx` |
| 9 | El borrador permanece tras un error de validación o de red | Cumplido | `onError` de la mutación no toca el estado del borrador; solo asigna errores. `retry: false`. Test «keeps the activity draft and marks the activity the server rejected». | `frontend/src/lessons/LessonEditorPage.tsx`, `lesson-api.ts` |

### 2.3 Duración

| # | Criterio | Estado | Evidencia | Archivos |
| ---: | --- | --- | --- | --- |
| 10 | Una clase sin actividades muestra y persiste total 0 | Cumplido | `Lesson.RecalculateDuration` → `TotalOf` devuelve 0 sin actividades; `CK_Lesson_Duration` admite `>= 0`; `formatLessonDuration(0)` → «0 min». `CreateAcceptsAnAbsentOrEmptySetAndLeavesTotalZero`. | `backend/Domain/Lesson.cs`, `backend/Infrastructure/AppDbContext.cs`, `frontend/src/lessons/lesson-duration.ts` |
| 11 | Guardar una actividad sin duración, con 0, negativa o fraccionaria se rechaza | Cumplido | Cliente: `duration` es `z.number().int().positive()` y `null` no pasa. Servidor: `input.EstimatedDuration <= 0` → 400 y `Rules.RequiredDuration`. `LessonEditorPage.test.tsx`, `ActivityForm.test.tsx`. | `frontend/src/lessons/lesson-schema.ts`, `backend/Infrastructure/LessonService.cs`, `backend/Domain/Lesson.cs` |
| 12 | 10 + 15 + 5 da 30 en cualquier orden, y 20 tras quitar la de 10 | Cumplido | Mismo ejemplo en `LessonTests` (dominio) y `lesson-duration.test.ts` (frontend). | `tests/Domain.Tests/LessonTests.cs`, `frontend/src/lessons/lesson-duration.test.ts` |
| 13 | Reordenar no cambia el total | Cumplido | El total es una suma sin intervalos; el E2E reordena, guarda y comprueba que `estimatedDuration` sigue en 25. | `frontend/e2e/lesson-builder.spec.ts`, `backend/Domain/Lesson.cs` |
| 14 | Las actividades heredadas sin duración muestran «Duración incompleta» | Cumplido | `null` se propaga a `INCOMPLETE_DURATION_LABEL` en listado y editor. `LessonsPage.test.tsx`, `LegacyActivityWithoutDurationMustBeCompletedBeforeSaving`. | `frontend/src/lessons/lesson-duration.ts`, `LessonsPage.tsx`, `LessonEditorPage.tsx` |
| 15 | Guardar una clase heredada exige completar todas sus duraciones | Cumplido | `draftFromSaved` deja `duration: null` sin inventar valor, y el esquema exige entero positivo. `LegacyActivityWithoutDurationMustBeCompletedBeforeSaving`. | `frontend/src/lessons/lesson-schema.ts`, `tests/Integration.Tests/LessonEditorTests.cs` |
| 16 | El total persistido coincide con el cálculo del servidor | Cumplido | `Lesson.ApplyActivities` calcula el total en la misma transacción; el E2E comprueba que `GET /api/lessons/{id}` devuelve 25 para 15 + 10. | `backend/Domain/Lesson.cs`, `backend/Infrastructure/LessonService.cs` |

### 2.4 Orden y persistencia

| # | Criterio | Estado | Evidencia | Archivos |
| ---: | --- | --- | --- | --- |
| 17 | Subir y Bajar funcionan con teclado y están deshabilitados en los extremos | Cumplido | Son `<button>` nativos con `disabled` en `index === 0` y `index === length - 1`. Test «disables Up on the first activity and Down on the last one» y «reorders with the pointer and with the keyboard». | `frontend/src/lessons/ActivityList.tsx`, `ActivityList.test.tsx` |
| 18 | Cada actividad conserva Id, contenido y duración al moverse | Cumplido | `moveActivity` solo intercambia posiciones del array; los objetos del borrador no se recrean. `ActivityList.test.tsx` y el orden persistido del E2E. | `frontend/src/lessons/LessonEditorPage.tsx` |
| 19 | Editar, quitar o reordenar no produce ninguna escritura antes de Guardar | Cumplido | Todas esas acciones solo llaman a `setActivities`. `LessonEditorPage.test.tsx` comprueba que `saveLesson` no se invoca antes de Guardar. | `frontend/src/lessons/LessonEditorPage.tsx` |
| 20 | Guardar persiste metadatos, contenido, orden, eliminaciones y total conjuntamente | Cumplido | `LessonService.UpdateAsync` abre una transacción y aplica todo dentro. `UpdateSavesEditsAdditionsDeletionsAndOrderTogether`, `RollsBackMetadataActivitiesOrderAndTotalWhenAFailureHappensBeforeCommit`. | `backend/Infrastructure/LessonService.cs` |
| 21 | Un Id ajeno, repetido o desconocido rechaza todo el guardado con 400 | Cumplido | `Validate` compara con `ownedActivityIds` y usa un `HashSet` para duplicados; `Lesson.ApplyActivities` vuelve a validarlo en dominio. `UpdateRejectsForeignRepeatedAndUnknownIdsWithoutPartialPersistence`. | `backend/Infrastructure/LessonService.cs`, `backend/Domain/Lesson.cs` |
| 22 | Omitir `activities` en PUT devuelve 400 y no elimina actividades | Cumplido | `requireActivities: true` en `UpdateAsync` → error en la clave `activities`. `UpdateWithoutTheActivitySetIsRejectedAndNeverDeletes`. | `backend/Infrastructure/LessonService.cs` |
| 23 | Guardar un array vacío elimina las actividades y deja total 0 | Cumplido | Un array vacío es válido y `ApplyActivities([])` deja la clase sin actividades con total 0. `UpdateWithAnEmptySetDeletesEveryActivityAndLeavesTotalZero` + E2E. | `backend/Domain/Lesson.cs`, `LessonService.cs` |
| 24 | Intercambiar dos actividades no viola el índice único de orden | Cumplido | `ParkActivityOrder` mueve las persistidas por encima de toda posición final en una primera pasada, dentro de la misma transacción. `SwappingTwoActivitiesDoesNotViolateTheUniqueOrderIndex`. | `backend/Domain/Lesson.cs`, `backend/Infrastructure/LessonService.cs` |
| 25 | Un fallo a mitad de la transacción deja intactas actividades, metadatos y total | Cumplido | Las dos fases de orden y la escritura comparten la transacción; sin `CommitAsync` no hay cambios visibles. `RollsBackMetadataActivitiesOrderAndTotalWhenAFailureHappensBeforeCommit`. | `backend/Infrastructure/LessonService.cs` |
| 26 | Duplicar y restaurar conservan actividades, orden y duraciones | Cumplido | `Duplicate` copia cada actividad con `CopyTo` (incluida la duración) y recalcula el total de la copia; restaurar no altera actividades. `LessonManagementTests`. | `backend/Domain/Lesson.cs`, `LessonService.cs` |

### 2.5 Alcance

| # | Criterio | Estado | Evidencia |
| ---: | --- | --- | --- |
| 27 | No existen endpoints de guardado por actividad | Cumplido | `LessonEndpoints` solo mapea las 8 rutas de §7; ninguna opera sobre una actividad suelta. |
| 28 | No se envía ni se valida ETag o `If-Match`, y no se devuelven 412 ni 428 | Cumplido | Búsqueda sobre `backend/**/*.cs` sin resultados para `If-Match`, `ETag`, `412`, `428`, `Version`, `RowVersion`. |
| 29 | No hay arrastrar y soltar, autoguardado, historial ni recuperación de borradores | Cumplido | Sin `localStorage`/`sessionStorage` ni eventos de drag en `frontend/src`; el único cambio de orden son los botones Subir/Bajar. |
| 30 | No hay campos de transición entre actividades | Cumplido | Sin `TransitionAfterMinutes` ni equivalente en `backend`, `tests` ni `frontend/src`. |
| 31 | Registro, login, refresh, logout, papelera y duplicación de SPEC 01 siguen funcionando | Cumplido | `AuthTests`, `AuthHardeningTests`, `LessonManagementTests`, `App.test.tsx`, `LessonsPage.test.tsx` y los E2E `session.spec.ts` y `lessons.spec.ts` (2 tests). |

---

## 3. Problemas encontrados y correcciones (Fase 2)

### 3.1 Defecto corregido — locator ambiguo en el E2E permanente

**Severidad:** bloqueante para la suite E2E (no afectaba al producto).

Al ejecutar por primera vez `frontend/e2e/lesson-builder.spec.ts` contra la API real, el test falló en
su última aserción:

```
Error: strict mode violation: getByText('20 min') resolved to 2 elements:
  1) <strong>20 min</strong>                        <- el total de la clase
  2) <span class="activity-duration">20 min</span>  <- la duración de la actividad
```

Era un **defecto del propio test, no de la interfaz**: la UI mostraba correctamente ambos valores y el
locator no era específico. Ocurría solo en ese punto porque el total coincidía con la duración de la
única actividad.

**Corrección aplicada:** anclar cada aserción a su nodo.

- El total se comprueba con `getByText('Duración total:')` + `toContainText(...)`.
- La duración de la actividad, con `page.locator('.activity-duration')`.

Se aplicó también a la aserción de `25 min` (línea 65), que pasaba únicamente porque en ese momento
ninguna actividad duraba 25 minutos, y habría fallado al cambiar los datos del test.

**Resultado:** E2E `4/4` en ejecución real.

### 3.2 Inconsistencia documental corregida

`docs/activity-editor.md` afirmaba en su sección «Pendiente» que
`frontend/e2e/lesson-builder.spec.ts` **no se había escrito** y que la verificación de punta a punta se
había hecho con «un script temporal de navegador». Ambas afirmaciones eran ya falsas. Se actualizó la
sección de verificación para apuntar al test permanente y se dejó escrito el hueco real conocido:
`tsconfig.json` del frontend solo incluye `src`, así que `e2e/` queda fuera de `tsc -b` (Playwright lo
compila al ejecutarlo).

### 3.3 Limpieza de artefactos temporales

Se eliminaron `frontend/visual-check.mjs` y `frontend/e2e/visual-check.spec.ts`, que eran temporales y
habían quedado commiteados por error. Estaban ya vaciados y marcados como obsoletos, y su contenido
había sido sustituido por `lesson-builder.spec.ts`.

### 3.4 Revisión sin hallazgos

Se revisaron sin encontrar problemas: la migración `AddCalculatedLessonDuration` (constraint y
recálculo, incluidas las clases en papelera), las proyecciones de `LessonReader`, la validación de
conjunto en `LessonService`, la unión discriminada de Zod, el reparto de errores por actividad y la
ausencia de escrituras prematuras en el editor.

---

## 4. Archivos modificados durante la revisión final

### 4.1 Modificados en esta validación

| Archivo | Cambio |
| --- | --- |
| `frontend/e2e/lesson-builder.spec.ts` | Locators del total y de la duración anclados a su nodo (corrección del defecto 3.1) |
| `docs/activity-editor.md` | Sección de verificación E2E y «Pendiente» al día |
| `frontend/visual-check.mjs` | **Eliminado** (temporal) |
| `frontend/e2e/visual-check.spec.ts` | **Eliminado** (temporal) |
| `.workbuddy-ai/memory/MEMORY.md`, `.workbuddy-ai/memory/2026-09-23.md` | Notas de proyecto |

### 4.2 Ficheros incluidos en la integración (respecto a `main` anterior, `4a49c19`)

34 ficheros, +3479 / −79 líneas.

**Backend:** `backend/Domain/Activity.cs`, `backend/Domain/Lesson.cs`,
`backend/Application/Lessons/LessonDtos.cs`, `backend/Infrastructure/LessonService.cs`,
`backend/Infrastructure/LessonReader.cs`, `backend/Infrastructure/AppDbContext.cs`,
`backend/Infrastructure/Migrations/AppDbContextModelSnapshot.cs`,
`backend/Infrastructure/Migrations/20260923073000_AddCalculatedLessonDuration.{cs,Designer.cs}` *(nuevos)*.

**Frontend:** `frontend/src/lessons/lesson-api.ts`, `lesson-schema.ts`, `LessonEditorPage.tsx`,
`LessonsPage.tsx`, `styles.css`, `ActivityList.tsx` *(nuevo)*, `ActivityForm.tsx` *(nuevo)*,
`lesson-duration.ts` *(nuevo)*, y los tests `ActivityList.test.tsx`, `ActivityForm.test.tsx`,
`lesson-duration.test.ts`, `LessonEditorPage.test.tsx`, `LessonsPage.test.tsx`, `lesson-api.test.ts`,
`frontend/e2e/lesson-builder.spec.ts` *(nuevo)*.

**Tests .NET:** `tests/Domain.Tests/ActivityEditingTests.cs` *(nuevo)*,
`tests/Domain.Tests/LessonTests.cs`, `tests/Integration.Tests/LessonEditorTests.cs` *(nuevo)*,
`tests/Integration.Tests/LessonManagementTests.cs`, `tests/Integration.Tests/LessonMigrationTests.cs`.

**Documentación:** `docs/activity-editor.md` *(nuevo)*, `docs/class-management.md`, `README.md`.

---

## 5. Validación técnica (Fase 2)

Ejecutada sobre la rama antes del merge y repetida sobre `main` después.

| Comprobación | Comando | Resultado |
| --- | --- | --- |
| Compilación backend | `dotnet build Profefacilisimo.slnx --no-restore` | **0 errores, 0 advertencias** |
| Dominio | `dotnet test tests/Domain.Tests` | **55/55** |
| Integración (PostgreSQL real) | `dotnet test tests/Integration.Tests` | **101/101** |
| Unitarios frontend | `npm test` (Vitest) | **57/57** en 9 ficheros |
| Tipado | `npx tsc -b` | Limpio |
| Lint | `npx eslint .` | Limpio |
| E2E (navegador real) | `npx playwright test` | **4/4** |

El E2E se ejecutó contra una base desechable `pf_e2e` con las migraciones aplicadas y una API dedicada
en el puerto 5080. No se usó `dotnet restore` (no funciona en este entorno) ni `EF InMemory`.

---

## 6. Resultado de la integración (Fase 3)

| Aspecto | Resultado |
| --- | --- |
| Rama de trabajo pendiente | `spec-02-editor-de-actividades-mvp` (única rama pendiente; SPEC 01 ya estaba en `main` por el PR #1) |
| Estado previo de `main` | `4a49c19`, idéntico al merge base: no había divergencia |
| Tipo de integración | Merge commit con `--no-ff`, siguiendo la convención del repo (SPEC 01 se integró igual) |
| Conflictos | **Ninguno** |
| Ajustes por incompatibilidad | Ninguno necesario |
| Commit de merge | `89b30c8` |
| Commits aportados | 11 |
| Estado del árbol | Limpio tras el merge |

Los cambios pendientes en el árbol de trabajo se consolidaron en 4 commits coherentes antes del merge:

| Commit | Contenido |
| --- | --- |
| `2d5563a` | E2E permanente + borrado de los ficheros temporales |
| `f75c1b0` | Re-validación de errores por actividad + ajuste de estilos de la fila |
| `e1b1c7f` | Guía del editor al día |
| `0026a60` | Memoria del proyecto |

---

## 7. Verificación posterior al merge (Fase 4)

Sobre `main` en `89b30c8`:

| Comprobación | Resultado |
| --- | --- |
| Compilación | 0 errores, 0 advertencias |
| `Domain.Tests` | 55/55 |
| `Integration.Tests` | 101/101 |
| Frontend (Vitest) | 57/57 |
| `tsc -b` / `eslint .` | Limpios |

**Regresiones: ninguna.** El árbol de `main` es idéntico al de la rama validada
(`git diff spec-02-editor-de-actividades-mvp main` vacío), por lo que la ejecución E2E `4/4` realizada
sobre la rama es evidencia válida para `main`.

**Pendiente por decisión del usuario:** la ejecución del E2E sobre `main` se pospuso expresamente. No
es un riesgo abierto, porque el árbol es el mismo y la suite ya pasó sobre él; se puede repetir en
cualquier momento con `./scripts/Test-E2E.ps1`.

---

## 8. Riesgos conocidos y pendientes

| Riesgo / pendiente | Impacto | Tratamiento |
| --- | --- | --- |
| E2E no re-ejecutado sobre `main` | Ninguno real: árbol idéntico | Posposición pedida por el usuario; repetible con `./scripts/Test-E2E.ps1` |
| `frontend/e2e/**` fuera de `tsc -b` | Un error de tipos en los E2E no se detecta en la comprobación estática | Documentado en `docs/activity-editor.md`; Playwright lo detecta al ejecutar |
| `main` está 11 commits por delante de `origin/main` | El trabajo no está respaldado en remoto | Falta `git push` (decisión del usuario) |
| `last write wins` entre pestañas | Dos pestañas pueden sobrescribirse sin aviso | Aceptado explícitamente en §5.7 y §12; sin ETag en el MVP |
| Duraciones heredadas desconocidas | Clases antiguas no se pueden guardar sin completarlas | Comportamiento especificado en §5.8; se muestran como «Duración incompleta» |
| El total manual de fase 1 se pierde en la migración | Irreversible al hacer rollback | Advertido en §5.8 y §6.2: **requiere respaldo antes de migrar datos reales** |
| Lista de actividades sin paginación | Clases con muchas actividades cargan todas | Aceptado en §13; virtualización pospuesta |
| Reordenar y guardar en una clase muy grande | Coste de la doble pasada de orden | Dentro de la misma transacción; aceptable en el MVP |

---

## 9. Confirmación final

**Sí: `main` queda listo para continuar el desarrollo.**

- Los 31 criterios de aceptación de `specs/02-editor-de-actividades-mvp.md` están cumplidos.
- El único defecto encontrado era del propio test E2E y está corregido y verificado.
- La integración se completó sin conflictos y el historial quedó limpio y coherente.
- La compilación, las tres suites de tests y las comprobaciones de tipado y lint pasan sobre `main`.
- No se introdujo ninguna regresión.

Acción recomendada a continuación: `git push` de `main` a `origin/main` para respaldar la integración,
y marcar la spec como implementada.
