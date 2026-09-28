# MEMORY.md — Profefacilisimo

Notas de proyecto con valor duradero. Detalle diario en `YYYY-MM-DD.md`.
Fuente de verdad del producto: `README.md` + `docs/`. No duplicar aquí lo que ya está en docs.

## Entorno de build (importante)

- **`dotnet restore` no funciona desde bash**: NuGet falla con
  `Value cannot be null (Parameter 'path1')`; `dotnet --info` lanza `TypeInitializationException`.
  El sandbox restringe APIs de Windows. No es problema del repo.
- **Usar siempre `--no-restore`** (los `obj/project.assets.json` ya están). No añadir `PackageReference`:
  sin restore no se resolverían.
- **El tool de PowerShell no devuelve stdout**: redirigir a fichero y leerlo. `cmd.exe` está bloqueado.
- **Bloqueo de ficheros**: con API en ejecución o Visual Studio abierto, `backend/Api` falla con
  `MSB3021/MSB3027` al copiar los .dll. Es fallo de copia, no de compilación: verificar con
  `dotnet build backend/Infrastructure/Infrastructure.csproj --no-restore`.
- **El entorno crea commits automáticamente**: árbol limpio ≠ nada commiteado.
- Correr siempre los tests de integración con `TEST_DATABASE_CONNECTION='<ConnectionString>'`; usan
  PostgreSQL real (`localhost:5432`), nunca EF InMemory. Credenciales en `.tools/local-settings.json`.

## Convenciones del repo

- **.NET 9** (`global.json` → SDK 9.0.318, `net9.0`). Cuatro capas Domain / Application / Infrastructure / Api.
- `Directory.Build.props` activa `TreatWarningsAsErrors`, `Nullable`, `ImplicitUsings` globalmente.
- Frontend: React + TS + Vite, TanStack Query, RHF, Zod. `tsconfig.json` solo incluye `src` → `e2e/`
  queda fuera de `tsc -b`.
- Scripts de verificación (PowerShell): `scripts/Test.ps1`, `scripts/Test-E2E.ps1` (Debug o Release).
- Fases 1–3 cerradas (base, Class Builder, Lesson Player). Próxima: Fase 4 Student Management
  (solo documentada en `docs/student-management.md`, sin implementar).

## Trampas de tests (costosas de redescubrir)

- **`IClassFixture` crea una base `pf_test_*` por CLASE de test, no por test.** Dos tests que insertan
  en la misma clase se contaminan (rompen `CountAsync`): separarlos en clases distintas.
- **EF Core**: añadir hijos nuevos a un padre **ya existente** (`Unchanged`) los marca `Modified` en vez
  de `Added` → `UPDATE` en vez de `INSERT` → `DbUpdateConcurrencyException` (0 filas).
  Añadirlos explícitamente (`db.Activities.AddRange(...)`) o dentro de un padre también nuevo.
- **jsdom no implementa el scroll**: define `Element.prototype.scrollTop` (accesorio) pero **no**
  `scrollTo` ni `scrollIntoView`. Usar `elemento.scrollTop = 0` en producción y verificar con accesorio propio.

## Verificar el frontend con navegador real (Playwright)

```bash
# 1. Base desechable + migraciones (dotnet ef EXIGE Jwt__SigningKey además de la cadena)
docker compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" pf_e2e'
ConnectionStrings__Default='Host=localhost;Port=5432;Database="pf_e2e";Username="profefacilisimo";Password="..."' \
Jwt__SigningKey='<SigningKey de .tools/local-settings.json>' ASPNETCORE_ENVIRONMENT=Development \
  ~/.dotnet/tools/dotnet-ef database update --project backend/Infrastructure --startup-project backend/Api --no-build

# 2. API en el puerto del proxy de Vite (5080)
dotnet run --project backend/Api --no-build --no-launch-profile --urls http://localhost:5080   # background

# 3. Runner (arranca Vite él mismo vía webServer)
cd frontend && npx playwright test --reporter=list
# Al terminar: parar la API y dropdb --if-exists --force -U "$POSTGRES_USER" pf_e2e
```

- Playwright: `getByLabel('Pregunta 1')` también casa con el `aria-label` «Quitar pregunta 1» →
  usar `{ exact: true }`. `getByText` en strict mode puede casar dos nodos (total = duración):
  anclar al nodo correcto (`getByText('Duración total:')`, `.activity-duration`).
- Los E2E escriben capturas en `.tools/` (ignorado). Si la ejecución falla deja artefactos en
  `frontend/test-results/`: borrarlos en un turno aparte (el sandbox bloquea borrados >50 ficheros).

## Flujo de especificaciones

