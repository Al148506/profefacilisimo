# SPEC 02 — Editor de actividades (MVP simplificado)

> **Estado:** Aprobado
> **Depende de:** SPEC 01 — Gestión de clases.
> **Sustituye a:** `specs/02-editor-de-actividades.md` (versión detallada, conservada como referencia de las funcionalidades pospuestas).
> **Fecha:** 2026-09-23
> **Objetivo:** Permitir crear, editar, eliminar y reordenar las actividades de una clase y guardarlas junto a sus metadatos en una sola operación.

---

## 1. Objetivo

Completar el flujo principal del producto con el mínimo de piezas posible:

```text
Login → Mis clases → Abrir una clase → Crear actividades → Editar actividades
      → Eliminar actividades → Reordenar actividades → Guardar → Recargar y verificar
```

La meta de esta especificación es validar ese flujo con profesores reales lo antes posible.
Todo lo que no sea imprescindible para recorrerlo se traslada a la sección 4 (funcionalidades pospuestas).
No se introducen tecnologías nuevas, ni capas nuevas, ni patrones nuevos.
Se conservan .NET 9, las cuatro capas (Domain / Application / Infrastructure / Api), PostgreSQL con JSONB, React + TypeScript + Vite, TanStack Query, React Hook Form y Zod.

**Diferencia de fondo con el borrador anterior:** aquella versión añadía intervalos entre actividades y concurrencia optimista (ETag / If-Match).
Ninguna de las dos cosas hace falta para recorrer el flujo de arriba, y ambas multiplicaban las reglas, los casos límite y la migración.
Aquí se retiran al MVP y quedan documentadas como trabajo futuro.

---

## 2. Alcance del MVP

**Incluye:**

- Crear, editar y eliminar actividades de los cuatro tipos existentes (Speaking, Reading, Writing, VocabularyGrammar).
- Formularios específicos por tipo, con texto plano y listas de preguntas o ejercicios.
- Cambiar el tipo de una actividad antes de guardar, descartando su contenido específico.
- Reordenar actividades con botones Subir / Bajar, accesibles por teclado.
- Duración obligatoria por actividad, en minutos enteros positivos.
- Duración total de la clase calculada por el servidor a partir de sus actividades.
- Guardado único y atómico de metadatos, actividades, orden y total.
- Conservación del borrador local ante errores de validación o de red.
- Compatibilidad con datos heredados sin duración (se muestran como incompletos y deben completarse para guardar).
- Duplicación, papelera y restauración de SPEC 01 siguen funcionando con las nuevas reglas, sin cambiar su comportamiento.

**Fuera del alcance (para versiones posteriores):**

- Lesson Player, IA, contenido multimedia, ejercicios interactivos y respuestas de estudiantes.
- Tiempos de transición entre actividades.
- Arrastrar y soltar.
- Concurrencia optimista, versiones y resolución de conflictos.
- Autoguardado, historial, undo/redo, colaboración y offline.
- Plantillas, bibliotecas de actividades y duplicación individual.
- Importación, exportación, analíticas y telemetría.
- Tipos de actividad distintos de los cuatro existentes.

---

## 3. Funcionalidades incluidas

### 3.1 Gestión de actividades en el editor

- Se reutilizan las rutas `/lessons/new` y `/lessons/:id/edit`; no se crea otro editor ni otro dashboard.
- Los metadatos siguen exigiendo título, nivel, tema y objetivo (reglas de SPEC 01 sin cambios).
- La clase puede permanecer sin actividades.
- El editor muestra la lista ordenada y permite seleccionar una actividad para editarla.
- Cambiar de selección conserva los valores locales de las demás actividades.
- «Agregar actividad» pide el tipo y añade un formulario vacío al final de la lista.
- La actividad nueva no recibe una duración inventada: el campo queda vacío hasta que el profesor lo complete.
- Quitar una actividad solo modifica el borrador local; Guardar confirma la eliminación en el servidor.
- Salir descartando cambios conserva las actividades persistidas.
- Añadir, editar, cambiar tipo, quitar y reordenar no envían ninguna solicitud de escritura.
- El orden del formulario es el orden que se guardará.

