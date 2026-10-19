# SPEC 08 — Tema opcional con sugerencias y selector de filtro independiente

> **Estado:** Aprobado  
> **Depende de:** SPEC 01 — Gestión de clases; SPEC 02 — Editor de actividades  
> **Fecha:** 2026-10-17  
> **Objetivo:** Convertir el campo `Topic` (Tema) en opcional al crear y editar clases, proporcionar sugerencias de temas comunes (ELE) mediante autocompletado en el editor, y añadir un selector independiente de tema en el listado de clases para filtrar por categoría temática junto a los filtros existentes de título y nivel.

---

## 1. Por qué esta spec existe

En SPEC 01 y SPEC 02, el formulario de metadatos de la clase exige cuatro campos obligatorios: `Title`, `Level`, `Topic` y `Objective`.

En la práctica docente de profesores de español (ELE / idiomas):

1. **Fricción innecesaria:** El profesor suele incluir el contexto temático dentro del título (por ejemplo: _"A2: Pedir comida en un restaurante"_ o _"B1: Anécdotas de vacaciones"_). Exigir además un campo `Topic` obligatorio genera duplicidad y fatiga al registrar una clase.
2. **Subutilización del dato:** Aunque `Topic` se exigía de forma obligatoria, el listado de clases (`LessonsPage`) solo permitía buscar por `Title` y filtrar por `Level`. `Topic` se mostraba únicamente como texto pasivo en la tarjeta de la clase.
3. **Estandarización para búsqueda:** Si el campo `Topic` se mantiene opcional pero se asiste con una lista de temas frecuentes comunes (alineados al Marco Común Europeo de Referencia - MCER y al Instituto Cervantes), los profesores pueden categorizar sus clases con un solo clic o tecleo rápido. Esto habilita un nuevo **selector independiente de tema en el listado**, facilitando la organización de la biblioteca de clases sin obligar a llenar el campo a quien no lo necesite.

---

## 2. Alcance

### Incluye

1. **Dominio y base de datos (.NET / PostgreSQL):**
   - El campo `Topic` de la entidad `Lesson` pasa de ser obligatorio a ser opcional (`string?`), admitiendo `null`.
   - Se valida mediante la regla existente `Rules.Optional(topic, 200, nameof(topic))` (los textos en blanco se normalizan a `null` y el límite sigue siendo 200 caracteres).
   - Migración EF Core en `backend/Infrastructure/Migrations/` que altera la columna `Topic` de la tabla `Lessons` para admitir valores nulos (`DROP NOT NULL`).
   - Los DTOs `SaveLessonRequest`, `LessonListItemDto` y `LessonDetailsDto` admiten `string? Topic`.
   - `ILessonReader.ListOwnedAsync` y su implementación en `LessonReader.cs` reciben un parámetro opcional `string? topic` y filtran las clases activas por coincidencia de tema.
   - Endpoint `GET /api/lessons` admite el query parameter opcional `topic` (máximo 200 caracteres).

2. **Frontend (React / TypeScript):**
   - Constante estandarizada `COMMON_TOPICS` con los 10 temas más comunes en enseñanza de idiomas (ELE):
     1. _Viajes y turismo_
     2. _Gastronomía y restaurantes_
     3. _Vida cotidiana y rutina_
     4. _Relaciones personales y descripciones_
     5. _Vivienda y ciudad_
     6. _Trabajo y profesiones_
     7. _Salud y bienestar_
     8. _Cultura, ocio y celebraciones_
     9. _Medio ambiente y naturaleza_
     10. _Foco gramatical y lingüístico_
   - Esquema Zod `lessonSchema` en `lesson-schema.ts`: `topic` se vuelve opcional (acepta string vacío o ausente, con un máximo de 200 caracteres si se proporciona).
   - En `LessonEditorPage.tsx`:
     - La etiqueta indica `Tema (opcional)`.
     - El `<input id="topic">` se vincula a un `<datalist id="common-topics">` con `COMMON_TOPICS`.
     - El profesor puede seleccionar un tema sugerido con el cursor, empezar a escribir para autocompletarlo, escribir un tema personalizado no listado, o dejar el campo vacío.
   - En `LessonsPage.tsx`:
     - El formulario de filtros incorpora un **selector independiente de tema**: `<select id="lesson-topic">` con la opción por defecto _"Todos los temas"_ y cada uno de los temas comunes de `COMMON_TOPICS`.
     - El estado local de filtros y el tipo `LessonFilters` incluyen `topic: string`.
     - `lessonListKey` y `listLessons` en `lesson-api.ts` incorporan `topic` en la clave de consulta y en los parámetros de la URL.
     - El botón _"Limpiar filtros"_ resetea también el selector de tema a _"Todos los temas"_.
     - En la tarjeta de clase de la lista, si `lesson.topic` es nulo o vacío, no se renderiza el elemento `<p>` vacío para no generar saltos visuales extra.

