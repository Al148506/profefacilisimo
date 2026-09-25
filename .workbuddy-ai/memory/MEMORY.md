# MEMORY.md — Profefacilisimo

Notas de proyecto con valor duradero. Los detalles diarios van en `YYYY-MM-DD.md`.

## Entorno de build (importante)

- **`dotnet restore` no funciona desde la shell bash**: NuGet falla con
  `error: Value cannot be null. (Parameter 'path1')`; `dotnet --info` lanza `TypeInitializationException`
  en `Microsoft.DotNet.Installer.Windows.InstallerBase`. El entorno restringe APIs de Windows
  (carpetas conocidas / registro). No es un problema del repo.
- **Solución**: usar siempre `--no-restore` (los `obj/project.assets.json` ya están presentes).
  No añadir `PackageReference` nuevas: sin restore no se resolverían.
- **El tool de PowerShell no devuelve stdout.** Redirigir a fichero y leerlo con la herramienta de lectura.
- `cmd.exe` está bloqueado desde bash por política de seguridad.
- **Bloqueo de ficheros**: si hay una API en ejecución o Visual Studio abierto, `backend/Api` falla con
  `MSB3021/MSB3027` al copiar `Domain.dll`/`Application.dll`/`Infrastructure.dll` a `backend/Api/bin`.
  Son fallos de copia, no de compilación: verificar con
  `dotnet build backend/Infrastructure/Infrastructure.csproj --no-restore`.
- **El entorno crea commits automáticamente.** No asumir que un árbol limpio significa que no se ha
  commiteado nada.

## Tests

- `tests/Domain.Tests` referencia **solo** `backend/Domain`. `tests/Integration.Tests` usa PostgreSQL real
  (`localhost:5432`, credenciales en `.tools/local-settings.json`, no versionado), **no** EF InMemory.
  ```bash
  TEST_DATABASE_CONNECTION='<ConnectionString>' \
    dotnet test tests/Integration.Tests/Integration.Tests.csproj --no-restore
  ```
- **`IClassFixture` crea una base `pf_test_*` por CLASE de test, no por test.** Dos tests que insertan
  filas en la misma clase se contaminan entre sí (rompen los `CountAsync`): ponerlos en clases distintas.
- **EF Core**: añadir hijos nuevos a un padre **ya existente** (`Unchanged`) los marca `Modified` en vez
  de `Added` (claves Guid `ValueGeneratedOnAdd` ya puestas) → `UPDATE` en vez de `INSERT` →
  `DbUpdateConcurrencyException` (0 filas). Añadirlos explícitamente (`db.Activities.AddRange(...)`) o
  dentro de un padre también nuevo.
- **jsdom no implementa el scroll**: define `Element.prototype.scrollTop` (accesorio) pero **no**
  `scrollTo` ni `scrollIntoView`. Usar `elemento.scrollTop = 0` en producción y verificar con un
  accesorio propio (`Object.defineProperty(el, 'scrollTop', { set })`).

## Trabajo paralelo multiagente (worktrees)

- **Un worktree nuevo NO compila tal cual.** `.gitignore` excluye `**/obj/`, `**/bin/`,
  `**/node_modules/`, `.tools/` y `**/test-results/`. Bootstrap antes de dárselo a un agente:
  1. Artefactos .NET: intentar `dotnet restore`; si falla (lo esperado), copiar `obj/` desde el checkout
     principal para `backend/{Domain,Application,Infrastructure,Api}` y
     `tests/{Domain.Tests,Integration.Tests}`, y **verificar** con
     `dotnet build backend/Infrastructure/Infrastructure.csproj --no-restore` **dentro** del worktree.
     `project.assets.json` guarda un `projectPath` absoluto; el fallback suele funcionar (carpeta NuGet
     compartida) pero no está garantizado.
  2. `.tools/local-settings.json` → copiar. Lo necesitan los tests de integración y `dotnet ef`.
  3. `frontend/node_modules` → `cp -r` desde el checkout principal (verificado: 186 MB / 11 213
     ficheros, unos minutos, sin red, el recuento final coincide). `npm ci` es la alternativa.