### 3.2 Contenido por tipo

Todos los tipos incluyen título, instrucciones y duración.
Los campos específicos y sus reglas se detallan en la sección 5.

- Se pueden añadir y quitar filas de preguntas o ejercicios.
- El texto se representa como texto, nunca como HTML ejecutable.
- No se acepta JSON libre introducido por el profesor.
- La columna `Type` es el discriminador autoritativo; un `type` redundante dentro del JSON antiguo no puede contradecirla.

### 3.3 Cambio de tipo

- Cambiar de tipo pide confirmación cuando hay contenido específico que descartar.
- Cancelar deja intactos el tipo y todos los campos.
- Confirmar conserva Id, título, instrucciones y duración, y vacía solo el contenido específico.
- Nada se persiste al confirmar el diálogo: el contenido anterior sigue en el servidor hasta que Guardar tenga éxito.

### 3.4 Reordenar

- Botones Subir / Bajar por actividad; Subir está deshabilitado en la primera y Bajar en la última.
- Los botones funcionan con teclado y sin ratón.
- Cada actividad conserva su identidad y su contenido al moverse.
- Reordenar recalcula el total en pantalla, pero no escribe en PostgreSQL.

### 3.5 Duración y total

- Cada actividad tiene una duración en minutos, entero mayor que cero, obligatoria al guardar.
- El total de la clase se muestra en el editor, en el detalle y en el listado.
- Una clase sin actividades muestra 0.
- Si alguna actividad no tiene duración, se muestra «Duración incompleta» y no se presenta una suma parcial como si fuera un total completo.
- No existe un campo editable de duración total.
- El servidor vuelve a calcular el total; no confía en el cálculo del navegador.

### 3.6 Guardado y errores

- Un único botón Guardar persiste metadatos, todas las actividades y su orden.
- Guardar valida el conjunto completo antes de escribir: una actividad inválida impide guardar toda la clase.
- Cada actividad con errores queda identificada en la lista aunque no esté seleccionada.
- Los errores de guardado conservan el borrador local.
- No se muestran mensajes de éxito antes de la confirmación del servidor.
- Tras el éxito se reemplazan las claves locales por los Id retornados y solo entonces se limpia el indicador de cambios pendientes.
- Se actualizan las consultas de TanStack Query de listado y detalle sin borrar el formulario ante un refetch.
- No se reintentan automáticamente escrituras cuyo resultado de red es incierto.

### 3.7 Interfaz

- Se conservan los componentes y el estilo visual existentes.
- El listado y el editor son utilizables en pantalla estrecha.
- Estados: Loading, Error, Empty, Success y Saving, como en SPEC 01.

---

## 4. Funcionalidades pospuestas para futuras versiones

Ninguna de estas funcionalidades se implementa ahora.
Cada una, si llega, va en su propia especificación o en una revisión posterior de esta.

**Editor avanzado**

- Arrastrar y soltar para reordenar (puntero y táctil). Los botones Subir / Bajar cubren el flujo de éxito y son accesibles.
- Cambio de tipo conservando el contenido compatible entre tipos.
- Duplicación individual de una actividad.
- Papelera individual de actividades.
- Tiempos de preparación antes de la primera actividad o cierre después de la última.

**Tiempos**

- `TransitionAfterMinutes`: tiempo adicional independiente después de cada actividad.
- Regla de «la última transición se conserva pero no se suma» y su reincorporación al total al cambiar de posición.

**Borradores y recuperación**

- Autoguardado.
- Recuperación automática de borradores.
- Persistencia del borrador en `localStorage`.
- Aviso de descarte ampliado a todos los mecanismos de navegación.

**Historial y colaboración**

- Historial de versiones.
- Undo / Redo.
- Colaboración en tiempo real entre pestañas o usuarios.
- Comentarios o revisión sobre una actividad.

**Concurrencia**