3. **Pruebas:**
   - Pruebas unitarias de dominio `LessonTests`: verificar creación, edición y duplicación con `Topic = null` y con `Topic` con valor.
   - Pruebas de integración backend: verificar que `GET /api/lessons` filtre correctamente por `topic`, por combinación `search + level + topic`, y devuelva clases sin tema cuando no hay filtro de tema.
   - Pruebas de componentes frontend:
     - `LessonEditorPage.test.tsx`: guardar clase con tema vacío.
     - `LessonsPage.test.tsx`: filtrar por tema mediante el selector y verificar que el reset limpie el selector.
     - `lesson-api.test.ts`: verificar serialización del query param `topic`.

### Fuera de alcance

- Múltiples temas o etiquetas (tags N:M) por clase (se mantiene un único tema opcional por clase).
- Pantalla de administración o CRUD para que el profesor cree/edite su propio catálogo de temas persistidos.
- Cambios en el Reproductor de clases (`LessonPlayerPage.tsx`).
- Cambios en la ficha de estudiantes o en la asignación de clases (`AssignedLessons.tsx`).

---

## 3. Modelo de datos, migración y API

### 3.1. Dominio (.NET)

En `backend/Domain/Lesson.cs`:

```csharp
public sealed class Lesson
{
    // ...
    public Lesson(Guid userId, string title, LessonLevel level, string? topic, string objective,
        IReadOnlyList<ActivityDraft>? activities = null)
    {
        // ...
        Title = Rules.Text(title, 200, nameof(title));
        Topic = Rules.Optional(topic, 200, nameof(topic)); // Rules.Optional ya existe en Rules
        Objective = Rules.Text(objective, 2000, nameof(objective));
        // ...
    }

    public string? Topic { get; private set; }

    public void UpdateMetadata(string title, LessonLevel level, string? topic, string objective)
    {
        EnsureActive();
        if (!Enum.IsDefined(level)) throw new ArgumentException("Unsupported level.", nameof(level));
        var validTitle = Rules.Text(title, 200, nameof(title));
        var validTopic = Rules.Optional(topic, 200, nameof(topic));
        var validObjective = Rules.Text(objective, 2000, nameof(objective));
        Title = validTitle;
        Topic = validTopic;
        Objective = validObjective;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public Lesson Duplicate(string title)
    {
        EnsureActive();
        var copy = new Lesson(UserId, title, Level, Topic, Objective);
        // ...
    }
}
```

### 3.2. DTOs y Servicios de Aplicación

En `backend/Application/Lessons/LessonDtos.cs`:

```csharp
public record SaveLessonRequest(string Title, string Level, string? Topic, string Objective,
    IReadOnlyList<SaveActivityRequest> Activities);

public record LessonListItemDto(Guid Id, string Title, string Level, string? Topic, int? EstimatedDuration,
    DateTimeOffset UpdatedAt, DateTimeOffset? DeletedAt);

public record LessonDetailsDto(Guid Id, string Title, string Level, string? Topic, string Objective,
    int? EstimatedDuration, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? DeletedAt,
    IReadOnlyList<LessonActivityDto> Activities);
```

En `backend/Infrastructure/LessonService.cs`:

```csharp
// Modificar la validación para admitir nulo:
if (!string.IsNullOrWhiteSpace(request.Topic) && request.Topic.Trim().Length > 200)
    errors["topic"] = ["topic cannot exceed 200 characters."];
```

### 3.3. Base de datos y Migración EF Core

En `backend/Infrastructure/AppDbContext.cs`:

```csharp
entity.Property(x => x.Topic).HasMaxLength(200).IsRequired(false);
```

Migración generada: `MakeLessonTopicOptional`:

```csharp
migrationBuilder.AlterColumn<string>(
    name: "Topic",
    table: "Lessons",
    type: "character varying(200)",
    maxLength: 200,
    nullable: true,
    oldClrType: typeof(string),
    oldType: "character varying(200)",
    oldMaxLength: 200);
```

### 3.4. Endpoint y Consulta de Filtrado

En `backend/Application/Lessons/ILessonReader.cs` y `backend/Infrastructure/LessonReader.cs`:

```csharp
public async Task<IReadOnlyList<LessonListItemDto>> ListOwnedAsync(
    Guid userId, bool trash, string? search, LessonLevel? level, string? topic, CancellationToken cancellationToken)
{
    var query = db.Lessons.AsNoTracking().Where(x => x.UserId == userId);
    if (trash)
    {
        query = query.Where(x => x.DeletedAt != null).OrderByDescending(x => x.DeletedAt).ThenBy(x => x.Id);
    }
    else
    {
        query = query.Where(x => x.DeletedAt == null);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = "%" + search.Trim().Replace("!", "!!").Replace("%", "!%").Replace("_", "!_") + "%";
            query = query.Where(x => EF.Functions.ILike(x.Title, pattern, "!"));
        }
        if (level is not null) query = query.Where(x => x.Level == level);
        if (!string.IsNullOrWhiteSpace(topic))
        {
            var trimmedTopic = topic.Trim();
            query = query.Where(x => x.Topic != null && EF.Functions.ILike(x.Topic, trimmedTopic));
        }
        query = query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id);
    }
    return await query.Select(x => new LessonListItemDto(x.Id, x.Title, x.Level.ToString(),
        x.Topic, x.EstimatedDuration, x.UpdatedAt, x.DeletedAt)).ToListAsync(cancellationToken);
}
```

En `backend/Api/LessonEndpoints.cs`:

```csharp
private static async Task<IResult> List(ClaimsPrincipal principal, ILessonReader reader,
    string? state, string? search, string? level, string? topic, CancellationToken ct)
{
    // ...
    topic = topic?.Trim();
    if (topic?.Length > 200) errors["topic"] = ["Máximo 200 caracteres."];
    // ...
    return Results.Ok(await reader.ListOwnedAsync(userId, state == "trash", search, parsedLevel, topic, ct));
}
```

---

## 4. Comportamiento en la interfaz de usuario (UX)

### 4.1. Catálogo de temas sugeridos (`frontend/src/lessons/lesson-topics.ts`)

```ts
export const COMMON_TOPICS = [
  "Viajes y turismo",
  "Gastronomía y restaurantes",
  "Vida cotidiana y rutina",
  "Relaciones personales y descripciones",
  "Vivienda y ciudad",
  "Trabajo y profesiones",
  "Salud y bienestar",
  "Cultura, ocio y celebraciones",
  "Medio ambiente y naturaleza",
  "Foco gramatical y lingüístico",
] as const;

export type CommonTopic = (typeof COMMON_TOPICS)[number];
```

### 4.2. Validación de formulario (`frontend/src/lessons/lesson-schema.ts`)

```ts
export const lessonSchema = z.object({
  title: text(200),
  level: z.enum(["A2", "B1", "B2"], { error: "Selecciona A2, B1 o B2." }),
  topic: z
    .string()
    .trim()
    .max(200, "Máximo 200 caracteres.")
    .optional()
    .default(""),
  objective: text(2000),
});
```

### 4.3. Editor de clases (`LessonEditorPage.tsx`)

En el paso 1 ("Datos de la clase"):

```tsx
<label htmlFor="topic">Tema <span className="optional">(opcional)</span></label>
<input
  id="topic"
  list="common-topics"
  placeholder="Ej. Viajes y turismo, Gastronomía…"
  {...form.register('topic')}
  aria-invalid={!!form.formState.errors.topic}
  aria-describedby="topic-error"
/>
<datalist id="common-topics">
  {COMMON_TOPICS.map((topic) => (
    <option key={topic} value={topic} />
  ))}
</datalist>
<small className="error" id="topic-error">{form.formState.errors.topic?.message}</small>
```

### 4.4. Listado y Filtros (`LessonsPage.tsx`)

El formulario de filtros pasa a contar con tres controles independientes:

1. **Buscar por título:** Input de búsqueda libre existente.
2. **Nivel:** Desplegable existente (_Todos los niveles_, A2, B1, B2).
3. **Tema:** Selector independiente:
   ```tsx
   <div>
     <label htmlFor="lesson-topic">Tema</label>
     <select
       id="lesson-topic"
       value={topic}
       onChange={(event) => setTopic(event.target.value)}
     >
       <option value="">Todos los temas</option>
       {COMMON_TOPICS.map((t) => (
         <option key={t} value={t}>
           {t}
         </option>
       ))}
     </select>
   </div>
   ```

**Acciones de filtrado:**

- Al pulsar _"Buscar"_, se combinan los tres criterios activos mediante conjunción lógica (`AND`).
- Si se elige un tema (ej. _"Viajes y turismo"_) y un nivel (ej. _"B1"_), solo se mostrarán las clases que cumplan ambas condiciones.
- Si no hay coincidencias, se muestra el mensaje existente: _"No hay clases que coincidan con estos filtros."_
- Al pulsar _"Limpiar filtros"_, se restablecen `search = ''`, `level = ''` y `topic = ''`.

**Visualización en la tarjeta de clase:**

```tsx
<h2>{lesson.title}</h2>
<span className="level-badge">{lesson.level}</span>
{lesson.topic && <p className="lesson-topic">{lesson.topic}</p>}
```

---

## 5. Casos borde y reglas de negocio

1. **Clases preexistentes en la base de datos:**  
   Todas las clases creadas con anterioridad a esta spec tienen un tema no nulo. La migración no modifica los valores existentes; simplemente permite que futuros inserts o updates tengan `Topic = NULL`.
2. **Espacios en blanco:**  
   Si el usuario ingresa solo espacios en el campo de tema, se recorta (`Trim()`) y se persiste como `NULL` en backend y `""` en el formulario, sin mostrar error de validación.
3. **Temas personalizados (fuera de `COMMON_TOPICS`):**  
   Si un profesor escribe a mano un tema que no está en la lista de temas comunes (ej. _"Español médico"_), se persiste normalmente en la base de datos y se muestra en la tarjeta de su clase. En el filtro de la página de clases, ese tema podrá encontrarse si se busca por título, o bien el selector mostrará las clases que coincidan con los temas estándar.
4. **Papelera:**  
   En la vista de papelera (`trash = true`), los filtros de búsqueda y temas permanecen inactivos (regla heredada de SPEC 01).
5. **Duplicación:**  
   Al duplicar una clase que tenga `Topic = null`, la copia preserva `Topic = null`. Si tiene un tema asignado, la copia preserva dicho tema.

---

## 6. Plan de verificación y pruebas

### 6.1. Backend (`dotnet test`)

- **Unitarias (`Domain.Tests`):**
  - Crear una `Lesson` con `topic = null` o `""` -> `Topic` queda `null`.
  - Crear una `Lesson` con `topic = "Viajes y turismo"` -> `Topic` queda recortado.
  - Actualizar metadatos con `topic = null`.
  - Duplicar clase sin tema.
- **Integración (`Integration.Tests`):**
  - `POST /api/lessons` con `Topic = null` o ausente crea la clase con código 201.
  - `GET /api/lessons?topic=Viajes%20y%20turismo` solo retorna clases con ese tema.
  - `GET /api/lessons?state=active&level=B1&topic=Gastronom%C3%ADa` filtra simultáneamente por ambos criterios.

### 6.2. Frontend (`vitest` / Testing Library)

- `lesson-schema.test.ts`: Valida que `{ title: 'Clase', level: 'B1', objective: 'Obj' }` sea válido sin `topic`.
- `LessonEditorPage.test.tsx`:
  - Enviar formulario sin escribir en `topic` guarda con éxito.
  - Verifica la presencia del atributo `list="common-topics"` en el input de tema.
- `LessonsPage.test.tsx`:
  - Renderiza el selector de temas con la opción _"Todos los temas"_ y las opciones comunes.
  - Al seleccionar un tema y enviar el formulario, `listLessons` se invoca con `{ topic: 'Viajes y turismo' }`.
  - Al pulsar _"Limpiar filtros"_, el selector de tema vuelve a _"Todos los temas"_.
  - Las clases con `topic: null` no renderizan un párrafo vacío.

### 6.3. Gate de verificación final

Ejecutar el pipeline de calidad establecido en el proyecto:

```powershell
./scripts/Test.ps1
```

(Incluye `dotnet test`, `eslint`, `tsc -b && vite build` y `vitest`).
