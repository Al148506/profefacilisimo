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

## Convenciones del repo

- .NET 9 (`global.json` → SDK 9.0.318), cuatro capas: Domain / Application / Infrastructure / Api.
- `Directory.Build.props` activa `TreatWarningsAsErrors`, `Nullable` e `ImplicitUsings` globalmente.
- Tests: xUnit. `tests/Domain.Tests` referencia **solo** `backend/Domain` (no ve Application ni
  Infrastructure). `tests/Integration.Tests` usa PostgreSQL real, no EF InMemory.
- Scripts de verificación (PowerShell, requieren el entorno del usuario): `scripts/Test.ps1`,
  `scripts/Test-E2E.ps1`.
- Frontend: React + TypeScript + Vite, TanStack Query, React Hook Form, Zod.

## Flujo de especificaciones

- Las specs viven en `specs/` con estado en la cabecera (`**Estado:**`). `specs/.spec-config.yml`
  tiene `AutoCreateBranch: true`.
- Las specs aprobadas se implementan con el skill `spec-impl`, en rama `spec-NN-slug`.

## SPEC 02 (editor de actividades MVP) — en curso

Estado detallado y punto de reanudación: `.workbuddy-ai/memory/2026-09-23.md` (última sección).
Resumen: rama `spec-02-editor-de-actividades-mvp`, modo `step`, etapas **1 y 2 de 10 hechas**
(dominio). Siguiente: **etapa 3**, la migración `AddCalculatedLessonDuration`. Baseline:
`Domain.Tests` 55/55 verde; `Integration.Tests` 42/78 — los 36 fallos son solo
`CK_Lesson_Duration` rechazando el total `0`, y la etapa 3 los resuelve.
