# MEMORY.md — Profefacilisimo

Notas duraderas. Detalle diario en `YYYY-MM-DD.md`. Producto: `README.md` + `docs/`.

## Entorno (sandbox)
- **`dotnet restore` roto** (`Parameter 'path1'`) → usar siempre `--no-restore`; en `dotnet ef`, `--no-build`.
  Nunca añadir `PackageReference`. El tool de PowerShell no devuelve stdout → redirigir a fichero.
- **El entorno auto-commitea**: árbol limpio ≠ nada commiteado; `git status` es la fuente fiable.
- `dotnet ef` (`~/.dotnet/tools/dotnet-ef.exe`) exige `Jwt__SigningKey` **además** de `ConnectionStrings__Default`.
- **Tres bases, cada una con su `__EFMigrationsHistory`**: `profefacilisimo`, `pf_integration`, `pf_e2e`.
  Aplicar en una **no** la aplica a las otras. `42P01: relation "X" does not exist` = migración no aplicada
  en *esa* base, casi nunca bug de código.
- Tests de integración: PostgreSQL real vía `TEST_DATABASE_CONNECTION` (nunca EF InMemory); credenciales en
  `.tools/local-settings.json`.

## Repo
- **.NET 9**, 4 capas (Domain/Application/Infrastructure/Api), `TreatWarningsAsErrors` global.
- Frontend React+TS+Vite, TanStack Query, RHF, Zod. `tsconfig.json` solo incluye `src` → `e2e/` fuera de `tsc -b`.
- Fases 1–4 y Ronda 2 cerradas. Suite vitest: 20 archivos / 169 tests.

## Trampas de tests
- `IClassFixture` crea una base `pf_test_*` **por clase**: dos tests que insertan en la misma clase se contaminan.
- EF Core: añadir hijos a un padre **ya existente** (`Unchanged`) los marca `Modified` → `UPDATE` → 0 filas.
- `SqlQueryRaw`: citar identificadores con mayúsculas (`"Id"::text`; `Id::text` da `42703`).
- jsdom no implementa `scrollTo`/`scrollIntoView` (sí `scrollTop`) → usar `elemento.scrollTop = 0`.
- RHF+Zod: los defaults deben tener forma de **entrada** (todo `string`), no de salida.
- Un `Response` solo se lee una vez: en dobles, `mockImplementation(async () => new Response(...))`.
- Helpers `page()`: el helper instala dobles y el test los **sobrescribe después**.
- `getByText('B1')` choca con `<option value="B1">`: acotar el nodo.

## CSS
- La regla global `form { display:flex; flex-direction:column }` (styles.css:15) se hereda en cualquier
  `<form>`: si la clase no declara `flex-direction: row`, apila en columna aunque ponga `flex-wrap`.
- `.card` limita a `min(100%, 470px)` → usar `.card.<pagina>` (más especificidad) para ensanchar.
- **Medir en Playwright, no mirar capturas** (pueden ser de una corrida anterior).

## Playwright / E2E
- **`scripts/Test-E2E.ps1` no admite un spec suelto** (siempre la suite). Para uno a uno: replicar su entorno
  (BD desechable + API 5081 + `API_PROXY_TARGET`) en **una sola invocación** (el sandbox no conserva env vars).
- `frontend/e2e/`: `lessons`, `lesson-builder`, `students`, `session`. **No existe `player`** (cobertura en
  vitest, `LessonPlayerPage.test.tsx`).
- **Archivo por archivo**: varios seguidos agotan `/api/auth` (30 req/min/IP) y dan fallos que no son
  regresiones. Pausa ~45 s entre specs.
- **Auth: solo Bearer en memoria** (no cookies de sesión); `page.request` no cabecea el token (401). Sí hay
  cookie de refresh (`pf.refresh`) → `page.reload()` mantiene sesión y vacía la caché de TanStack Query.
- `signIn` cachea el listado vacío → `page.reload()` tras crear un recurso por API. Tras «Restaurar» el
  refetch desmonta la fila → «element was detached».
- **Cerrar la alerta SweetAlert2 antes de `getByRole`**: con el diálogo abierto pone `aria-hidden="true"` en el
  resto del body y Playwright no encuentra nada por rol.
- **El shim de borrado bloquea a Playwright** (>50 ficheros). Config temporal con
  `outputDir: process.env.PW_OUT || './.tools-pw-results'` y `PW_OUT` al temp de Windows.
  `frontend/.tools-pw-results/` **no está gitignored** → limpiar a mano antes de commitear.

## Editor de clases
- **No quitar las `key` de `.editor-actions`**: un ternario con `<button>` en la misma posición hace que React
  reutilice el nodo; un manejador `async` reescribe `type="button"`→`"submit"` y envía el formulario solo.
  Usar `<Fragment key="info">`/`key="activities"`.
- `AssignedStudents` (SPEC 04) debe seguir **fuera del `<form>` y del condicional de paso** (2 tests canario).

## Specs
- `specs/NN-*.md` con estado en cabecera. `AutoCreateBranch: true` → ramas `spec-NN-slug`.
- Escritores únicos: `Migrations/` y `AppDbContextModelSnapshot.cs`. Al enmendar, solo la política de ejecución.
