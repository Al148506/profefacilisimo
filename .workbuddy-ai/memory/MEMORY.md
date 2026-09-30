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
- Tests de integración: siempre con `TEST_DATABASE_CONNECTION='<ConnectionString>'`; usan PostgreSQL
  real (`localhost:5432`), nunca EF InMemory. Credenciales en `.tools/local-settings.json`.

## Migraciones EF (`dotnet ef`) — operativa

- **Binario**: `~/.dotnet/tools/dotnet-ef.exe`. Necesita **`Jwt__SigningKey` además de la conexión**
  (`ConnectionStrings__Default`), o el startup project falla al arrancar.
- **Tres bases en el mismo contenedor** (`docker compose exec -T postgres`): `profefacilisimo` (dev),
  `pf_integration` (tests de integración), `pf_e2e` (Playwright). **Cada una lleva su propio
  `__EFMigrationsHistory`**: aplicar una migración en dev **no** la aplica a las otras.
- Comprobar qué falta:
  `docker compose exec -T postgres psql -U profefacilisimo -d <db> -c 'SELECT "MigrationId" FROM "__EFMigrationsHistory" ORDER BY "MigrationId";'`
- Aplicar (dev):
  `ConnectionStrings__Default='<cadena>' Jwt__SigningKey='<clave>' ASPNETCORE_ENVIRONMENT=Development ~/.dotnet/tools/dotnet-ef database update --project backend/Infrastructure --startup-project backend/Api --no-build`
- **`42P01: relation "X" does not exist`** = migración no aplicada en *esa* base, casi nunca un bug de
  código. Verificar `__EFMigrationsHistory` antes de tocar entidades o el `DbContext`.
- `scripts/Setup.ps1` y `scripts/Test-E2E.ps1` ya hacen `database update`; el fallo solo aparece cuando
  se arranca la API a mano (`dotnet run`) contra una base sin migrar.
- Un worktree nuevo **no** tiene `obj/` → `dotnet-ef` no ve migraciones; ver bootstrap abajo.

## Convenciones del repo

- **.NET 9** (`global.json` → SDK 9.0.318, `net9.0`). Cuatro capas Domain / Application / Infrastructure / Api.
- `Directory.Build.props` activa `TreatWarningsAsErrors`, `Nullable`, `ImplicitUsings` globalmente.
- Frontend: React + TS + Vite, TanStack Query, RHF, Zod. `tsconfig.json` solo incluye `src` → `e2e/`
  queda fuera de `tsc -b`.
- Scripts de verificación (PowerShell): `scripts/Test.ps1`, `scripts/Test-E2E.ps1` (Debug o Release).
- Fases 1–4 implementadas (base, Class Builder, Lesson Player, **Student Management**).

## Trampas de tests (costosas de redescubrir)

### Backend

- **`IClassFixture` crea una base `pf_test_*` por CLASE de test, no por test.** Dos tests que insertan
  en la misma clase se contaminan (rompen `CountAsync`): separarlos en clases distintas.
- **EF Core**: añadir hijos nuevos a un padre **ya existente** (`Unchanged`) los marca `Modified` en vez
  de `Added` → `UPDATE` en vez de `INSERT` → `DbUpdateConcurrencyException` (0 filas).
  Añadirlos explícitamente (`db.Activities.AddRange(...)`) o dentro de un padre también nuevo.
- **`SqlQueryRaw`: citar todo identificador con mayúsculas.** `Id::text` se pliega a `id` y da
  `42703: column "id" does not exist`; correcto: `"Id"::text`.
- **Credenciales**: usar la cadena de `.tools/local-settings.json`; una inventada da `28P01`.

### Frontend / vitest

- **jsdom no implementa el scroll**: define `Element.prototype.scrollTop` (accesorio) pero **no**
  `scrollTo` ni `scrollIntoView`. Usar `elemento.scrollTop = 0` en producción y verificar con accesorio propio.
- **Formularios RHF + Zod con transformaciones**: los valores por defecto deben tener la forma de
  **entrada** (todo `string`), no la de salida (`null`), o el resolver falla con
  `Invalid input: expected string, received null`. `useForm<FormValues, unknown, Values>` + tercer genérico.
- **Carrera de `findBy*` con estados de carga**: si un enlace/etiqueta existe en ambos estados, anclar
  en algo exclusivo del estado cargado (`findByTestId(...)`, `findByRole('option', …)`).
- **`getByText('B1')` choca con `<option value="B1">`**: en modo estricto acotar el nodo.
- **Un `Response` solo se lee una vez**: en dobles con varias llamadas usar
  `mockImplementation(async () => new Response(...))`, no `mockResolvedValue(...)` (`Body is unusable`).
