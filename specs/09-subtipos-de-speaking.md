# SPEC 09 — Subtipos de Speaking: Roleplay, Conversation y Presentation

> **Estado:** Aprobado
> **Depende de:** SPEC 02 — Editor de actividades; SPEC 03 — Reproductor de clases
> **Fecha:** 2026-10-19
> **Objetivo:** Permitir que una actividad Speaking elija subtipo (Roleplay, Conversation o Presentation) con sus propios campos y validaciones, guardando todo dentro del JSON de contenido existente sin migraciones ni cambios en DTOs, endpoints ni reproductor de clases.

---

## 1. Por qué esta spec existe

Hoy Speaking solo admite una lista de 1–50 preguntas (`SpeakingContent(QuestionsList)`). Para diseñar un roleplay o una exposición el profesor tiene que falsear el formato o crear preguntas sueltas. La arquitectura ya lo pone fácil: `Content` viaja como `JsonElement` opaco en los DTOs y se persiste en una columna `jsonb` sin check de forma, así que el subtipo puede vivir **dentro del contenido** sin tocar contrato HTTP, base de datos ni endpoints.

---

## 2. Alcance

**Incluye:**

- Subtipo dentro del contenido de Speaking: `conversation` | `roleplay` | `presentation`. Las actividades Speaking existentes (sin `subtype` en su JSON) se interpretan como `conversation` y conservan comportamiento y datos.
- **Conversation:** el flujo actual de preguntas (1–50, ≤2000 chars) más reordenar (botones ↑/↓ en el componente `Rows`, disponible también en los otros editores de lista).
- **Roleplay:** contexto (obligatorio), roles 2–6 `{ nombre ≤100, descripción ≤500 opcional }` (obligatorio), objetivo comunicativo (≤2000, opcional), material de apoyo (≤5000, opcional), guion como **texto continuo** en un textarea (≤10000, opcional) y modo de práctica (`scripted`/`guided`/`free`, obligatorio, con validación cruzada: `scripted` exige guion no vacío).
- **Presentation:** contexto/tema (obligatorio, ≤2000) y puntos de apoyo opcionales (lista 0–20, cada uno ≤500). Instrucciones y duración reutilizan los campos compartidos de actividad (obligatorios como hoy).
- Backend: nuevos enums y registro `SpeakingRole`, ramificación de `Validate()` por subtipo en `backend/Domain/Activity.cs`, y `JsonStringEnumConverter` en `ContentJson.Options`. Sin cambios en `LessonService`, DTOs, endpoints, `AppDbContext` ni migraciones.
- Frontend: unión por subtipo en `lesson-schema.ts`, selector de subtipo y campos condicionales en `ActivityForm.tsx` con `window.confirm` al descartar contenido incompatible, renderizado por subtipo en `ActivityView.tsx` reutilizando las clases del contrato congelado, y etiqueta `Speaking · <subtipo>` en `ActivityList` y pantalla del reproductor.
- Pruebas actualizadas y nuevas en los patrones existentes (domain, integración, vitest).

**Fuera de alcance (para futuras specs):**

- Generación por IA de roleplays (SPEC 07 sigue sin implementar; esta spec deja el modelo preparado: un futuro schema por subtipo se derivaría directamente de `SpeakingContent`).
- Cronometraje, evaluación oral o rúbricas de Presentation.
- Nuevos `ActivityType` (Roleplay/Conversation/Presentation **no** son tipos de actividad).
- Nivel de inglés propio por actividad (el nivel lo da la clase, `LessonLevel` A2/B1/B2).
- Roles con turnos estructurados del guion, audio, o múltiples guiones por roleplay.
- Cambios en asignación de clases a estudiantes (SPEC 04) ni en el flujo de creación de clases.

---

## 3. Modelo de datos

### 3.1. Dominio (.NET) — `backend/Domain/Activity.cs`

```csharp
public enum SpeakingSubtype { Conversation, Roleplay, Presentation }   // Conversation = 0: valor por defecto para JSON legacy
public enum RoleplayPracticeMode { Scripted, Guided, Free }

public sealed record SpeakingRole(string Name, string? Description);

public sealed record SpeakingContent(
    IReadOnlyList<string>? QuestionsList = null,
    SpeakingSubtype Subtype = SpeakingSubtype.Conversation,
    string? Context = null,
    IReadOnlyList<SpeakingRole>? Roles = null,
    string? Objective = null,
    string? Material = null,
    string? Script = null,
    RoleplayPracticeMode? PracticeMode = null,
    IReadOnlyList<string>? TalkingPoints = null
) : ActivityContent
{
    public override ActivityType Type => ActivityType.Speaking;
    public override void Validate() { /* ramifica por Subtype, ver 3.2 */ }
}
```