- `Lesson.Version`, ETag, `If-Match`, 412 y 428.
- Detección y resolución de conflictos entre pestañas.
- Fusión automática o sobrescritura forzada.
- Prueba de dos contextos simultáneos.

**Contenido y bibliotecas**

- Biblioteca compartida de actividades.
- Plantillas avanzadas de clase.
- Importación y exportación (PDF, DOCX, JSON).
- Texto enriquecido, Markdown interpretado, HTML o archivos multimedia.
- Generación o corrección mediante IA.

**Producto y operación**

- Analíticas de uso.
- Telemetría específica de eventos del editor.
- Configuración avanzada de interfaz (temas, atajos, densidad, preferencias por usuario).
- Offline / PWA.
- Paginación, virtualización o carga diferida de listas largas de actividades.
- Optimizaciones prematuras de consultas, caché o índices.

**Registro histórico:** el borrador `specs/02-editor-de-actividades.md` contiene el diseño detallado de los tiempos de transición y del protocolo ETag.
Se conserva como referencia para cuando se retomen.

---

## 5. Reglas de negocio

### 5.1 Seguridad e integridad de acceso

- Todas las operaciones requieren JWT; el profesor se obtiene del claim `sub` validado.
- El cliente nunca envía ni puede seleccionar `UserId`, `LessonId` ni `Order`.
- Cada lectura y escritura verifica el propietario en el servidor.
- Una clase ajena, inexistente o en papelera devuelve 404 sin revelar su contenido.
- El borrado definitivo, la duplicación y la papelera conservan las reglas de SPEC 01.

### 5.2 Metadatos

Sin cambios respecto a SPEC 01: título y tema obligatorios de máximo 200 caracteres, objetivo obligatorio de máximo 2000, nivel A2, B1 o B2.
Los textos se recortan y no pueden quedar vacíos.

### 5.3 Contenido por tipo

| Tipo | Campos específicos | Reglas |
| --- | --- | --- |
| Speaking | `questionsList` | De 1 a 50 preguntas no vacías, máximo 2000 caracteres cada una |
| Reading | `text`, `questionsList` | Texto no vacío de hasta 20000 caracteres; de 1 a 50 preguntas de hasta 2000 |
| Writing | `prompt` | Consigna no vacía de hasta 5000 caracteres |
| VocabularyGrammar | `explanation`, `exercises` | Explicación no vacía de hasta 10000 caracteres; de 1 a 50 ejercicios de hasta 2000 |

- El título de la actividad admite 200 caracteres.
- Las instrucciones son obligatorias y admiten 2000 caracteres.
- El servidor valida el contenido según `Type` y rechaza combinaciones incompatibles.
- Se conserva el formato de contenido de fase 1 para no invalidar el JSONB existente.
- Las mismas reglas se aplican en Zod y en el dominio; el servidor es autoritativo.

### 5.4 Duración y total

- `Activity.EstimatedDuration` es un entero mayor que cero y es obligatorio en toda escritura del editor.
- `Lesson.EstimatedDuration` se reutiliza como total calculado persistido:
  - `0` para una clase sin actividades.
  - suma de las duraciones de todas las actividades cuando están completas.
  - `null` mientras alguna actividad heredada carezca de duración.
- Una clase nueva nace con total `0`, no con `null`: `null` queda reservado a datos heredados incompletos.
- El total se recalcula en la misma transacción de cada guardado.
- El total no depende del orden: sin intervalos entre actividades, reordenar no cambia la suma.
- La suma usa aritmética comprobada y rechaza el desbordamiento en lugar de truncarlo.
- Los valores se validan en cliente y en servidor.

**Ejemplo verificable:** A dura 10 minutos, B dura 15 y C dura 5.
En cualquier orden el total es 30.
Quitar A deja 20.
Una clase sin actividades da 0.
Si a B le falta la duración, el resultado es «Duración incompleta».

### 5.5 Orden