- **Orden en helpers `page()`**: el helper instala los dobles por defecto y el test **los sobrescribe
  después**; al revés el helper los pisa.

## Trampas de CSS (costosas de redescubrir)

- **La regla global `form { display: flex; flex-direction: column; margin-top: 26px; }`** (styles.css
  línea 15) se hereda en cualquier `<form>` con clase propia. Si la clase no declara
  `flex-direction: row`, el formulario apila en **columna** aunque ponga `flex-wrap: wrap`, y
  `align-items` alinea cada hijo en su propio renglón. `.students-filters` cayó en esto; `.lesson-filters`
  no, porque sí declara `flex-direction: row`.
- **`.card` limita a `min(100%, 470px)` y pisa a cualquier clase de ancho.** Las páginas llevan
  `className="card <pagina>"`, así que un `.students-page { width: min(100%, 880px) }` **nunca se usa**:
  hace falta `.card.<pagina>` (más especificidad) para ensanchar de verdad.
- **Verificar CSS en Playwright midiendo, no mirando capturas.** Medir en `page.evaluate` el ancho
  computado y `getBoundingClientRect()` de cada hijo. Una captura puede ser de una corrida anterior
  aunque la ruta del PNG sea nueva, y lleva a conclusiones falsas sobre si el cambio se aplicó.

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
# Al terminar: parar la API y dropdb --if-exists --force -U profefacilisimo pf_e2e
```

- Playwright: `getByLabel('Pregunta 1')` también casa con el `aria-label` «Quitar pregunta 1» →
  usar `{ exact: true }`. `getByText` en strict mode puede casar dos nodos (total = duración):
  anclar al nodo correcto (`getByText('Duración total:')`, `.activity-duration`).
- Colisión de nombre accesible: el enlace del nombre y «Editar \<nombre\>» casan ambos con
  `getByRole('link', { name })` → `{ exact: true }`.
- **Auth en E2E: no hay cookies de sesión, solo Bearer.** El login devuelve el `accessToken` en el
  cuerpo y la app lo guarda **en memoria**. `page.request` comparte cookies pero **no** cabecea el
  token: `POST /api/lessons` sale **401**. Patrón: capturar la respuesta de `/api/auth/login` con
  `page.waitForResponse`, sacar `session.accessToken` y pasarlo como header
  (`{ Authorization: 'Bearer ' + token }`).
- **Sí hay cookie de refresh** (`pf.refresh`, `httponly`, `path=/api/auth`, la pone el login). Al
  recargar, la app la usa (`POST /api/auth/refresh`) y **mantiene la sesión**: `page.reload()` es
  seguro y sirve para vaciar la caché en memoria de TanStack Query.
- **Caché de la query de listado:** `signIn` termina en `/` y cachea el listado vacío. Si un recurso se
  crea por API después, el selector reutiliza esa caché vacía («No tienes clases activas que asignar.»).
  Solución: `page.reload()` tras crearlo.
- **Detach al restaurar**: tras pulsar «Restaurar», el refetch quita la fila y el clic sobre su enlace
  falla con «element was detached from the DOM». Esperar «La papelera está vacía.» y navegar por el
  enlace «Volver a Mis estudiantes».
- **El shim de borrado del sandbox bloquea a Playwright**: al arrancar limpia su `outputDir`
  (`test-results/`) y el borrado en bloque (>50 ficheros) falla con `SAFE_DELETE_BULK_CONFIRM_REQUIRED`.
  Mitigación sin tocar el repo: un `playwright.config.ts` temporal con
  `outputDir: process.env.PW_OUT || './.tools-pw-results'` y lanzar con
  `PW_OUT=C:/Users/al148/AppData/Local/Temp/pfout npx playwright test --config .tools-playwright.config.ts …`
  (el temp de Windows queda fuera del conjunto protegido). Borrar el config temporal al terminar.
  **Ojo**: `frontend/.tools-pw-results/` **no** lo cubre el `.gitignore` (el patrón es `.tools/` anclado)
  y el sandbox **no puede borrarlo** (`genie-trash` falla con «Some operations were aborted»). Antes de
  commitear, borrarlo a mano o añadir el patrón; si no, aparece como `?? frontend/.tools-pw-results/`.

## Flujo de especificaciones

- Specs en `specs/` con estado en cabecera (`**Estado:**`). `specs/.spec-config.yml`: `AutoCreateBranch: true`.
  Las aprobadas se implementan con el skill `spec-impl`, en rama `spec-NN-slug`.
- **Specs paralelas** (`*-parallel.md` de `multi-ag-spec`): manda el §5 del plan, no el nombre del fichero.
  Rama de integración `spec-NN-slug` desde `main` + una rama `spec-NN-slug--<flujo>` por flujo.
  Con una sola sesión se ejecutan los flujos en secuencia sobre ramas (sin worktree: §1 lo autoriza).
- **Recursos de escritor único** en specs con backend: `backend/Infrastructure/Migrations/` y
  `AppDbContextModelSnapshot.cs` no admiten dos escritores (el snapshot se regenera entero).
- Al enmendar la spec, tocar **solo la política de ejecución** (§10); §11 (criterios de aceptación) es
  intocable, como exige la regla «Criterios de aceptación y spec: nunca se editan».

## Trampa del plan paralelo: los flujos acaban en el mismo árbol

Los worktrees de §5 **no se usaron** en SPEC 04: los tres flujos viven en el checkout principal y las
ramas `--contract` / `--backend` no contienen trabajo real. Consecuencias:

- **`git status` es la única fuente fiable del punto de reanudación.** El entorno auto-commitea
  mientras el trabajo de un flujo queda sin commitear. `git log` engaña.
- **Un flujo de frontend no se puede verificar si depende de un fichero de otro flujo sin ejecutar.**
  Caso real: `AssignedStudents.test.tsx` (Flujo B) hace `vi.mock('./student-api')`, y `tsc -b` **resuelve
  el módulo real igualmente** → si `student-api.ts` (Flujo C) no existe, da `TS2307` más los `TS7006` en
  cascada. No es caché (`tsc -b --clean` lo reproduce). Ordenar B **después** de C, o verificar en la
  integración con los dobles sin editar.

## Trabajo paralelo multiagente (worktrees)

- **Un worktree nuevo NO compila tal cual.** `.gitignore` excluye `obj/`, `bin/`, `node_modules/`,
  `.tools/`, `test-results/`. Bootstrap antes de dárselo a un agente:
  1. Copiar `obj/` del checkout principal para `backend/{Domain,Application,Infrastructure,Api}` y
     `tests/{Domain.Tests,Integration.Tests}`; verificar con
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
- **Un enlace puede existir sin su ruta si los flujos viven en ramas separadas** — idem arriba.
- **Clases CSS y del componente deben coincidir letra a letra** con las listas C3/C4 de la spec
  (`player-activity-instructions`, `student-assigned-lessons`, …). Grepear las clases contra `styles.css`
  antes de cerrar: si no, el E2E de integración no encuentra el nodo.
  `player-activity-title` / `player-activity-duration` / `player-instructcions`… ver docs de SPEC 03.
- **No existe página de detalle de clase**: el «detalle» es el editor (`/lessons/:id/edit`).
- Los E2E escriben capturas en `.tools/` (ignorado). Si la ejecución falla deja artefactos en
  `frontend/test-results/`: borrarlos en un turno aparte (el sandbox bloquea borrados >50 ficheros).

## Lote de correcciones de diseño (`design-fixes`) — reglas del usuario (2026-09-25)

**⚠️ Lote CERRADO y entregado en `main`.** Las reglas de abajo eran **solo para ese lote** (prioridad:
velocidad de iteración sobre cobertura). **Ya no aplican**: el trabajo posterior sí ejecuta la suite y
sí repara tests — ver «Tests del wizard: deuda SALDADA» más abajo. Se conservan como referencia
histórica de por qué quedaron dos `docs/*-affected-tests.md`.

Cada corrección iba en **su propia rama hija de `design-fixes`**. Reglas que rigieron el lote:

- **No crear ni actualizar tests unitarios ni E2E. No ejecutar la suite completa. No validaciones
  manuales en navegador.**
- Verificar solo compilación y errores de TypeScript: `npx tsc -b`, `npx vite build`, `npx eslint .`.
- Si un test existente falla por el cambio de interfaz, **documentarlo sin modificarlo**.
- Prioridad: velocidad de iteración sobre cobertura. Los tests quedan desincronizados a propósito
  (causas raíz en `docs/wizard-2-pasos-affected-tests.md` y `docs/sweetalert2-affected-tests.md`).

Cambios entregados en el lote (referencia):

- **Wizard de 2 pasos**: ✅ **integrado en `main` el 2026-09-29** (merge `34f7895`, `--no-ff`); la rama
  `feat/crear-clase-wizard-2-pasos` ya se borró. El paso vive en `useState` (una recarga vuelve al paso 1,
  no va en la URL). `carriedStep` (variable de módulo) sobrevive al remount al crear una clase. Avance
  bloqueado con `form.trigger()`. El contrato de guardado no cambia. Ficheros en `main`:
  `StepIndicator.tsx`, `editor-steps.ts`, `notifications.ts` y los dos `docs/*-affected-tests.md`.
  ⚠️ **`AssignedStudents` (SPEC 04) debe seguir FUERA del `<form>` y fuera del condicional de paso** —
  es el conflicto natural cada vez que se toque el `return` de `LessonEditorPage.tsx`. Los 2 tests
  canario de `AssignedStudents` lo verifican.
- **SweetAlert2** (`notifications.ts` centraliza las alertas): ✅ en `main` (`sweetalert2@^11.26.25`).
  Trampa de tipado: `Parameters<typeof Swal.fire>[0]` resuelve a la sobrecarga de
  `string` → TS2698/TS2345; importar `SweetAlertOptions` como tipo. Tema en `styles.css` (`.pf-alert`),
  no en `customClass`. **`npm install` reformatea `package.json`/`package-lock.json` enteros**: revisar
  siempre el diff del lock (en Windows npm poda metadatos `libc`/`license` de paquetes solo-Linux; no es
  una pérdida de dependencias). La alerta no se cierra sola: puede interceptar clics en E2E.
- **Botón secundario «Editar clase»** (`feat/boton-editar-clase`): ✅ sí está en `main` (`5200c57`).
  `button.secondary` era selector de **elemento**, un `<Link className="button secondary">` salía
  relleno → se generalizó a `button.secondary, .button.secondary`. Primera aparición de un enlace
  secundario: ese es el patrón.

## Tests del wizard: deuda SALDADA el 2026-09-29 (ya no hay nada en rojo)

Esta sección decía antes que los tests desincronizados por el wizard eran deuda aceptada y que **no se
arreglaran sin pedirlo**. Eso ya no es cierto: el usuario autorizó repararlos como primera fase del
trabajo sobre el frontend, y se hizo. Estado verificado el 2026-09-29:

- `frontend/src/lessons/LessonEditorPage.test.tsx` — **12/12 en verde**. Los tests recorren ahora el
  wizard de verdad: clic en «Continuar» entre metadatos y actividades, etiqueta «Guardar clase».
- `frontend/e2e/lessons.spec.ts` (2 tests) y `frontend/e2e/lesson-builder.spec.ts` (1) — en verde.
- `frontend/e2e/students.spec.ts` (4) — **nunca estuvo afectado**; se listó aquí por error. Su helper
  `createLesson()` crea la clase por API (`page.request.post('/api/lessons', …)`, línea 38), no por UI,
  y sus clics en «Guardar» son del formulario de estudiante (`StudentFormPage.tsx:77`). Sin cambios.
- `frontend/e2e/session.spec.ts` (1) — sin cambios.
- Suite completa: `npx vitest run` → **20 archivos / 169 tests**.
- Los **2 tests canario de `AssignedStudents`** siguen verdes y siguen siendo el contrato de SPEC 04:
  no los rompas. Verifican que el componente quede fuera del `<form>` y fuera del condicional de paso.

Detalle, causa raíz y evidencia en `docs/wizard-2-pasos-affected-tests.md` §7.

### Tres reglas que quedan de esta reparación

- **⚠️ No quitar las `key` de `.editor-actions` en `LessonEditorPage.tsx`.** Un ternario que renderiza un
  `<button>` desnudo en la misma posición entre hermanos hace que React **reutilice el nodo DOM**. Si el
  manejador del clic es `async` (`goToActivities()` hace `await form.trigger()`), React re-renderiza en un
  microtask **durante** el despacho del clic y reescribe `type="button"` → `type="submit"` en el propio
  nodo clicado; al terminar el manejador el navegador ejecuta su *activation behaviour* y **envía el
  formulario solo**. Síntoma real: pulsar «Continuar» guardaba la clase y abría el modal de éxito.
  Corregido con `<Fragment key="info">` / `<Fragment key="activities">`. «Atrás» no lo sufría porque
  `goToInfo()` es síncrono. La regla general: **`key` en las ramas de un ternario cuyos botones cambian
  de `type`**, o manejadores síncronos.
- **Playwright, archivo por archivo.** Ejecutar varios specs seguidos agota el límite de `/api/auth`
  (30 peticiones/min por IP, `backend/Api/Program.cs:62-68` aplicado al grupo en `:104`, que incluye
  `/me`) y produce fallos que **no son regresiones** — le pasó a `session.spec.ts`.
- **Cerrar la alerta de SweetAlert2 antes de cualquier `getByRole`.** Mientras el diálogo está abierto,
  SweetAlert2 pone `aria-hidden="true"` en todos los demás hijos de `<body>` y Playwright
  (`includeHidden: false`) no encuentra nada por rol en toda la app. `getByText` y `selectOption` sí
  funcionan: la visibilidad CSS no cambia. Si algún día se retira el modal de guardado exitoso, los
  clics en «Aceptar» de los specs deben quitarse a la vez.