- Los parámetros con valor por defecto mantienen compilables los call-sites existentes `new SpeakingContent([...])` y la deserialización de filas legacy (sin `subtype` → `Conversation`).
- `ContentJson.Options` añade `new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)`: enums como `"roleplay"`, `"scripted"`. No afecta a JSON existente (no tenía enums).
- `Activity.Update` / `CopyTo` / duplicación siguen funcionando sin cambios: serializan/deserializan el registro completo.

### 3.2. Reglas de validación por subtipo (dominio = única autoridad, backend y zod coinciden)

| Subtipo      | Obligatorio                                                                                                                                                           | Opcional                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Conversation | `questionsList` 1–50, cada una `Rules.Text(≤2000)` (regla actual intacta)                                                                                             | —                                                    |
| Roleplay     | `context` `Rules.Text(≤2000)`; `roles` 2–6, `name` `Rules.Text(≤100)`, `description` `Rules.Optional(≤500)`; `practiceMode` no nulo; si `scripted`, `script` no vacío | `objective` ≤2000, `material` ≤5000, `script` ≤10000 |
| Presentation | `context` `Rules.Text(≤2000)`                                                                                                                                         | `talkingPoints` 0–20, cada una ≤500                  |

Textos en blanco se normalizan a `null` vía `Rules.Optional`; un `SpeakingContent` de Conversation **no** exige campos de otros subtipos y viceversa (validación ramificada; los campos irrelevantes se normalizan a `null` al guardar).

### 3.3. Contrato JSON (persistencia y API, forma nueva del `content` de una Speaking)

```json
{
  "subtype": "roleplay",
  "context": "Cena en un restaurante",
  "roles": [
    { "name": "Waiter", "description": "El camarero toma el pedido" },
    { "name": "Customer", "description": null }
  ],
  "objective": "Pedir comida, preguntar precios y pedir la cuenta",
  "material": null,
  "script": "Waiter: Good evening! Are you ready to order?\nCustomer: Not yet...",
  "practiceMode": "scripted",
  "questionsList": null
}
```

Legacy sin cambios: `{ "questionsList": ["¿Qué tal?"] }` → Conversation. **No hay migración**: la columna ya es `jsonb` con check solo de `jsonb_typeof = 'object'`.

### 3.4. Frontend — `frontend/src/lessons/lesson-schema.ts`

```ts
export type SpeakingSubtype = "conversation" | "roleplay" | "presentation";
export type SpeakingRole = { name: string; description: string };
export type RoleplayContent = {
  subtype: "roleplay";
  context: string;
  roles: SpeakingRole[];
  objective: string;
  material: string;
  script: string;
  practiceMode: "scripted" | "guided" | "free";
};
export type ConversationContent = {
  subtype: "conversation";
  questionsList: string[];
};
export type PresentationContent = {
  subtype: "presentation";
  context: string;
  talkingPoints: string[];
};
export type SpeakingContent =
  | ConversationContent
  | RoleplayContent
  | PresentationContent;
```

- El brazo `Speaking` de `activityDraftSchema` pasa a un `z.discriminatedUnion('subtype', ...)` anidado con los límites de 3.2 (mensajes de error en español, mismo estilo que `questionsList`: «Añade al menos una pregunta.», «Mínimo 2 roles.», etc.; en `scripted` sin guion: «El modo «Con guion» requiere un guion.»).
- `applyType('Speaking')` → `{ subtype: 'conversation', questionsList: [''] }` (no cambia el comportamiento actual).
- `draftFromSaved`: si `content.subtype` no está o no es reconocido → `conversation`, leyendo `questionsList` como hoy.
- `hasSpecificContent`: define la condición de contenido **significativo** por subtipo — Conversation: al menos una pregunta con texto tras `trim()`; Roleplay: contexto, objetivo, material o guion no vacíos, o algún rol con nombre o descripción no vacíos (los dos roles iniciales en blanco no cuentan); Presentation: contexto no vacío o algún punto de apoyo con texto. Los valores iniciales del formulario (filas vacías, strings `''`) nunca cuentan como contenido.
- `toActivityInput`: serializa `subtype` en minúsculas y omite campos vacíos → `null`/`[]` según la tabla de 3.2, coherente con el backend.