- El orden del array enviado es el orden solicitado.
- El servidor asigna `Order` consecutivo desde cero según el array recibido.
- Los Id existentes se conservan; no se regeneran para simplificar el orden.
- El índice único `(LessonId, Order)` se mantiene.
- Como ese índice no admite colisiones ni transitorias, el orden se aplica en dos pasos dentro de la misma transacción:
  1. Las actividades persistidas pasan a posiciones temporales por encima del mayor valor entre el número de filas existentes y el número de posiciones finales.
  2. Se aplican eliminaciones, inserciones y las posiciones finales consecutivas.
- Ninguna lectura externa puede observar las posiciones temporales; si algo falla, se revierte todo.

### 5.6 Guardado conjunto, identidad y borrado

- Un solo `SaveLessonRequest` transporta metadatos y `activities`.
- `POST /api/lessons` admite `activities` vacío o ausente: crea una clase sin actividades.
- `PUT /api/lessons/{id}` exige el array completo: la ausencia de `activities` devuelve 400 y nunca se interpreta como borrado total.
- Un array vacío es una petición válida y elimina todas las actividades de la clase.
- Una actividad sin Id es nueva; el servidor genera su Id.
- El Id de una actividad existente debe pertenecer a esa misma clase y a ese mismo usuario.
- Un Id repetido, ajeno o desconocido no se interpreta como actividad nueva: rechaza todo el guardado.
- La omisión de una actividad existente en el array representa su eliminación.
- Los errores del conjunto devuelven 400 sin persistencia parcial.
- La transacción protege metadatos, inserciones, actualizaciones, eliminaciones, orden y total.

### 5.7 Concurrencia

- Se aplica `last write wins`, la misma decisión aprobada en SPEC 01.
- No se envían ni se validan ETag o `If-Match`; no existen 412 ni 428 en esta especificación.
- La interfaz no promete detección de conflictos entre pestañas.
- Una renovación de sesión fallida no provoca reenvíos infinitos.

### 5.8 Datos heredados

- `Activity.EstimatedDuration` sigue siendo nullable en la base de datos solo para preservar datos anteriores.
- Leer, listar, duplicar, enviar a papelera, restaurar y eliminar definitivamente no exigen duración.
- Guardar desde el editor exige completar todas las duraciones de esa clase.
- No se asigna ninguna duración ficticia a los datos heredados.
- El antiguo total manual de fase 1 se pierde de forma deliberada al pasar a duración calculada; se requiere respaldo antes de migrar datos reales.

### 5.9 Errores HTTP

- 400: validación de metadatos, del conjunto de actividades o del contenido por tipo.
- 401: usuario no autenticado.
- 404: clase inexistente, ajena o en papelera.
- 409: transición de estado inválida de una clase propia (regla de SPEC 01).
- Se usan `ProblemDetails` y `ValidationProblemDetails`.
- No se usan 412 ni 428.

---

## 6. Modelo de datos

### 6.1 Entidades

**No se añaden columnas ni tablas.**

- `Activity.EstimatedDuration` (`int?`) ya existe; permanece nullable únicamente por datos heredados y se exige positivo en toda escritura.
- `Lesson.EstimatedDuration` (`int?`) ya existe y pasa a ser el total calculado persistido.
- El índice único `(LessonId, Order)` y el resto de restricciones se conservan.
- No se introduce un tipo de actividad «Pausa» ni una tabla de intervalos.

Métodos de dominio que se añaden:

- `Activity`: actualización de título, instrucciones, contenido y duración conservando `Id` y `LessonId`.
- `Lesson`: aplicación del conjunto de actividades (validar identidad, eliminar ausentes, asignar orden consecutivo) y cálculo del total.

### 6.2 Migración `AddCalculatedLessonDuration`

Es la única migración de esta especificación y hace dos cosas:

1. Modificar `CK_Lesson_Duration` para admitir `0`, manteniendo `null` y rechazando negativos.
2. Recalcular el total de cada clase a partir de sus actividades: suma si todas tienen duración, `0` si no tiene actividades y `null` si alguna actividad tiene duración nula.

Además:

- Se recalcula también el total de las clases en papelera, para que restaurarlas no cambie las reglas.
- No se reparte una duración manual antigua entre las actividades.
- No se eliminan ni alteran títulos, JSONB, propietarios, Id ni índices existentes.
- El rollback no recupera las estimaciones manuales antiguas.
- Se prueba sobre una base con clases vacías, completas e incompletas.

### 6.3 Contratos

```csharp
public record SaveLessonRequest(string Title, string Level, string Topic, string Objective,
    IReadOnlyList<LessonActivityInput>? Activities);

public record LessonActivityInput(Guid? Id, string Type, string Title, string Instructions,
    int EstimatedDuration, JsonElement Content);
```

- `LessonListItemDto` añade `EstimatedDuration`; `null` se representa como «Duración incompleta».
- `LessonActivityDto` ya expone `EstimatedDuration` y `Order`; se mantiene su forma.
- `LessonDetailsDto` devuelve el conjunto ordenado y el total calculado.
- `Content` conserva su formato actual y nunca se interpreta como HTML ejecutable.
- `UserId`, `LessonId` y `Order` no se aceptan como valores autoritativos del cliente.

```typescript
type LessonActivityInput = {
  id: string | null;
  type: 'Speaking' | 'Reading' | 'Writing' | 'VocabularyGrammar';
  title: string;
  instructions: string;
  estimatedDuration: number;
  content: SpeakingContent | ReadingContent | WritingContent | VocabularyGrammarContent;
};
```

- El esquema Zod usa una unión discriminada por `type`.
- Las claves de error permiten identificar el campo exacto, por ejemplo `activities[2].content.text`.
- El borrador React usa una clave local estable separada de `id`, porque una actividad nueva todavía no tiene Id.

---

## 7. API necesaria

No se crean endpoints nuevos y no hay endpoints de guardado por actividad.

| Método y ruta | Cambio respecto a SPEC 01 | Éxito |
| --- | --- | --- |
| GET `/api/lessons` | Añade `estimatedDuration` a cada elemento | 200 + array |
| GET `/api/lessons/{id}` | Sin cambio de forma; devuelve actividades y total calculado | 200 + detalle |
| POST `/api/lessons` | Acepta `activities` (vacío o ausente) | 201 + detalle y Location |
| PUT `/api/lessons/{id}` | Exige `activities` con el conjunto completo | 200 + detalle |
| POST `/api/lessons/{id}/duplicate` | Sin cambios; copia actividades, orden y duraciones | 201 + detalle |
| POST `/api/lessons/{id}/trash` | Sin cambios | 204 |
| POST `/api/lessons/{id}/restore` | Sin cambios | 204 |
| DELETE `/api/lessons/{id}` | Sin cambios | 204 |

- La respuesta exitosa de POST y PUT incluye las actividades canónicas con sus Id definitivos.
- `backend/Api/LessonEndpoints.cs` no requiere cambios previstos: los contratos viajan por el binding existente y la validación del conjunto vive en `LessonService`.
- La validación del contenido por tipo y la del conjunto se resuelven en la capa de servicio antes de escribir.

---

## 8. Pantallas frontend

| Ruta | Pantalla | Cambio |
| --- | --- | --- |
| `/` | Mis clases | Muestra el total de cada clase o «Duración incompleta» |
| `/lessons/new` | Crear clase | Añade lista de actividades, formulario por tipo, reordenar y total |
| `/lessons/:id/edit` | Editar clase | Igual que crear, cargando las actividades persistidas |
| `/lessons/trash` | Papelera | Sin cambios |

- El editor se organiza en dos bloques: metadatos (formulario actual) y actividades (lista + formulario del tipo seleccionado + total).
- El total se recalcula en pantalla al editar duraciones, añadir, quitar o reordenar.
- Las actividades con errores se marcan en la lista aunque no estén seleccionadas.
- El aviso de cambios pendientes de SPEC 01 se extiende al borrador de actividades.
- Sin arrastrar y soltar: solo botones Subir / Bajar.
- En pantalla estrecha la lista y el formulario se apilan y siguen siendo utilizables.

---

## 9. Archivos a crear o modificar

**Modificar:**