- **`git worktree add` es seguro con el checkout principal ocupado** por otra sesión: no toca su árbol de
  trabajo. Antes de trabajar, comprobar en qué rama está el checkout principal: si está en una rama de
  flujo con ficheros sin commitear, hay que ir a un worktree, no tocar el checkout.
- **Aislamiento**: los worktrees aíslan el sistema de ficheros, no la sesión del agente. Los subagentes de
  una misma sesión comparten `cwd` y checkout, así que el paralelismo real exige **una sesión por
  worktree** (o ejecutar los carriles en secuencia sobre ramas).
- **Recursos de escritor único** (specs con backend): `backend/Infrastructure/Migrations/` y
  `AppDbContextModelSnapshot.cs` no admiten dos escritores — el snapshot se regenera entero y el conflicto
  no se puede resolver a mano.
- **Playwright y puertos**: `playwright test` arranca Vite por su cuenta (`webServer`) y la API de pruebas
  usa el 5080. Dos agentes ejecutando E2E a la vez chocan: serializar el E2E.
- Limpieza: `git worktree remove <ruta>` + `git worktree prune`. Nunca `rm -rf` sobre un worktree (deja
  metadatos huérfanos en `.git/worktrees`).

## Convenciones del repo

- .NET 9 (`global.json` → SDK 9.0.318), cuatro capas: Domain / Application / Infrastructure / Api.
- `Directory.Build.props` activa `TreatWarningsAsErrors`, `Nullable` e `ImplicitUsings` globalmente.
- Frontend: React + TypeScript + Vite, TanStack Query, React Hook Form, Zod. El `tsconfig.json` solo
  incluye `src`, así que `e2e/` queda fuera de `tsc -b`.
- Scripts de verificación (PowerShell, requieren el entorno del usuario): `scripts/Test.ps1`,
  `scripts/Test-E2E.ps1`.

## Flujo de especificaciones

- Las specs viven en `specs/` con estado en la cabecera (`**Estado:**`). `specs/.spec-config.yml` tiene
  `AutoCreateBranch: true`. Las specs aprobadas se implementan con el skill `spec-impl`, en rama
  `spec-NN-slug`.
- **Specs paralelas** (las `*-parallel.md` que genera `multi-ag-spec`): `spec-impl` derivaría la rama del
  nombre del fichero (`spec-03-reproductor-de-clases-parallel`), pero §5 del plan nombra sus propias
  ramas. **Manda el plan**: rama de integración `spec-NN-slug` desde `main`, y una rama
  `spec-NN-slug--<flujo>` por flujo. Sin worktree si hay una sola sesión — el propio §1 del plan lo
  autoriza (ejecutar los flujos en secuencia sobre ramas). El estado de la spec paralela es independiente
  del de la original: aprobar una no aprueba la otra.

## SPEC 02 (editor de actividades MVP) — cerrada y validada 2026-09-23

Diez etapas implementadas y los 30 criterios de aceptación (§11) validados. Baseline:
`dotnet build Profefacilisimo.slnx --no-restore` 0 errores / 0 advertencias, `Domain.Tests` 55/55 ✓,
`Integration.Tests` 101/101 ✓, frontend 57/57 ✓, `tsc -b` y `eslint .` limpios, **E2E 4/4 ✓**
(`lesson-builder`, `lessons` ×2, `session`).

## Verificar el frontend con un navegador real (receta)

```bash
# 1. Base desechable + migraciones (dotnet ef EXIGE Jwt__SigningKey, no solo la cadena de conexión)
docker compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" pf_e2e'
ConnectionStrings__Default='Host=localhost;Port=5432;Database="pf_e2e";Username="profefacilisimo";Password="..."' \
Jwt__SigningKey='<SigningKey de .tools/local-settings.json>' ASPNETCORE_ENVIRONMENT=Development \
  ~/.dotnet/tools/dotnet-ef database update --project backend/Infrastructure --startup-project backend/Api --no-build

# 2. API dedicada en el puerto que usa el proxy de Vite por defecto (5080)
dotnet run --project backend/Api --no-build --no-launch-profile --urls http://localhost:5080   # background

# 3. Runner de Playwright (arranca Vite él mismo vía webServer de playwright.config.ts)
cd frontend && npx playwright test --reporter=list
```