---

## 4. UX

### 4.1. Editor (`ActivityForm.tsx`)

- Bajo el bloque Speaking, un selector «Tipo de práctica oral»: `Conversation` (por defecto) · `Roleplay` · `Presentation`, con estilos `<select>` existentes.
- Solo se renderizan los campos del subtipo activo:
  - **Conversation:** `Rows` de preguntas + botones ↑/↓ por fila (nuevo en `Rows`; también aparecen en Reading y VocabularyGrammar, cambio aditivo).
  - **Roleplay:** inputs Contexto, Objetivo comunicativo y Material de apoyo; dos filas de texto por rol (Nombre, Descripción) con «Añadir rol» (hasta 6) y «Eliminar» (mínimo 2, deshabilitado como hoy con la última pregunta); textarea «Guion de conversación» (placeholder con ejemplo `Waiter: ...`); radios «Modo de práctica» con su explicación visible bajo cada opción — **Con guion**: los alumnos siguen el diálogo preparado. **Guiado**: usan el contexto, los roles y las expresiones de apoyo para construir su diálogo. **Libre**: improvisan a partir de la situación y el objetivo. Regla de guardado: `Con guion` exige guion no vacío; `Guiado` y `Libre` lo admiten vacío.
  - **Presentation:** input Tema/contexto y `Rows` de puntos de apoyo («Punto N», permitiendo 0 filas — a diferencia de preguntas, se puede vaciar la lista).
- Cambiar de subtipo **solo pide `window.confirm` cuando `hasSpecificContent` es verdadero** para el subtipo actual (hay contenido significativo que se perdería). Con el formulario en valores iniciales (solo campos vacíos, roles iniciales en blanco, preguntas iniciales vacías) el cambio es silencioso y no genera advertencia. Mensaje: «Cambiar el tipo de práctica oral descarta el contenido específico incompatible. Se conservan el título, las instrucciones y la duración. ¿Quieres continuar?»; si el usuario cancela, se restauran el subtipo anterior y todos sus datos sin tocar nada. Misma mecánica que `changeType` actual.
- Validación inline por ruta zod (`content.context`, `content.roles.0.name`, …), igual que `content.questionsList.0`.

### 4.2. Reproductor y listas

- `ActivityView.tsx` (subtipo dentro del brazo `Speaking`):
  - **Conversation:** idéntico a hoy (`player-activity-instructions` + `player-activity-list`).
  - **Roleplay:** párrafos etiquetados «Situación» y «Objetivo» con `player-activity-text`; roles y puntos como `player-activity-list`; guion como `player-activity-text` preservando saltos de línea. Sin clases CSS nuevas (contrato congelado intacto).
  - **Presentation:** contexto como `player-activity-text` + `player-activity-list` de puntos.
- Lectura defensiva (`asText`/`asItems`) se extiende a los campos nuevos: formas desconocidas se ignoran, nunca se inventa contenido.
- `ActivityList` y `data-testid="player-activity-type"` muestran `Speaking · Conversation/Roleplay/Presentation`; otros tipos igual que hoy.
- Guardar/reabrir conserva todo (el borrador se construye desde `draftFromSaved`).

---

## 5. Plan de implementación