- `backend/Domain/Activity.cs` — edición conservando Id, duración obligatoria al escribir.
- `backend/Domain/Lesson.cs` — aplicar el conjunto, validar identidad y orden, calcular el total.
- `backend/Application/Lessons/LessonDtos.cs` — `activities` en la petición y total en el listado.
- `backend/Infrastructure/LessonService.cs` — validación del conjunto, transacción, orden en dos pasos y total.
- `backend/Infrastructure/LessonReader.cs` — total y duración por actividad en las proyecciones.
- `backend/Infrastructure/AppDbContext.cs` — `CK_Lesson_Duration` admite cero.
- `backend/Infrastructure/Migrations/AppDbContextModelSnapshot.cs`.
- `frontend/src/lessons/lesson-api.ts` — transporte del conjunto completo y tipos.
- `frontend/src/lessons/lesson-schema.ts` — unión por tipo y validación del borrador.
- `frontend/src/lessons/LessonEditorPage.tsx` — integración de lista, formularios, orden y guardado.
- `frontend/src/lessons/LessonsPage.tsx` — total o «Duración incompleta».
- `frontend/src/styles.css` — estilos de la lista de actividades y estados.
- `frontend/src/lessons/LessonEditorPage.test.tsx` — cobertura del flujo ampliado.
- `tests/Domain.Tests/LessonTests.cs` — reglas del conjunto y del total.
- `tests/Integration.Tests/LessonManagementTests.cs` — guardado con actividades.
- `README.md` — enlace a la guía de uso del editor.

**Crear:**

- `backend/Infrastructure/Migrations/<timestamp>_AddCalculatedLessonDuration.cs` y su `.Designer.cs`.
- `frontend/src/lessons/ActivityList.tsx`.
- `frontend/src/lessons/ActivityForm.tsx`.
- `frontend/src/lessons/lesson-duration.ts`.
- `frontend/src/lessons/ActivityList.test.tsx`.
- `frontend/src/lessons/ActivityForm.test.tsx`.
- `frontend/src/lessons/lesson-duration.test.ts`.
- `tests/Domain.Tests/ActivityEditingTests.cs`.
- `tests/Integration.Tests/LessonEditorTests.cs`.
- `frontend/e2e/lesson-builder.spec.ts`.
- `docs/activity-editor.md` — guía de uso y límites, en el formato de `docs/class-management.md`.

**Sin cambios previstos:** `backend/Api/LessonEndpoints.cs`, `backend/Application/Lessons/ILessonService.cs`, `backend/Infrastructure/AuthService.cs`, `frontend/src/App.tsx`.

No se añaden dependencias. En particular no se incorpora ninguna biblioteca de drag-and-drop.

---

## 10. Plan de implementación

Diez etapas. Cada una deja el proyecto compilando, se puede probar por separado y acerca directamente al flujo principal.

