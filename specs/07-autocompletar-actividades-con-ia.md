# SPEC 07 — Autocompletar actividades con IA

> **Estado:** Borrador
> **Depende de:** SPEC 02 — Editor de actividades; SPEC 05 — Botones con color e iconos
> **Fecha:** 2026-10-06
> **Objetivo:** Añadir un botón «Autocompletar con IA» en el editor de actividades que genere el contenido específico del tipo de actividad vía OpenRouter, con la API key solo en el backend y salida JSON estructurada, para que el profesor lo revise y modifique antes de guardar.

---

## 1. Por qué esta spec existe

Crear el contenido específico de cada actividad (preguntas, texto de lectura, consigna, explicación y ejercicios) es hoy la parte más laboriosa de armar una clase. Un asistente de IA lo reduce a una revisión: el profesor aporta el contexto de la clase y la IA propone un borrador que el editor recibe como valores editables normales. La IA nunca guarda nada; el guardado sigue siendo el flujo existente del editor.

## 2. Alcance

**Incluye:**

- Botón `Autocompletar con IA` (icono Lucide `Sparkles`, variante `warning`) dentro de `frontend/src/lessons/ActivityForm.tsx`, entre los campos compartidos y el contenido específico del tipo.
- Generación **solo del contenido específico del tipo**: `questionsList`, `text` + `questionsList`, `prompt`, o `explanation` + `exercises`. Título, instrucciones y duración de la actividad nunca los toca la IA.
- Confirmación con `window.confirm` antes de reemplazar contenido ya escrito (mismo patrón que el cambio de tipo), reutilizando `hasSpecificContent` de `lesson-schema.ts`.
- Endpoint `POST /api/ai/activities/autocomplete` en un `backend/Api/AiEndpoints.cs` nuevo, con autorización JWT y rate limit propio.
- Servicio `OpenRouterAutocomplete` en `backend/Infrastructure/` que llama a `https://openrouter.ai/api/v1/chat/completions` sin streaming, con `response_format` `json_schema` estricto según el tipo de actividad.
- Validación de la respuesta del modelo con `ActivityContent.Read` + `Validate()`: las mismas reglas del dominio que ya aplica `LessonService`.
- Configuración por entorno: sección `OpenRouter` (`OpenRouter:ApiKey`, `OpenRouter:Model`), cableada en dev desde `.env` → `.tools/local-settings.json` vía `scripts/Setup.ps1` y `scripts/Common.ps1`.
- Estados de UI: normal, generando (botón deshabilitado «Generando…», imposible doble request), éxito (contenido en el editor, sin alerta) y error (mensaje `role="alert"`, draft intacto). Regenerar = pulsar otra vez.
- Rate limit por usuario autenticado: ventana fija de 10 peticiones/minuto con la política nueva `"ai"` del `RateLimiter` existente en `Program.cs`.
- Tests de contrato backend (unitarios del cliente con `HttpMessageHandler` stub + integración del endpoint con fake del servicio) y frontend (`autocomplete-api.test.ts` y `ActivityForm.test.tsx`).

**Fuera de alcance (para futuras specs):**

- Streaming de respuestas.
- Historial o persistencia de generaciones (ningún cambio en la DB, ninguna migración).
- Generación de título, instrucciones o duración de la actividad.
- Nuevos tipos de actividad.
- Sistema de billing o administración de costos por usuario.
- Selección de modelo desde la UI.
- Límites configurables por usuario.

## 3. Modelo de datos

No hay datos nuevos persistidos. El contenido generado vive solo en el estado del editor (`ActivityDraft`) hasta que el profesor guarda con el flujo existente. Las únicas estructuras nuevas son los DTOs del contrato y la configuración.

```csharp
// backend/Application/Lessons/IActivityAutocomplete.cs
public sealed record AiAutocompleteRequest(
    string Title, string Level, string Topic, string Objective,   // contexto de la clase
    string ActivityType, string ActivityTitle, string ActivityInstructions);

public sealed record AiGeneratedActivity(string Type, ActivityContent Content);

public enum AiAutocompleteError { NotConfigured, Unavailable, InvalidModelResponse }

public sealed record AiAutocompleteResult(AiGeneratedActivity? Generated, AiAutocompleteError? Error);

public interface IActivityAutocomplete
{
    Task<AiAutocompleteResult> GenerateAsync(AiAutocompleteRequest request, CancellationToken ct);
}
```

```csharp
// backend/Api/Program.cs — sección de configuración
public sealed class OpenRouterOptions
{
    public string ApiKey { get; init; } = "";
    public string Model { get; init; } = "";
    public string BaseUrl { get; init; } = "https://openrouter.ai/api/v1";
}
```