1. **Dominio:** enums, `SpeakingRole`, `SpeakingContent` con parámetros opcionales y `Validate()` ramificado; `JsonStringEnumConverter` en `ContentJson`. Actualizar/crear `tests/Domain.Tests/ActivityEditingTests.cs` (matriz por subtipo, límites exactos, `scripted` sin guion rechazado, legacy → Conversation). Gate: `dotnet test Profefacilisimo.slnx --filter FullyQualifiedName~Activity` + `~Lesson`.
2. **Integración:** casos en `tests/Integration.Tests/LessonEditorTests.cs`: crear clase con las tres formas, recargar y comparar JSON; rechazos `activities[i].content` (roles 1 o 7, contexto vacío, guion nulo en scripted); fila legacy sin `subtype` round-trips como Conversation. Gate: `dotnet test` completo (backend).
3. **Esquema frontend:** tipos, unión discriminada por subtipo, `applyType`/`hasSpecificContent`/`draftFromSaved`/`toActivityInput` en `lesson-schema.ts` + test de esquema (`lesson-schema.test.ts`). Gate: `npm --prefix frontend test -- src/lessons/lesson-schema.test.ts`.
4. **Editor:** selector de subtipo, campos condicionales, `RoleRows`, ↑/↓ en `Rows`, explicaciones bajo los radios de modo de práctica, confirm de cambio de subtipo solo con contenido significativo en `ActivityForm.tsx`; actualizar `ActivityForm.test.tsx` (cambio silencioso con valores iniciales, confirm con contenido y cancelación íntegra, texto explicativo de los modos) y `LessonEditorPage.test.tsx` (flujo Roleplay completo guardado → payload exacto).
5. **Reproductor y etiquetas:** brazos por subtipo en `ActivityView.tsx` + `ActivityView.test.tsx`; etiqueta `Speaking · <subtipo>` en `ActivityList.test.tsx` y `LessonPlayerPage.test.tsx`.
6. **Docs y gate final:** actualizar `docs/activity-editor.md` (tabla de campos Speaking); ejecutar `./scripts/Test.ps1` completo (dotnet test + eslint + tsc -b && vite build + vitest).

Cada paso deja el sistema funcional y es commiteable por separado.

---

## 6. Criterios de aceptación

- [ ] Se puede crear, guardar, reabrir y volver a guardar una actividad de cada subtipo conservando todos sus campos (roles, contexto, objetivo, material, guion, modo, puntos).
- [ ] Un guion de Roleplay de varias intervenciones se edita como texto continuo en un solo campo y se persiste/recupera íntegro (incluidos saltos de línea).
- [ ] Conversation permite agregar, editar, eliminar y **reordenar** preguntas; el orden reordenado persiste tras recargar.
- [ ] Presentation se guarda sin ninguna pregunta y sin puntos de apoyo; el backend no exige `questionsList` para ese subtipo.
- [ ] Roleplay rechaza guardar con <2 o >6 roles, sin contexto, sin modo de práctica, o en modo `scripted` sin guion — en frontend (inline) y backend (`400` con clave `activities[i].content`).
- [ ] Una actividad Speaking creada antes de esta spec se lista, abre, edita y reproduce sin cambios: se comporta como `conversation`.
- [ ] `GET /api/lessons/{id}` y `PUT` devuelven/reciben el contenido de Speaking con `subtype` en minúsculas y enums como strings; no aparece clave extra en otros tipos.
- [ ] Cambiar de subtipo con contenido significativo pide confirmación; cancelar conserva subtipo y todos los datos. Cambiar de subtipo con solo valores iniciales (campos vacíos, filas en blanco) no muestra ninguna advertencia y aplica el cambio directamente.
- [ ] Cada opción de «Modo de práctica» muestra su explicación en la UI (Con guion: seguir el diálogo preparado; Guiado: construir el diálogo con contexto, roles y expresiones de apoyo; Libre: improvisar), y solo `Con guion` exige guion no vacío al guardar.
- [ ] El reproductor muestra `Speaking · Roleplay` (etc.) y renderiza cada subtipo con las clases del contrato congelado (`player-activity-text` / `player-activity-list`); ningún `data-testid` existente cambia de semántica.
- [ ] Duplicar una clase copia los subtipos íntegros; asignar a estudiantes no altera el contenido (pruebas existentes siguen verdes).
- [ ] No existe ninguna migración nueva y `CK_Activity_Type` / `CK_Activity_Content` no cambian.
- [ ] `./scripts/Test.ps1` pasa completo (backend tests + eslint + build TS/Vite + vitest).

---

## 7. Decisiones