| Etapa | Entrega | Verificación |
| --- | --- | --- |
| 1 | Dominio: edición de una actividad conservando Id y `LessonId`, con duración entera positiva obligatoria al escribir | `ActivityEditingTests`: Id estable tras editar, duración 0, negativa o fraccionaria rechazada, contenido validado por tipo |
| 2 | Dominio: `Lesson` aplica un conjunto de actividades, valida identidad, asigna orden consecutivo y calcula el total. Una clase nueva nace con total 0 | `LessonTests`: total 0 / 30 / incompleto, orden 0..n-1, Id ajeno o repetido rechazado, orden independiente del total |
| 3 | Migración `AddCalculatedLessonDuration`: la restricción admite 0 y se rellenan los totales existentes | Prueba de migración con clases vacías, completas e incompletas; la API actual sigue respondiendo igual |
| 4 | Lectura: DTOs y proyecciones con el total; «Mis clases» muestra el total o «Duración incompleta» | Integración de listado y detalle; `LessonsPage.test.tsx` con ambos textos |
| 5 | Escritura: POST y PUT guardan el conjunto en una transacción, con orden en dos pasos y total recalculado. Incluye que `lesson-api.ts` reenvíe las actividades cargadas sin cambios | `LessonEditorTests`: guardado conjunto, Id ajeno o repetido → 400, `activities` ausente en PUT → 400, array vacío, intercambio de posiciones sin violar el índice único, fallo a mitad sin cambios |
| 6 | Frontend: modelo local del editor, esquema Zod por tipo y cálculo puro de duración | `lesson-duration.test.ts` con los mismos casos que el dominio; validación de los cuatro tipos |
| 7 | Frontend: `ActivityList` con selección, alta y baja local, y marcado de actividades con error | `ActivityList.test.tsx`: cambiar de selección no pierde cambios locales; extremos de la lista |
| 8 | Frontend: `ActivityForm` con los cuatro formularios, filas de preguntas o ejercicios y duración por actividad | `ActivityForm.test.tsx`: campos por tipo, añadir y quitar filas, duración obligatoria, cambio de tipo con confirmación |
| 9 | Frontend: reordenar con Subir / Bajar y total recalculado en vivo | Extremos deshabilitados, orden por teclado, total actualizado al mover, añadir o quitar |
| 10 | Frontend: Guardar el conjunto, aplicar los Id retornados, errores por actividad, cierre del flujo y documentación | E2E `login → abrir clase → crear → editar → eliminar → reordenar → guardar → recargar`; `docs/activity-editor.md` |

- Cada etapa incorpora las pruebas focalizadas de la regla o el componente que conecta.
- Las migraciones generadas se mantienen íntegras.
- Las pruebas de integración siguen usando PostgreSQL real con bases aisladas, no EF InMemory.

---

## 11. Criterios de aceptación

**Flujo principal**

- [ ] Se completa `login → abrir una clase → crear actividades → editar → eliminar → reordenar → guardar`.
- [ ] Recargar tras guardar reproduce exactamente el estado guardado.

**Contenido**

- [ ] Se puede crear, editar y quitar una actividad de cada uno de los cuatro tipos.
- [ ] Cambiar de selección conserva el borrador local de las demás actividades.
- [ ] El texto HTML introducido se muestra como texto y nunca se ejecuta.
- [ ] El servidor rechaza contenido incompatible con el tipo.
- [ ] Cancelar el cambio de tipo conserva todos los valores; confirmarlo vacía solo el contenido específico.
- [ ] Una actividad inválida impide guardar toda la clase e identifica la actividad y el campo afectados.
- [ ] El borrador local permanece disponible tras un error de validación o de red.

**Duración**

- [ ] Una clase sin actividades muestra y persiste total 0.
- [ ] Guardar una actividad sin duración, con 0, negativa o fraccionaria se rechaza.
- [ ] El ejemplo 10 + 15 + 5 da 30 en cualquier orden, y 20 tras quitar la de 10.
- [ ] Reordenar no cambia el total.
- [ ] Las actividades heredadas sin duración muestran «Duración incompleta».
- [ ] Guardar una clase heredada exige completar todas sus duraciones.
- [ ] El total persistido coincide con el cálculo del servidor.

**Orden y persistencia**

- [ ] Subir y Bajar funcionan con teclado y están deshabilitados en los extremos.
- [ ] Cada actividad conserva Id, contenido y duración al moverse.
- [ ] Editar, quitar o reordenar localmente no produce ninguna escritura antes de Guardar.
- [ ] Guardar persiste metadatos, contenido, orden, eliminaciones y total conjuntamente.
- [ ] Un Id ajeno, repetido o desconocido rechaza todo el guardado con 400.
- [ ] Omitir `activities` en PUT devuelve 400 y no elimina actividades existentes.
- [ ] Guardar un array vacío elimina las actividades y deja total 0.
- [ ] Intercambiar dos actividades no viola el índice único de orden.
- [ ] Un fallo a mitad de la transacción deja intactas actividades, metadatos y total.
- [ ] Duplicar y restaurar conservan actividades, orden y duraciones.

**Alcance**

