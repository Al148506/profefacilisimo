# MEMORY.md — Profefacilisimo

Notas de proyecto con valor duradero. Los detalles diarios van en `YYYY-MM-DD.md`.

## Entorno de build (importante)

- **`dotnet restore` no funciona desde la shell bash de este entorno.** NuGet falla con
  `error: Value cannot be null. (Parameter 'path1')` incluso para `dotnet nuget list source`
  y `dotnet --info` lanza `TypeInitializationException` en
  `Microsoft.DotNet.Installer.Windows.InstallerBase` (NullReferenceException). El entorno tiene
  restringidas las APIs de Windows (carpetas conocidas / registro), no es un problema del repo.
- **Solución**: usar siempre `--no-restore` (los `obj/project.assets.json` ya están presentes).
  - `dotnet build <proyecto>.csproj --no-restore`
  - `dotnet test tests/Domain.Tests/Domain.Tests.csproj --no-restore`
  - No añadir `PackageReference` nuevas: sin restore no se resolverían.
- **El tool de PowerShell no devuelve stdout** en este entorno. Para capturar salida, redirigir a
  fichero y leerlo con la herramienta de lectura.
- `cmd.exe` está bloqueado desde bash por política de seguridad.
- **Los tests de integración SÍ se pueden ejecutar**: PostgreSQL está disponible en `localhost:5432`.
  La cadena de conexión y la clave JWT están en `.tools/local-settings.json` (no versionado).
  ```bash
  TEST_DATABASE_CONNECTION='<ConnectionString>' \
    dotnet test tests/Integration.Tests/Integration.Tests.csproj --no-restore
  ```
  El fixture crea bases `pf_test_*` aisladas por clase de test.
- **Bloqueo de ficheros**: si hay una instancia de la API en ejecución o Visual Studio abierto, la
  compilación de `backend/Api` falla con `MSB3021/MSB3027` al copiar `Domain.dll`,
  `Application.dll` e `Infrastructure.dll` a `backend/Api/bin`. Son fallos de copia, no de
  compilación: comprobar con `dotnet build backend/Infrastructure/Infrastructure.csproj --no-restore`.

## Trabajo paralelo multiagente (worktrees)

- **Un worktree nuevo NO compila tal cual.** `.gitignore` excluye `**/obj/`, `**/bin/`,
  `**/node_modules/`, `.tools/` y `**/test-results/`, así que un `git worktree add` nace sin
  artefactos de compilación, sin `node_modules` y sin la configuración local.
- Bootstrap obligatorio de cada worktree, antes de dárselo a un agente:
  1. Artefactos .NET: intentar `dotnet restore`; si falla (es lo esperado en este entorno), copiar
     `obj/` desde el checkout principal para `backend/{Domain,Application,Infrastructure,Api}` y
     `tests/{Domain.Tests,Integration.Tests}`, y **verificar** con
     `dotnet build backend/Infrastructure/Infrastructure.csproj --no-restore` **dentro** del worktree.
     `project.assets.json` guarda un `projectPath` absoluto: el fallback suele funcionar porque la
     carpeta de paquetes NuGet es compartida, pero no está garantizado.
  2. `.tools/local-settings.json` → copiar. Lo necesitan los tests de integración y `dotnet ef`.
  3. `frontend/node_modules` → `npm ci` dentro del worktree, o copiar la carpeta existente.
- **Aislamiento**: los worktrees aíslan el sistema de ficheros, no la sesión del agente. Los
  subagentes de una misma sesión comparten `cwd` y checkout, así que el paralelismo real exige
  **una sesión por worktree** (o ejecutar los carriles en secuencia sobre ramas).
- **Recursos de escritor único**: la carpeta `backend/Infrastructure/Migrations/` y
  `AppDbContextModelSnapshot.cs` no admiten dos escritores — el snapshot se regenera entero y el
  conflicto no se puede resolver a mano.
- **Playwright y puertos**: `playwright test` arranca Vite por su cuenta (`webServer`) y la API de
  pruebas usa el 5080. Dos agentes ejecutando E2E a la vez chocan: serializar el E2E.
- Limpieza: `git worktree remove <ruta>` + `git worktree prune`. Nunca `rm -rf` sobre un worktree
  (deja metadatos huérfanos en `.git/worktrees`).

## Convenciones del repo

- .NET 9 (`global.json` → SDK 9.0.318), cuatro capas: Domain / Application / Infrastructure / Api.
- `Directory.Build.props` activa `TreatWarningsAsErrors`, `Nullable` e `ImplicitUsings` globalmente.
- Tests: xUnit. `tests/Domain.Tests` referencia **solo** `backend/Domain` (no ve Application ni
  Infrastructure). `tests/Integration.Tests` usa PostgreSQL real, no EF InMemory.