- Al terminar: parar la API y `dropdb --if-exists --force -U "$POSTGRES_USER" pf_e2e`.
- Playwright: `getByLabel('Pregunta 1')` también casa con el `aria-label` «Quitar pregunta 1` →
  usar `{ exact: true }`.
- `getByText` en strict mode puede casar dos nodos si el total coincide con una duración de actividad:
  anclar al nodo correcto (`getByText('Duración total:')`, `.activity-duration`).
- Los specs E2E escriben capturas en `.tools/` (ignorado por git): convención del repo.
- Si la ejecución falla deja muchos artefactos en `frontend/test-results/`: borrarlos en un turno aparte
  (el sandbox bloquea borrados masivos >50 ficheros en el mismo turno). Playwright lo vacía solo cuando la
  ejecución termina bien.

## SPEC 03 — estado de las ramas

`spec-03-reproductor-de-clases` es la rama de **integración**; cada flujo tiene la suya
(`--contract`, `--activity-view`, `--player`, `--entry-styles`, `--docs`) y se fusionan en ese orden. El
plan completo está en `specs/03-reproductor-de-clases-parallel.md`.

- **`contract` y `activity-view` (B) fusionados** en integración (commit `e1954f4`).
- **Flujo A (`--player`) implementado** — `LessonPlayerPage.tsx` (191 líneas), `player-position.ts` (51)
  y sus dos suites (405 líneas). **Sí registra la ruta** `/lessons/:id/play` en `App.tsx`.
- **Flujo C (`--entry-styles`) implementado**: «Iniciar clase» en el listado + 40 líneas nuevas de
  estilos del reproductor. `tsc`, `eslint`, frontend 70/70 ✓. Queda el criterio de 390 px para I4.
- **`D:/Freelance/pf-wt-contract` tiene un stub de `ActivityView.tsx` sin commitear** (1118 bytes). Si se
  commitea y fusiona dará «both added» contra la implementación del Flujo B: **gana B**.
- **`ActivityView.tsx` y `styles.css` son recursos de escritor único** del plan (B y C respectivamente);
  A solo los lee.
- **Clases del reproductor = listas de C3 de la spec**, no del marcado: 15 son clases CSS y
  `player-activity-title` / `player-activity-duration` son `data-testid` de E2E (no se estilizan).
  `player-instructions` es `data-testid`; la clase de las instrucciones es `player-activity-instructions`.
- **C3 y C5 viven en la fila «C3 · Frontera DOM/CSS» de la tabla de la spec** (línea ~88), no en un
  apartado `## 3`: buscar por el nombre de la clase, no por el número de sección.

## El bug «Iniciar clase → Página no encontrada» (2026-09-24)

**Síntoma**: pulsar «Iniciar clase» llevaba a `/lessons/:id/play` y respondía «Página no encontrada»
(el comodín `path="*"` de `App.tsx`).

**Causa**: **el Flujo A no estaba fusionado**. El enlace lo añadió el Flujo C, pero la `<Route>` la
registra quien la sirve, y esa rama (`--player`) estaba sin fusionar. El checkout principal corría en
`--entry-styles`, cuyo `App.tsx` aún no conocía la ruta. La implementación existía y estaba probada: era
un fallo de **integración**, no de código.

**Descartadas**: la ruta no estaba mal escrita, el componente no estaba montado en otro sitio y Vite no
tenía nada que recargar (reiniciarlo no habría arreglado nada: el módulo no existía en el árbol).

**Lección (aplicable a toda spec paralela)**: mientras los flujos vivan en ramas separadas, un enlace
puede existir sin su ruta. Los tests de componente verdes por separado **no** lo detectan — cada suite
prueba su mitad. Es exactamente el «Riesgo I2» de §6 del plan: hay que comprobarlo en navegador real.
Para reproducirlo rápido: `curl -s http://localhost:5173/src/App.tsx | grep play`.

## Lote de correcciones de diseño (rama `design-fixes`) — reglas del usuario

Cada corrección se entrega en **su propia rama hija de `design-fixes`**, no acumulada en ella.

**Reglas vigentes para todo este lote** (pedidas el 2026-09-25):