- **Sí:** subtipo como campo dentro del JSON de contenido (`subtype`). Cero migraciones, cero cambios de DTO/endpoint (el contenido ya es `JsonElement` opaco), y las filas legacy se leen como `Conversation` por default del enum. **No:** nuevos `ActivityType`. Obligaría a migrar `CK_Activity_Type`, tocar los 4 switches de tipo front/back y reescribir aserciones de la matriz de tipos existente.
- **Sí:** guion como texto continuo (`script` ≤10000). Es lo que pide la petición (no forzar una fila por intervención) y trivial para la futura IA: un schema de string de diálogos. **No:** turnos estructurados `{speaker,text}` como modelo principal (registrar cada intervención como fila es exactamente la fricción a eliminar).
- **Sí:** un único campo `context` compartido por los tres subtipos con etiquetas propias. **No:** `situation`/`topic`/`subject` duplicados (tres campos para un concepto).
- **Sí:** `practiceMode` obligatorio con validación cruzada `scripted ⇒ script`. **No:** inferir el modo del contenido (pierde la distinción guiado/libre).
- **Sí:** Presentation reutiliza `Instructions`/`EstimatedDuration` compartidos. **No:** duración sugerida propia ni hacer opcional la duración (regla actual de todos los tipos; cambiarla afecta al cálculo de totales de SPEC 01).
- **Sí:** sin nivel propio de actividad; el nivel de la clase es el contexto MCER (y lo que usará SPEC 07). **No:** duplicar el concepto por actividad.
- **Sí:** reordenar preguntas extendiendo el componente `Rows` (↑/↓). El reordenado queda disponible también en Reading/VocabularyGrammar como efecto aditivo y sin duplicar el editor de listas. **No:** un editor propio solo para Conversation (duplicaría el patrón).
- **Sí:** `window.confirm` al cambiar de subtipo **solo cuando `hasSpecificContent` detecta contenido significativo** (definido en 3.4/4.1). Mismo patrón que el cambio de tipo en SPEC 02; advertir con el formulario en blanco sería ruido. **No:** confirmar siempre (fricción innecesaria) ni descartar en silencio (pérdida de datos).
- **Sí:** explicación visible bajo cada radio de modo de práctica (Con guion / Guiado / Libre). El nombre solo no comunica el comportamiento esperado en clase; tres líneas de texto estático eliminan la ambigüedad sin añadir campos al modelo. **No:** tooltip u ayuda emergente (se pierde en cuanto dejas de pasar el ratón y no se imprime en materiales).
- **Sí:** renderizado del reproductor con las clases del contrato congelado. **No:** clases nuevas (`ActivityView.test.tsx` congela la lista actual; las clases guardadas no pueden romper).
- **Sí:** `JsonStringEnumConverter` con camelCase en `ContentJson`. Los enums como números en JSON ilegibles complican la futura generación IA y el debug; no hay JSON previo con enums.
- **No:** tocar SPEC 07 ni su contrato (`IActivityAutocomplete` sigue en borrador). Cuando se implemente, el request podrá llevar `subtype` y elegir schema; esta spec no lo necesita ni lo bloquea.

---

## 8. Riesgos

| Riesgo                                                                                                                          | Mitigación                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| El default `Conversation` depende del orden del enum (posición 0) para la compatibilidad legacy                                 | Test de dominio fija que `JsonSerializer` de `{}` → `Conversation`; comentario junto a la declaración del enum     |
| Normalizar campos de otros subtipos a `null` al guardar podría sorprender (p. ej. cambiar a Roleplay y volver pierde preguntas) | Confirm explícito antes de descartar (4.1); documentado en criterios de aceptación                                 |
| `Rows` compartido: los ↑/↓ afectan también a Reading/VocabularyGrammar                                                          | Cambio puramente aditivo; los tests existentes de esas listas no cambian de aserciones                             |
| El JSON de contenido crece (guion ≤10k, material ≤5k)                                                                           | Límites explícitos en dominio y zod; la columna es `jsonb` sin umbral actual; 50×2000 ya eran el orden de magnitud |
| Tratar con `content.subtype` ausente en datos futuros importados                                                                | `draftFromSaved` y el dominio normalizan a `conversation`; la validación server-side es la barrera                 |

## Lo que **no** va en esta spec

- Generación IA de roleplays/conversaciones/exposiciones (SPEC 07, sin implementar).
- Cronometraje o evaluación de la práctica oral.
- Subtipos como nuevos tipos de actividad de primer nivel.
- Nivel MCER por actividad.
- Turnos estructurados del guion, voces por personaje, audio.
- Migraciones, cambios de DTOs/endpoints/persistencia.
- Cambios en asignaciones a estudiantes.

Cada uno, si llega, va en su propia spec.
