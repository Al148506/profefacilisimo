# MEMORY.md — Profefacilisimo

Notas de proyecto con valor duradero. Los detalles diarios van en `YYYY-MM-DD.md`.

## Entorno de build

- **`dotnet restore` no funciona desde bash** (`Value cannot be null. (Parameter 'path1')`;
  `dotnet --info` lanza `TypeInitializationException`). El entorno restringe las API de Windows.
  **Usar siempre `--no-restore`** (los `obj/project.assets.json` ya existen). No añadir
  `PackageReference` nuevas: sin restore no se resolverían. No es un problema del repo.
- **El tool de PowerShell no devuelve stdout.** Redirigir a fichero y leerlo con la herramienta de lectura.
- `cmd.exe` está bloqueado desde bash por política de seguridad.
- **Bloqueo de ficheros**: con una API en ejecución o Visual Studio abierto, `backend/Api` falla con
  `MSB3021/MSB3027` al copiar las DLLs. Son fallos de copia, no de compilación: verificar con
  `dotnet build backend/Infrastructure/Infrastructure.csproj --no-restore`.
- **`netstat`/`taskkill` con PID no son fiables**: el PID no siempre es el dueño. Para parar la API:
  `Get-Process Api | Stop-Process -Force`.
- **El entorno crea commits automáticamente.** Un árbol limpio no significa que no se haya commiteado nada.

## Convenciones del repo

- .NET 9 (`global.json` → SDK 9.0.318), cuatro capas: Domain / Application / Infrastructure / Api.
- `Directory.Build.props` activa `TreatWarningsAsErrors`, `Nullable` e `ImplicitUsings` globalmente.
- Frontend: React + TypeScript + Vite, TanStack Query, React Hook Form, Zod. El `tsconfig.json` solo
  incluye `src`, así que `e2e/` queda fuera de `tsc -b` (hueco conocido).
- Nomenclatura CSS: kebab-case con prefijo por área (`lesson-*`, `activity-*`, `player-activity-*`).
- Scripts de verificación (PowerShell, requieren el entorno del usuario): `scripts/Test.ps1`,
  `scripts/Test-E2E.ps1`.

## Tests

- `tests/Domain.Tests` referencia **solo** `backend/Domain`. `tests/Integration.Tests` usa PostgreSQL real
  (`localhost:5432`, credenciales en `.tools/local-settings.json`, no versionado), **no** EF InMemory.
  ```bash
  TEST_DATABASE_CONNECTION='<ConnectionString>' \
    dotnet test tests/Integration.Tests/Integration.Tests.csproj --no-restore
  ```
- **`IClassFixture` crea una base `pf_test_*` por CLASE de test, no por test.** Dos tests que insertan
  filas en la misma clase se contaminan entre sí (rompen los `CountAsync`): ponerlos en clases distintas.
- **EF Core — hijos nuevos en un padre existente**: si el padre está `Unchanged` y la clave Guid del hijo
  ya viene puesta (`ValueGeneratedOnAdd`), EF los marca `Modified` → `UPDATE` en vez de `INSERT` →
  `DbUpdateConcurrencyException` (0 filas). Añadirlos explícitamente (`db.Activities.AddRange(...)`) o
  dentro de un padre también nuevo. `LessonService.UpdateAsync` debe marcar `Added` las creadas por
  `Lesson.ApplyActivities`.
- **jsdom no implementa el scroll**: `Element.prototype.scrollTop` (accesorio) sí, pero **no** `scrollTo`
  ni `scrollIntoView` (`window.scrollTo` sí existe). Usar `elemento.scrollTop = 0` en producción y
  verificar con un accesorio propio (`Object.defineProperty(el, 'scrollTop', { set })`).
- **`toHaveTextContent` normaliza el espacio en blanco**: no ve el `gap` de flex, así que `'A · B'` falla
  contra `'A·B'`. Afirmar los separadores como elementos, no como texto.