- [ ] No existen endpoints de guardado por actividad.
- [ ] No se envía ni se valida ETag o `If-Match`, y no se devuelven 412 ni 428.
- [ ] No hay arrastrar y soltar, autoguardado, historial ni recuperación de borradores.
- [ ] No hay campos de transición entre actividades.
- [ ] Registro, login, refresh, logout, papelera y duplicación de SPEC 01 siguen funcionando.

**Comprobaciones ejecutables al implementar**

- `dotnet restore` y `dotnet build Profefacilisimo.slnx` desde la raíz.
- `./scripts/Test.ps1` con los casos de conjunto, total y transacción añadidos.
- `./scripts/Test-E2E.ps1` con el flujo del editor.
- Revisión manual de teclado para reordenar.

---

## 12. Decisiones clave y contradicciones resueltas

- **ETag / `If-Match` / 412 / 428: retirados.** SPEC 01 aprobó `last write wins` y dejó anotado que SPEC 02 seguía presuponiendo versiones por inercia. Esta versión lo corrige y alinea ambas especificaciones.
- **Tiempos de transición: pospuestos**, aunque figuraban como confirmados en el borrador anterior. No son necesarios para el flujo de éxito y aportaban un campo, una migración, la regla de «la última no cuenta» y varios casos límite. Añadirlos después es aditivo: una columna nullable y un recálculo.
- **Arrastrar y soltar: pospuesto.** Los botones Subir / Bajar cumplen el criterio de éxito, funcionan con teclado y no requieren dependencias nuevas.
- **Total persistido en lugar de calculado en lectura.** Reutilizar `Lesson.EstimatedDuration` evita agregados en el listado y no exige columnas nuevas.
- **Sin columnas ni tablas nuevas.** La única migración ajusta una restricción y rellena totales, lo que reduce el riesgo de la puesta en producción.
- **Guardado conjunto: se mantiene.** Es lo que hace posible el botón único y el borrador local, y ya encaja con el patrón de SPEC 01.
- **Cambio de tipo: se mantiene, simplificado.** Confirmación nativa y descarte del contenido específico, sin persistir nada hasta Guardar.
- **Duplicación y papelera: sin cambios de comportamiento.** Ya copian actividades y conservan duraciones; solo se verifica que el total siga siendo coherente.

---

## 13. Riesgos principales

| Riesgo | Tratamiento en el MVP |
| --- | --- |
| Colisión del índice único `(LessonId, Order)` al reordenar | Posiciones temporales aplicadas en dos pasos dentro de la misma transacción |
| Pérdida de cambios por guardado parcial | Validación previa del conjunto completo y una sola transacción |
| Dos pestañas guardando la misma clase | `last write wins` documentado y visible; sin versiones en el MVP |
| Duraciones heredadas desconocidas | Se conservan como `null`, se muestran como incompletas y se exigen al guardar |
| Total manual antiguo sin correspondencia con actividades | Se recalcula sin inventar tiempos; respaldo antes de migrar datos reales |
| Actividad larga con muchas preguntas o ejercicios | Aceptable en el MVP; la virtualización queda pospuesta |
| Clase con muchas actividades en una sola pantalla | Se acepta la lista completa; la paginación queda pospuesta |
| Cambio de tipo que descarta trabajo | Confirmación explícita y persistencia solo tras Guardar |

---

## 14. Qué NO se hará en esta especificación

- No habrá Lesson Player, IA, contenido multimedia ni ejercicios interactivos.
- No habrá tiempos de transición entre actividades ni campos de preparación o cierre.
- No habrá arrastrar y soltar.
- No habrá autoguardado, historial de versiones, undo/redo, colaboración ni offline.
- No habrá recuperación de borradores ni persistencia local del borrador.
- No habrá papelera ni duplicación individual de actividades.
- No habrá bibliotecas compartidas, plantillas avanzadas ni importación/exportación.
- No habrá analíticas ni telemetría específica.
- No habrá versiones, ETag, `If-Match`, 412 ni 428.
- No se cambiarán autenticación, framework, arquitectura ni dependencias.

Cada uno de esos puntos, si llega, va en su propia especificación.