Contrato HTTP (el contexto de la clase viaja en el body porque en el flujo de creación la clase aún no existe en la DB):

```json
// POST /api/ai/activities/autocomplete
{ "lesson": { "title": "…", "level": "B1", "topic": "…", "objective": "…" },
  "activityType": "VocabularyGrammar", "activityTitle": "…", "activityInstructions": "…" }

// 200
{ "type": "VocabularyGrammar", "content": { "explanation": "…", "exercises": ["…", "…"] } }
```

Errores: `400` ValidationProblem (campos de clase inválidos o tipo desconocido), `401` sesión caducada, `429` límite por usuario, `503` IA no configurada (sin `OpenRouter:ApiKey`), `502` OpenRouter no responde, timeout o respuesta del modelo inválida.

La respuesta `200` usa la misma forma que `LessonActivityInput.Content`; el frontend la aplica con `onChange({ ...activity, content })`.

## 4. Plan de implementación

1. Crear `backend/Application/Lessons/IActivityAutocomplete.cs` con los DTOs y la interfaz. Sin wiring: el backend compila y nada cambia en ejecución. Manual: `dotnet build Profefacilisimo.slnx`.
2. Crear `backend/Infrastructure/OpenRouterAutocomplete.cs`: construcción del prompt (mensaje de sistema en español + mensaje de usuario con el bloque de contexto), `response_format` json_schema estricto por tipo, `max_tokens: 2000`, `temperature: 0.3`, timeout de `HttpClient` de 90 s, parseo y validación con `ActivityContent.Read` + `Validate()`, mapeo de errores a `NotConfigured` / `Unavailable` / `InvalidModelResponse`. Manual: compila; aún nadie lo llama.
3. Crear `tests/Integration.Tests/OpenRouterAutocompleteTests.cs` (unitarios, sin `ApiFixture`): `HttpMessageHandler` stub que captura el request y devuelve respuestas fijas. Cubre request correcto (URL, `Authorization`, `model`, json_schema del tipo, mensajes con contexto), respuesta válida, JSON inválido, violación de reglas, HTTP de error, timeout y sin key.
4. Crear `backend/Api/AiEndpoints.cs` con `POST /api/ai/activities/autocomplete` y cablear en `Program.cs`: bind de `OpenRouterOptions` (key opcional, model obligatorio si hay key), `AddHttpClient` + registro DI, política de rate limit `"ai"` por `sub` (10/min), `app.MapAiEndpoints()`. Manual: sin key configurada el endpoint responde `503` con mensaje en español; con fake en tests responde según el error.
5. Extender `tests/Integration.Tests/ApiFixture.cs` con un fake configurable de `IActivityAutocomplete` y crear `ActivityAutocompleteEndpointTests.cs`: `401` sin sesión, `400` tipo desconocido, `200` con la forma `{ type, content }`, `503`/`502` según el fake, `429` tras el límite.
6. Ajustar configuración y scripts: `.env.example` añade `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` comentadas con un modelo ejemplo que soporte json_schema; `scripts/Setup.ps1` las incluye en `.tools/local-settings.json` cuando existan en `.env`; `scripts/Common.ps1` setea `OpenRouter__ApiKey` / `OpenRouter__Model` solo si no están vacíos. Manual: `./scripts/Start-Api.ps1` arranca igual con o sin key.
7. Crear `frontend/src/lessons/autocomplete-api.ts` (tipos + `autocompleteActivity`) y `autocomplete-api.test.ts`: request bien construido, respuesta válida, errores `503`/`502`/`429` con mensaje en español.
8. Añadir el botón y sus estados a `frontend/src/lessons/ActivityForm.tsx`: nueva prop `lesson: LessonValues` (el `LessonEditorPage` la pasa con `form.getValues()`), `useMutation` con `retry: false`, confirmación antes de reemplazar, botón deshabilitado «Generando…», error `role="alert"`, éxito vía `onChange({ ...activity, content })` sin tocar título/instrucciones/duración. Extender `ActivityForm.test.tsx`.

Cada paso deja el sistema funcional y es commiteable por separado.

## 5. Criterios de aceptación