- **Playwright, locators**: `getByLabel('Pregunta 1')` también casa con `aria-label="Quitar pregunta 1"`
  → usar `{ exact: true }`. `getByText` en strict mode puede casar dos nodos si el total coincide con una
  duración de actividad → anclar al nodo correcto (`getByText('Duración total:')`, `.activity-duration`).
- Los specs E2E escriben capturas en `.tools/` (ignorado por git): convención del repo.
- Si la ejecución falla deja artefactos en `frontend/test-results/`: borrarlos en un turno aparte (el
  sandbox bloquea borrados masivos >50 ficheros en el mismo turno). Playwright lo vacía solo al terminar bien.

## TRAMPA: selectores de ELEMENTO en `styles.css`

`styles.css` (~línea 5) define `header { max-width: 1200px; margin: auto; padding: 28px 32px; ... }` para
el masthead de `App.tsx`. El reproductor usa `<header className="lesson-player-header">`, que **también es
un `<header>`** → heredaba `margin: auto` y se centraba (medido: `marginLeft: 502px`).

**Regla**: antes de estilar `header`, `footer`, `main`, `h1`, `p`, `a`, `button` o `small`, comprobar si
hay una regla de elemento aplicable. Las clases no protegen de los selectores de elemento. Arreglo:
`margin: 0; max-width: none`. Se encontró **midiendo en navegador real** con Playwright +
`getComputedStyle`/`getBoundingClientRect()`, no razonando sobre el CSS (tres hipótesis previas fueron falsas).

## Flujo de especificaciones

- Las specs viven en `specs/` con estado en la cabecera (`**Estado:**`). `specs/.spec-config.yml` tiene
  `AutoCreateBranch: true`. Las specs aprobadas se implementan con el skill `spec-impl`, en rama `spec-NN-slug`.
- **Specs paralelas** (`*-parallel.md`, generadas por `multi-ag-spec`): `spec-impl` derivaría la rama del
  nombre del fichero (`spec-03-...-parallel`), pero **manda §5 del plan**: rama de integración `spec-NN-slug`
  desde `main`, y una rama `spec-NN-slug--<flujo>` por flujo. Sin worktree con una sola sesión (§1 del plan
  lo autoriza: ejecutar los flujos en secuencia sobre ramas). El estado de la spec paralela es independiente
  del de la original.
- **Skill `/spec`**: mandaba leer `template.md` «en la misma carpeta que este skill»; no existía y se creó
  en `~/.workbuddy-ai/skills/spec/template.md` con la estructura de spec de este repo.

## Trabajo paralelo multiagente (worktrees) — resumen

- **Un worktree nuevo NO compila tal cual**: `.gitignore` excluye `obj/`, `bin/`, `node_modules/`, `.tools/`
  y `test-results/`. Bootstrap: copiar `obj/` de cada proyecto .NET desde el checkout principal y verificar
  con `dotnet build backend/Infrastructure/Infrastructure.csproj --no-restore` **dentro** del worktree;
  copiar `.tools/local-settings.json`; `cp -r frontend/node_modules` (186 MB / 11 213 ficheros, sin red).
- `git worktree add` es seguro con el checkout principal ocupado. Limpieza: `git worktree remove` +
  `git worktree prune` (nunca `rm -rf`).
- **Los worktrees aíslan el sistema de ficheros, no la sesión**: dos subagentes de una misma sesión
  comparten `cwd` y checkout. El paralelismo real exige **una sesión por worktree**.
- **Escritor único**: `backend/Infrastructure/Migrations/` y `AppDbContextModelSnapshot.cs` no admiten dos
  escritores. Dos agentes ejecutando Playwright chocan de puerto (E2E serializado).

## Verificar el frontend con un navegador real (receta)