- **EF Core**: añadir hijos nuevos a un padre **ya existente** (`Unchanged`) los marca `Modified`, no
  `Added`, porque las claves Guid son `ValueGeneratedOnAdd` y ya vienen puestas → genera `UPDATE` en
  vez de `INSERT` → `DbUpdateConcurrencyException` (0 filas). Hay que añadirlos explícitamente
  (`db.Activities.AddRange(...)`) o hacerlo dentro de un padre también nuevo.
- Scripts de verificación (PowerShell, requieren el entorno del usuario): `scripts/Test.ps1`,
  `scripts/Test-E2E.ps1`.
- Frontend: React + TypeScript + Vite, TanStack Query, React Hook Form, Zod.

## Flujo de especificaciones

- Las specs viven en `specs/` con estado en la cabecera (`**Estado:**`). `specs/.spec-config.yml`
  tiene `AutoCreateBranch: true`.
- Las specs aprobadas se implementan con el skill `spec-impl`, en rama `spec-NN-slug`.

## SPEC 02 (editor de actividades MVP) — cerrada y validada

Las **diez etapas** están implementadas y la validación final de los 30 criterios de aceptación
(§11 de la spec) se completó: dominio, migración, lectura, escritura conjunta (backend), el editor
completo (frontend), la documentación y el E2E permanente.

Baseline verificado el 2026-09-23: `dotnet build Profefacilisimo.slnx --no-restore` 0 errores /
0 advertencias, `Domain.Tests` 55/55 ✓, `Integration.Tests` 101/101 ✓, frontend 57/57 ✓,
`tsc -b` y `eslint .` limpios, **E2E 4/4 ✓** (`lesson-builder`, `lessons` ×2, `session`).

**`playwright test` SÍ funciona en este entorno** (ver la receta al final); el problema del sandbox
es solo la limpieza masiva de `frontend/test-results` en el mismo turno, y Playwright lo vacía solo
cuando la ejecución termina bien.

**Aislamiento de los tests de integración**: `IClassFixture` crea una base `pf_test_*` por **clase**
de test, no por test. Dos tests que insertan filas en la misma clase se contaminan entre sí
(rompen los `CountAsync`); ponlos en clases distintas.

## Verificar una funcionalidad del frontend en un navegador real

Receta que funciona en este entorno (usada para el E2E del editor de actividades):

```bash
# 1. Base desechable + migraciones (dotnet ef EXIGE Jwt__SigningKey, no solo la cadena de conexión)
docker compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" pf_e2e'
ConnectionStrings__Default='Host=localhost;Port=5432;Database="pf_e2e";Username="profefacilisimo";Password="..."' \
Jwt__SigningKey='<SigningKey de .tools/local-settings.json>' ASPNETCORE_ENVIRONMENT=Development \
  ~/.dotnet/tools/dotnet-ef database update --project backend/Infrastructure --startup-project backend/Api --no-build

# 2. API dedicada en el puerto que usa el proxy de Vite por defecto (5080)
dotnet run --project backend/Api --no-build --no-launch-profile --urls http://localhost:5080   # en background

# 3. Runner de Playwright (arranca Vite él mismo vía webServer de playwright.config.ts)
cd frontend && npx playwright test --reporter=list
```

- Al terminar: parar la API y `dropdb --if-exists --force -U "$POSTGRES_USER" pf_e2e`.
- Con Playwright, `getByLabel('Pregunta 1')` también casa con el `aria-label` «Quitar pregunta 1»:
  usar `{ exact: true }`.
- **Cuidado con `getByText` cuando el total coincide con una duración de actividad**: en strict mode
  casa dos nodos. Anclar al nodo correcto (`getByText('Duración total:')` o `.activity-duration`).
- Si la ejecución falla, deja muchos artefactos en `frontend/test-results/`: bórralos en un turno
  aparte o con `rm -rf` (el sandbox bloquea borrados masivos >50 ficheros en el mismo turno).
- Los specs E2E escriben capturas en `.tools/` (ignorado por git): es la convención del repo.
- **`tsconfig.json` del frontend solo incluye `src`**: `e2e/` queda fuera de `tsc -b`.
- **El entorno crea commits automáticamente.** Durante una sesión aparecieron commits que el agente
  no hizo; no asumir que el árbol limpio significa que no se ha commiteado nada.