- [ ] Con una actividad de cada tipo seleccionada, el botón genera contenido válido que aparece en los campos del editor como valores editables.
- [ ] La generación respeta el tipo declarado: la unión discriminada del draft nunca mezcla tipo y contenido incompatibles.
- [ ] El título, las instrucciones y la duración de la actividad no cambian tras una generación.
- [ ] Con contenido ya escrito, pulsar el botón pide confirmación, y cancelar deja el draft exactamente como estaba.
- [ ] Durante la generación el botón está deshabilitado y muestra «Generando…»; no se puede disparar una segunda petición en curso.
- [ ] Tras un error (`502`/`503`/`429`/`401`/red) el draft conserva todo lo escrito y se muestra un mensaje con `role="alert"`.
- [ ] Sin `OpenRouter:ApiKey` la API arranca con normalidad y el endpoint responde `503` con «La IA no está configurada en este entorno.».
- [ ] Con key configurada pero sin `OpenRouter:Model`, la API no arranca (mismo patrón que `Jwt`).
- [ ] Más de 10 peticiones de IA por minuto del mismo usuario responden `429`.
- [ ] En ninguna respuesta del backend al frontend aparece la API key; la key solo existe en el header `Authorization` del request del backend hacia OpenRouter.
- [ ] El JSON enviado a OpenRouter usa `response_format` `json_schema` con `strict: true` y un schema por tipo de actividad.
- [ ] El request a OpenRouter incluye título, nivel, tema y objetivo de la clase, tipo de actividad y título/instrucciones actuales.
- [ ] `./scripts/Test.ps1` pasa completo y `tsc -b && vite build` queda limpio.

## 6. Decisiones

- **Sí:** generar solo el contenido específico del tipo. El profesor mantiene la autoría del título, las instrucciones y la duración; un solo request por generación.
- **No:** generar el bloque completo de la actividad. Fuera del MVP; el profesor confirmó que el título y las instrucciones son suyos.
- **Sí:** contexto de la clase en el body del request. En el flujo de creación la clase no existe en la DB, así que no hay nada que leer ni propiedad que verificar; el paso `info` ya está validado antes de llegar a actividades.
- **Sí:** un solo endpoint para los cuatro tipos. Lo que varía es el schema y la instrucción del prompt, no el contrato.
- **Sí:** `response_format` `json_schema` estricto + validación con `ActivityContent.Validate()`. El schema reduce ambigüedad y las reglas del dominio son la última barrera contra contenido incompatible.
- **No:** streaming. Una generación cabe en segundos y el JSON estructurado se necesita completo de todos modos.
- **No:** persistir generaciones ni auditoría de tokens. El contenido vive en el editor hasta el guardado existente; un historial merece spec propia si llega.
- **Sí:** rate limit por usuario (10/min, ventana fija). Barato, reutiliza el `RateLimiter` existente y protege el costo sin sistema de billing.
- **Sí:** key y modelo solo por configuración (`OpenRouter:ApiKey` / `OpenRouter:Model`, env `OpenRouter__ApiKey` / `OpenRouter__Model`). Cambiar de modelo no toca código; sin key la app funciona y el endpoint responde `503`.
- **No:** modelo por defecto hardcodeado. Acoplaría la app a un modelo concreto y vencería en silencio.
- **Sí:** confirmar antes de reemplazar contenido existente, con `window.confirm` y `hasSpecificContent`. Mismo patrón que el cambio de tipo en el editor.
- **Sí:** éxito silencioso. El contenido visible en el editor es la confirmación; no hay alerta duplicada.
- **Sí:** `max_tokens: 2000` y `temperature: 0.3` fijos en el cliente de OpenRouter. Acota costo y deriva; si algún día se necesita ajustar, ya existe la sección `OpenRouter` donde ponerlo.

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El modelo configurado no soporta `json_schema` estricto y OpenRouter rechaza el request | `.env.example` documenta un modelo ejemplo compatible; el fallo se mapea a `502` con mensaje claro y sin pérdida de datos |
| El modelo devuelve JSON que viola los límites (más de 50 filas, textos demasiado largos) | `ActivityContent.Validate()` lo rechaza → `502`; el prompt pide entre 6 y 10 ítems |
| Latencia alta (30–60 s por generación) | Botón deshabilitado «Generando…», timeout de servidor de 90 s, sin bloqueo del resto del editor |
| Costo por tokens | `max_tokens: 2000`, contexto menor a 1k tokens, request solo al pulsar el botón, rate limit 10/min/usuario |
| El profesor pierde contenido escrito por un reemplazo accidental | `window.confirm` previo cuando `hasSpecificContent` es true; la IA nunca guarda por sí sola |
| Un usuario martilla el endpoint sin pasar por el botón | Política de rate limit `"ai"` por `sub`, independiente del estado del frontend |

## Lo que **no** va en esta spec

- Streaming de respuestas.
- Historial o persistencia de generaciones.
- Generación de título, instrucciones o duración.
- Nuevos tipos de actividad.
- Billing o administración de costos.
- Selección de modelo desde la UI.
- Cambios en la base de datos.

Cada uno, si llega, va en su propia spec.