```bash
# 1. Base desechable + migraciones (dotnet ef EXIGE Jwt__SigningKey, no solo la cadena de conexión)
docker compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" pf_e2e'
ConnectionStrings__Default='Host=localhost;Port=5432;Database="pf_e2e";Username="profefacilisimo";Password="..."' \
Jwt__SigningKey='<SigningKey de .tools/local-settings.json>' ASPNETCORE_ENVIRONMENT=Development \
  ~/.dotnet/tools/dotnet-ef database update --project backend/Infrastructure --startup-project backend/Api --no-build

# 2. API dedicada en el puerto del proxy de Vite (5080). ARRANCARLA ANTES que Playwright, o el proxy da
#    ECONNREFUSED y /api/auth/register un 500 falso.
dotnet run --project backend/Api --no-build --no-launch-profile --urls http://localhost:5080   # background

# 3. Runner de Playwright (arranca Vite él mismo vía webServer de playwright.config.ts)
cd frontend && npx playwright test --reporter=list
```

- Al terminar: `Get-Process Api | Stop-Process -Force` y
  `dropdb --if-exists --force -U "$POSTGRES_USER" pf_e2e`.
- **Si el sandbox bloquea la limpieza de `frontend/test-results`, `playwright test` falla**: alternativa es
  un script suelto en `frontend/` con `import { chromium } from '@playwright/test'` y `node script.mjs`.
  Evitar crear temporales dentro del repo (umbral de borrado masivo: 50 ficheros).
- CORS: 201 con `Origin` + `X-Requested-With`; 403 sin ellas (`"Origen de solicitud no permitido."`).
- **`netstat`/`taskkill` con PID no son fiables**: para parar la API de pruebas, matar por nombre.

## Estado de las specs

- **SPEC 01** (gestión de clases): implementada y aprobada. `last write wins` (sin `Lesson.Version` ni ETag).
- **SPEC 02** (editor de actividades MVP): **cerrada y validada 2026-09-23**, en `main`. 10 etapas y los
  30 criterios de §11 verificados. Baseline: build 0/0, `Domain.Tests` 55/55, `Integration.Tests` 101/101,
  frontend 57/57, `tsc -b` y `eslint .` limpios, **E2E 4/4**. Informe: `docs/spec-02-validation-report.md`.