- Specs en `specs/` con estado en cabecera (`**Estado:**`). `specs/.spec-config.yml`: `AutoCreateBranch: true`.
  Las aprobadas se implementan con el skill `spec-impl`, en rama `spec-NN-slug`.
- **Specs paralelas** (`*-parallel.md` de `multi-ag-spec`): manda el §5 del plan, no el nombre del fichero.
  Rama de integración `spec-NN-slug` desde `main` + una rama `spec-NN-slug--<flujo>` por flujo.
  Con una sola sesión se ejecutan los flujos en secuencia sobre ramas (sin worktree: §1 lo autoriza).
- **Resources de escritor único** en specs con backend: `backend/Infrastructure/Migrations/` y
  `AppDbContextModelSnapshot.cs` no admiten dos escritores (el snapshot se regenera entero).

## Trabajo paralelo multiagente (worktrees)

- **Un worktree nuevo NO compila tal cual.** `.gitignore` excluye `obj/`, `bin/`, `node_modules/`,
  `.tools/`, `test-results/`. Bootstrap antes de dárselo a un agente:
  1. Copiar `obj/` del checkout principal para `backend/{Domain,Application,Infrastructure,Api}` y
     `tests/{Domain.Tests,Integration.Tests}`; verificar dentro del worktree con
     `dotnet build backend/Infrastructure/Infrastructure.csproj --no-restore`.
  2. Copiar `.tools/local-settings.json` (tests de integración y `dotnet ef`).
  3. `cp -r` `frontend/node_modules` del checkout principal (~186 MB, minutos, sin red).
- **Los worktrees aíslan el sistema de ficheros, no la sesión.** Subagentes de la misma sesión comparten
  `cwd` y checkout: el paralelismo real exige **una sesión por worktree**.
- **Playwright y puertos**: `playwright test` arranca Vite por su cuenta y la API de pruebas usa el 5080.
  Serializar el E2E (dos agentes a la vez chocan).
- Limpieza: `git worktree remove <ruta>` + `git worktree prune`. Nunca `rm -rf` (deja metadatos huérfanos).

## Lecciones de integración (aplicables a toda spec paralela)

- **Un enlace puede existir sin su ruta si los flujos viven en ramas separadas.** Caso real (2026-09-24):
  «Iniciar clase» → «Página no encontrada» porque el Flujo C añadió el enlace pero la `<Route>` del Flujo A
  seguía sin fusionar. Los tests de componente verdes por separado **no** lo detectan: cada suite prueba su
  mitad. Comprobación rápida en navegador real: `curl -s http://localhost:5173/src/App.tsx | grep play`.
- **Clases del reproductor**: las CSS salen de las listas C3 de la spec, no del marcado.
  `player-activity-title` / `player-activity-duration` / `player-instructions` son `data-testid` de E2E;
  la clase de las instrucciones es `player-activity-instructions`.

## Lote de correcciones de diseño (`design-fixes`) — reglas del usuario (2026-09-25)

Cada corrección va en **su propia rama hija de `design-fixes`**. Reglas vigentes del lote:

- **No crear ni actualizar tests unitarios ni E2E. No ejecutar la suite completa. No validaciones
  manuales en navegador.**
- Verificar solo compilación y errores de TypeScript: `npx tsc -b`, `npx vite build`, `npx eslint .`.
- Si un test existente falla por el cambio de interfaz, **documentarlo sin modificarlo**.
- Prioridad: velocidad de iteración sobre cobertura. Los tests quedan desincronizados a propósito
  (causas raíz en `docs/wizard-2-pasos-affected-tests.md` y `docs/sweetalert2-affected-tests.md`).

Cambios entregados en el lote (referencia):

- **Wizard de 2 pasos** (`feat/crear-clase-wizard-2-pasos`): el paso vive en `useState` (una recarga
  vuelve al paso 1, no va en la URL). `carriedStep` (variable de módulo) sobrevive al remount al crear una
  clase. Avance bloqueado con `form.trigger()`. El contrato de guardado no cambia.
- **SweetAlert2** (`notifications.ts` centraliza las alertas): **trampa de tipado** —
  `Parameters<typeof Swal.fire>[0]` resuelve a la sobrecarga de `string` → TS2698/TS2345; importar
  `SweetAlertOptions` como tipo. Tema en `styles.css` (`.pf-alert`), no en `customClass`.
  **`npm install` reformatea `package.json`/`package-lock.json` enteros**: revisar siempre el diff del lock.
  La alerta no se cierra sola: puede interceptar clics en E2E.
- **Botón secundario «Editar clase»** (`feat/boton-editar-clase`): `button.secondary` era selector de
  **elemento**, un `<Link className="button secondary">` salía relleno → se generalizó a
  `button.secondary, .button.secondary`. Primera aparición de un enlace secundario: ese es el patrón.