- **No crear ni actualizar tests unitarios ni E2E.**
- **No ejecutar la suite completa** de pruebas.
- **No hacer validaciones manuales automatizadas en navegador** (Playwright, sondas).
- **Verificar solo compilación y errores de TypeScript**: `npx tsc -b`, `npx vite build`,
  `npx eslint .`. El build es el que demuestra que el proyecto compila de verdad.
- Si un test existente falla por el cambio de interfaz, **documentarlo sin modificarlo**.
- Priorizar velocidad de iteración sobre cobertura.

Consecuencia: los tests del editor y los E2E quedan **desincronizados a propósito** de la interfaz.
Causas raíz en `docs/wizard-2-pasos-affected-tests.md` y `docs/sweetalert2-affected-tests.md`.

### Cambio 1 — «Crear clase» en wizard de 2 pasos

Rama `feat/crear-clase-wizard-2-pasos`. Nuevos `editor-steps.ts` y `StepIndicator.tsx`; modificados
`LessonEditorPage.tsx` y `styles.css`. Decisiones clave:

- El **paso vive en `useState`**; una recarga vuelve al paso 1. No va en la URL.
- **`carriedStep`** (variable de módulo) sobrevive al remount que provoca crear una clase: guardar una
  nueva navega a `/lessons/:id/edit`, que monta un editor distinto. Sin eso el profesor vuelve al paso 1
  justo después de guardar. Se consume al montar y se resetea en un `useEffect`.
- El avance de paso se bloquea con `form.trigger()`; `onSubmit` revalida y, si falla, fuerza el paso 1.
- `legend` necesita regla explícita: al sacarlo de `.activity-section` perdió el estilo.
- El contrato de guardado **no cambia**: una sola petición en el paso 2, validación del conjunto.

### Cambio 2 — Notificación SweetAlert2 al guardar

Misma rama. `frontend/src/notifications.ts` (**nuevo**) concentra todas las alertas; el editor solo
llama a `notifyLessonSaved()` / `notifyLessonSaveFailed(message)` desde los callbacks de la mutación.

- **`sweetalert2` no estaba en el proyecto**. Instalado.
- El tema va en `styles.css` (`.pf-alert`), no en `customClass` de JS: colores junto a las variables que
  imitan. En JS solo `confirmButtonColor`.
- **Trampa de tipado**: `Parameters<typeof Swal.fire>[0]` resuelve a la sobrecarga de `string` y `tsc`
  falla con TS2698/TS2345. Importar `SweetAlertOptions` como tipo.
- **Trampa de `npm install`**: reformatea `package.json` y `package-lock.json` enteros (expande
  `engines`, borra ~47 líneas de `libc`). Restaurar con `git checkout` + editar el bloque a mano y
  regenerar con `npm install --package-lock-only`. **Con árbol sucio, revisar siempre el diff del lock:
  el ruido de formato esconde el cambio real.**
- **La alerta no se cierra sola**: en los E2E se interpone entre guardado y guardado y puede interceptar
  clics; `Swal.fire` mueve el foco, lo que puede romper tests que espían `window.confirm` justo después
  de guardar. Riesgo abierto en `docs/sweetalert2-affected-tests.md`.

### Cambio 3 — Botón secundario «Editar clase» en la lista

Rama `feat/boton-editar-clase`. Solo `LessonsPage.tsx` y `styles.css`. El enlace de texto
`Editar {titulo}` pasa a botón secundario; el orden ya era el correcto
(`[Iniciar clase] [Editar clase] [Duplicar] [Enviar a papelera]`).

- **No existía el patrón «enlace secundario»**: `button.secondary` es selector de **elemento**, así que
  un `<Link className="button secondary">` salía relleno. Se generalizó a
  `button.secondary, .button.secondary`. Primera aparición: si surgen más enlaces secundarios, este es
  el patrón establecido. (Ejemplo de la trampa de selectores de elemento documentada arriba.)
- Etiqueta visible `Editar clase`; el título va en `aria-label` (contexto accesible). El E2E
  `lessons.spec.ts:79` sigue válido porque el `aria-label` resuelve a «Editar Clase editada».
  `LessonsPage.test.tsx` no afirma nada sobre ese enlace → **ningún test se rompe**.