- **SPEC 03** (reproductor de clases): implementada y en `main` (PR #2, `fd69352`). **No toca el backend**:
  es solo lectura sobre el contrato de SPEC 01 + 02.
  - Flujos fusionados: `--contract`, `--activity-view` (B), `--player` (A), `--entry-styles` (C).
  - Ruta `/lessons/:id/play` en `App.tsx`; entrada «Iniciar clase» en `LessonsPage.tsx`.
  - **Pendiente**: Flujo D (docs), E2E del reproductor (`e2e/lesson-player.spec.ts`) y criterio de 390 px (I4).

### Decisiones de SPEC 02 (no reabrir sin motivo)

- El constructor de `Lesson` **no** acepta duración: el total siempre se calcula (0 sin actividades, suma
  si están completas, `null` si falta alguna). `ApplyActivities` valida todo el conjunto antes de mutar.
- `Activity.Update` **no** refresca el total del agregado; lo hace `Lesson.ApplyActivities`.
- Metadatos en RHF, actividades en `useState`. `draftFingerprint` excluye `key` (regenerar claves tras
  guardar no es un cambio del profesor). Los errores se re-validan al editar.
- Duración fraccionaria: `int` de extremo a extremo. El contenido específico se valida pero **no** se recorta.
- `CK_Lesson_Duration` admite `0` desde `AddCalculatedLessonDuration`; `CK_Activity_Duration` sigue siendo
  `IS NULL OR > 0`, así que un `0` por actividad no puede existir en la base.

### Decisiones de SPEC 03 (no reabrir sin motivo)

- **La posición no vive en estado**: se lee de `?actividad` en cada render (recarga, Atrás y URL a mano
  pasan por el mismo camino). Base 1; `?actividad=fin` es la pantalla de cierre.
- Un parámetro **presente pero inválido** se reemplaza por la forma canónica (`abc` → `1`, `03` → `3`); uno
  **ausente** no se toca. Normalizar usa `replace`.
- Los listeners de teclado se registran solo con una actividad en pantalla (inertes en cierre/vacío/error).
- El cierre es un bloque propio, no la cabecera (Editar vive en la cabecera).
- **Clases del reproductor = listas de C3 de la spec**, no del marcado: 15 son clases CSS y
  `player-activity-title` / `player-activity-duration` son `data-testid` de E2E sin `className` (el CSS les
  apunta como descendientes de `.lesson-player-header`). La clase de las instrucciones es
  `player-activity-instructions` (`player-instructions` es el `data-testid`).
- Cabecera en fila: `.lesson-player-heading` (badge → `h1` → metadatos) + `.lesson-player-tools`
  (`margin-left: auto`). El título de actividad **no** es un `<h2>`: es metadato secundario en
  `.lesson-player-meta`. `.lesson-player-body { max-height: 60vh; overflow-y: auto }` es el scroll interno
  que el Flujo A verifica: no convertirlo en contenedor flex.
- El tipo de actividad sale de `ACTIVITY_TYPE_LABELS` (`lesson-schema.ts`); no hay mapa nuevo.

### Lección de integración (specs paralelas)

Mientras los flujos vivan en ramas separadas, **un enlace puede existir sin su ruta**: el Flujo C añadió
«Iniciar clase» y el Flujo A registró la `<Route>`, pero la rama de A no estaba fusionada → «Página no
encontrada» en `/lessons/:id/play`. Tests verdes por separado no lo detectan (cada suite prueba su mitad).
Es el «Riesgo I2» del plan. Humo rápido: `curl -s http://localhost:5173/src/App.tsx | grep play`.

### Nota para correcciones de diseño (CSS)

`.card` fija `width: min(100%, 470px)`; `.lesson-player` tuvo que sobrescribirlo. Los bloques de estilos del
reproductor viven al final de `styles.css`. Los flujos de SPEC 03 ya están fusionados, así que `styles.css`
vuelve a tener un único escritor y sustituir reglas del reproductor es trabajo de integración legítimo.

## Lote de correcciones de diseño (rama `design-fixes`) — reglas del usuario

Cada corrección se entrega en **su propia rama hija de `design-fixes`**, no acumulada en ella.

**Reglas vigentes para todo este lote** (pedidas expresamente el 2026-09-25):

- **No crear ni actualizar tests unitarios ni E2E.**
- **No ejecutar la suite completa** de pruebas.
- **No hacer validaciones manuales automatizadas en navegador** (Playwright, sondas).
- **Verificar solo compilación y errores de TypeScript.** Para el frontend: `npx tsc -b` y
  `npx vite build` (el segundo es el que demuestra que el proyecto compila de verdad).
- Si un test existente falla por el cambio de interfaz, **documentarlo sin modificarlo**.
- Priorizar velocidad de iteración sobre cobertura.

Consecuencia práctica: los tests del editor (`LessonEditorPage.test.tsx`) y los E2E
(`lessons.spec.ts`, `lesson-builder.spec.ts`) quedan **desincronizados a propósito** de la interfaz.
Sus causas raíz están en `docs/wizard-2-pasos-affected-tests.md`.

### Cambio 1 — «Crear clase» en wizard de 2 pasos

Rama `feat/crear-clase-wizard-2-pasos`. Nuevos `editor-steps.ts` y `StepIndicator.tsx`; modificados
`LessonEditorPage.tsx` y `styles.css`. Decisiones clave:

- El **paso vive en `useState`**; una recarga vuelve al paso 1. No va en la URL.
- **`carriedStep`** (variable de módulo) sobrevive al remount que provoca crear una clase: guardar una
  nueva navega a `/lessons/:id/edit`, que monta un editor distinto. Sin eso el profesor vuelve al paso 1
  justo después de guardar. Se consume al montar y se resetea en un `useEffect`.
- `legend` necesita regla explícita de tamaño: al sacarlo de `.activity-section` perdió el estilo.
- El contrato de guardado **no cambia**: una sola petición en el paso 2 y validación del conjunto.



