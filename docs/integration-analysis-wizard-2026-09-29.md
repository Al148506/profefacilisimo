# Análisis de integración — `feat/crear-clase-wizard-2-pasos` → `main`

**Solo análisis. No se ejecutó merge, rebase, cherry-pick ni commit. El repositorio no se modificó.**

Fecha: 2026-09-29 · Rama actual: `main` (`df8a5a6`)

---

## A. Estado actual

### Relación entre `main` y la feature

```
*   df8a5a6  (HEAD -> main, origin/main)  Merge pull request #3  ← main
|\
| * 18f46d2  Add student migration tests...
| * 8a9bc54  feat(students): add stub for AssignedStudents...
| * b3c9f41  @ spec 04: Student Management...
| * dfca7a6  @ docs: estado de la Fase 4...
| * 3968640  docs(memory): record the design-fixes batch...
| * 5200c57  feat(lessons): boton secundario "Editar clase"...
|/
| * e1b7135  feat: add SweetAlert2 notifications...   ← feature
| * 148c314  feat: implement two-step wizard...        ← feature
|/
*   fd69352  Merge pull request #2  ← merge-base
```

- **Merge-base:** `fd69352` (el merge del PR #2, SPEC 03)
- **Divergencia:** `main` está **7 commits por delante**, la feature **2 por delante** (`7 2`)
- **Estado:** divergencia real, no fast-forward. El merge **creará un commit de merge**, no será
  trivial.

### Commits exclusivos de la feature (2)

| Commit | Asunto |
| --- | --- |
| `148c314` | `feat: implement two-step wizard for lesson creation and editing` |
| `e1b7135` | `feat: add SweetAlert2 notifications for lesson save actions` |

### Commits de `main` posteriores al merge-base (7) — relevantes

De los 7, solo **2 tocan ficheros que la feature también toca**:

| Commit | Toca ficheros compartidos | Qué hizo |
| --- | --- | --- |
| `5200c57` | `styles.css` | `button.secondary` → `button.secondary, .button.secondary` |
| `b3c9f41` | `LessonEditorPage.tsx` | Añadió el import y el montaje de `AssignedStudents` |

Los otros 5 (`dfca7a6`, `3968640`, `8a9bc54`, `18f46d2`, `df8a5a6`) son docs, memoria y la migración
de estudiantes: no tocan los ficheros de la feature.

### Archivos afectados por la feature (12)

| Archivo | Tipo | ¿`main` lo tocó después? |
| --- | --- | --- |
| `frontend/src/lessons/StepIndicator.tsx` | **nuevo** | No |
| `frontend/src/lessons/editor-steps.ts` | **nuevo** | No |
| `frontend/src/notifications.ts` | **nuevo** | No |
| `docs/wizard-2-pasos-affected-tests.md` | **nuevo** | No |
| `docs/sweetalert2-affected-tests.md` | **nuevo** | No |
| `frontend/src/lessons/LessonEditorPage.tsx` | modificado | **SÍ** (+4 líneas) |
| `frontend/src/styles.css` | modificado | **SÍ** (+46 líneas) |
| `frontend/src/main.tsx` | modificado | No |
| `frontend/package.json` | modificado | No |
| `frontend/package-lock.json` | modificado | No |
| `.workbuddy-ai/memory/2026-09-25.md` | modificado | **SÍ** (conflicto) |
| `.workbuddy-ai/memory/MEMORY.md` | modificado | **SÍ** (conflicto) |

---

## B. Cambios que se pueden integrar directamente (sin conflicto)

Estos 8 ficheros se integran limpiamente (el dry-run los marca como `merged`):

1. **`frontend/src/lessons/StepIndicator.tsx`** (nuevo, 32 líneas) — indicador «Paso N de 2». Depende
   solo de `./editor-steps`. Sin dependencias externas.
2. **`frontend/src/lessons/editor-steps.ts`** (nuevo, 17 líneas) — `EDITOR_STEPS`, `EditorStep`,
   `STEP_LABELS`, `stepNumber()`. Módulo puro, sin imports.
3. **`frontend/src/notifications.ts`** (nuevo, 50 líneas) — dos funciones (`notifyLessonSaved`,
   `notifyLessonSaveFailed`) sobre `sweetalert2`. Aislado: nadie más en `main` lo importa.
4. **`docs/wizard-2-pasos-affected-tests.md`** (nuevo, 105 líneas).
5. **`docs/sweetalert2-affected-tests.md`** (nuevo, 87 líneas).
6. **`frontend/src/main.tsx`** (+1 línea) — `import 'sweetalert2/dist/sweetalert2.min.css';`.
   Inserta antes de `./styles.css`. Sin solape.
7. **`frontend/package.json`** (+1 línea) — `"sweetalert2": "^11.26.25"`. Sin solape.
8. **`frontend/package-lock.json`** — ver «nota sobre el lock» más abajo.

**Verificado: `main` NO contiene ya el wizard ni SweetAlert2.** Comprobado con
`git cat-file -e main:<ruta>`: los 5 ficheros nuevos están **ausentes** de `main`, y `sweetalert2`
**no está** en `main:frontend/package.json`. No hay duplicación de funcionalidad existente.

**No hay implementación alternativa previa** de ninguno de los dos conceptos: ni un indicador de
pasos, ni un módulo de alertas, ni otra librería de diálogos. `main` usa `window.confirm()` y
`<p role="status">` para eso.

---

## C. Cambios que probablemente necesiten adaptación

### C1 · `LessonEditorPage.tsx` — el caso serio (conflicto garantizado)

`main` añadió, tras `</form>`:

```tsx
{initial && <AssignedStudents lessonId={initial.id} userId={userId} />}
```

La feature **reescribe el bloque entero `return`** (de la línea ~211 a ~268): envuelve los camposets
en `{step === 'info' ? … : …}`, mete `<StepIndicator>` antes del `<form>`, y sustituye el botón
`Guardar` por `<div className="editor-actions">` con botones condicionales. El `</form>` de la
feature queda en la línea 266 **sin** la sección de asignados.

Git acotará el conflicto a la región `</form>` → `Volver a Mis clases`, pero la adaptación real es:
**volver a insertar la línea de `AssignedStudents` después del `</form>`** de la versión del wizard, y
**recuperar su import** (línea 9 de `main`), que el wizard no tiene porque es anterior a SPEC 04.

Además hay que decidir su interacción con el wizard: `AssignedStudents` debe quedar **fuera del
`<form>` y visible en ambos pasos** (así lo exige el contrato de SPEC 04 y lo prueba el test
`mounts the assigned-students section outside the form for an existing lesson`). Si se dejara dentro
del bloque condicional, en el paso 1 desaparecería y ese test rompería.

**Complejidad:** media-baja. Es una reinserción mecánica de 2 líneas + import, no un rediseño.

### C2 · `styles.css` — conflicto, pero trivial

- `main` cambió **1 línea** (+46 al final): `button.secondary` → `button.secondary, .button.secondary`
  (línea 25) y añadió todo el bloque `/* Students… */` al final.
- La feature añadió **bloques nuevos en 2 sitios**: `.pf-alert` (tras la línea ~34) y el bloque del
  wizard `.editor-step*` / `.editor-actions` (tras la línea ~79), **y modificó 1 línea**:

  ```css
  -.lesson-editor fieldset.activity-section { display: block; border-top: 1px solid #dfe5d8; margin-top: 28px; padding-top: 18px; }
  +.lesson-editor fieldset.activity-section { display: block; }
  ```

  (quita el borde y márgenes superiores, porque ahora es un paso del wizard).

**No hay solape textual entre bloques**, pero el dry-run lo marca como conflicto por proximidad en
un fichero grande. Se resuelve conservando **ambos lados**. La única decisión con carga semántica es
`activity-section`: **debe quedarse con la versión de la feature** (`display: block` sin borde
superior), porque el wizard ya añade su propio separador en `.editor-steps`.

### C3 · `.workbuddy-ai/memory/MEMORY.md` y `2026-09-25.md` — conflicto documental

Ambos lados los reescribieron por completo. **No es código.** Recomendación: **descartar la versión
de la feature** (`--ours` al mergear desde `main`) y conservar la de `main`, que es la más reciente y
la que este mismo análisis ya corrigió. El contenido histórico de los dos commits está preservado
igual en `docs/*-affected-tests.md`.

### C4 · `package-lock.json` — cuidado con el reformateo

La feature **no solo añade `sweetalert2`**: el diff son `66 líneas cambiadas` con muchas
eliminaciones, porque `npm install` reformateó el fichero entero (gotcha ya documentado en la memoria
del proyecto). Antes de dar el lock por bueno hay que comprobar que no revierte resoluciones de
`main`. Lo más seguro: **tomar el lock de `main` y hacer un `npm install sweetalert2` limpio** tras
el merge, en lugar de aceptar el lock de la feature tal cual.

---

## D. Posibles conflictos

### Conflictos de Git (dry-run con `git merge-tree`)

| Fichero | Tipo | Gravedad | Resolución |
| --- | --- | --- | --- |
| `LessonEditorPage.tsx` | changed in both | **Media** | Reinsertar import + `<AssignedStudents>` tras `</form>` |
| `styles.css` | changed in both | **Baja** | Conservar ambos lados; `activity-section` → versión feature |
| `.workbuddy-ai/memory/MEMORY.md` | changed in both | Baja (docs) | Conservar el de `main` |
| `.workbuddy-ai/memory/2026-09-25.md` | **added in both** | Baja (docs) | Conservar el de `main` |

Total: 4 ficheros, ~21 líneas de marcadores. **Ningún fichero de los 3 nuevos entra en conflicto.**

### Conflictos conceptuales (más allá de Git)

| Punto | Veredicto |
| --- | --- |
| ¿`main` ya tiene el wizard bajo otra forma? | **No.** El editor sigue siendo una sola pantalla. |
| ¿`main` ya tiene SweetAlert2 u otra librería de alertas? | **No.** Usa `window.confirm` y `role="status"`. |
| ¿La feature duplica funcionalidad existente? | **No.** Añade dos conceptos nuevos. |
| ¿Reemplaza código que cambió después? | **Parcialmente, sí:** la región del `return` de `LessonEditorPage` y la línea `activity-section` de `styles.css`. Ver C1/C2. |
| ¿Sigue siendo compatible con `main`? | **Sí, con adaptaciones.** No hay incompatibilidad de diseño: `AssignedStudents` vive fuera del `<form>` y el wizard reorganiza *dentro*. Son ortogonales. |
| ¿Choca con el contrato congelado de SPEC 04? | **Cuidado.** SPEC 04 congela `data-testid` y clases; `AssignedStudents` debe seguir **fuera del `<form>` y montado con `initial`**. El wizard no lo rompe si se reinserta bien. |

**Riesgo conceptual principal:** que la resolución del conflicto meta `AssignedStudents` dentro del
bloque condicional del wizard. Eso rompería el test de SPEC 04 y el contrato, y es un fallo silencioso
(compila y se ve bien en el paso 2).

---

## E. Tests mínimos necesarios después de integrar

**La feature NO modifica ningún fichero de test** (verificado: solo añade los 2 `docs/*affected*`).
Los tests de `main` asumen el editor de una sola pantalla, así que **romperán**.

### Se romperán con certeza (esperado y documentado)

| Suite | Qué falla | Causa | Volumen |
| --- | --- | --- | --- |
| `frontend/src/lessons/LessonEditorPage.test.tsx` | ~9 de 12 tests | Pulsan «Guardar» en el paso 1; ahora es «Continuar» y el submit es «Guardar clase» | 9 tests |
| `frontend/e2e/lessons.spec.ts` | Flujo de guardado | «Guardar» → «Continuar» + «Guardar clase» | 1 flujo |
| `frontend/e2e/lesson-builder.spec.ts` | Flujo de guardado | Igual | 2 usos |
| `frontend/e2e/students.spec.ts` | `createLesson()` y 3 sitios más | **También pulsa «Guardar» en el editor** | 4 usos |

**Causa raíz única** (lo dice el propio `docs/wizard-2-pasos-affected-tests.md`): los tests recorren
el editor como pantalla única. La corrección es mecánica: **un clic en «Continuar»** entre metadatos y
actividades, y **«Guardar» → «Guardar clase»**.

### Atención especial: `students.spec.ts`

No está en la documentación de la feature (se escribió después, con SPEC 04). Es una **víctima
adicional no prevista**: su helper `createLesson()` guarda una clase por la UI del editor. Hay que
sumarlo a la lista de arreglos.

### Los 2 tests nuevos de `main` que NO deben romperse

- `mounts the assigned-students section outside the form for an existing lesson`
- `does not mount the assigned-students section for a lesson that has no Id yet`

Son el **canario** de que la resolución del conflicto C1 es correcta. Deben seguir en verde.

### Prueba mínima recomendada (coherente con tu prioridad de probar a mano)

Dado que quieres **probar manualmente** y no expandir el alcance de testing, la verificación mínima
suficiente sería:

1. `npx tsc -b` — la red de seguridad real: detecta imports rotos, tipos de `StepIndicator`/`editor-steps`
   y, sobre todo, si falta el import de `AssignedStudents`.
2. `npx eslint .`.
3. **Los 2 tests de `AssignedStudents`** de `LessonEditorPage.test.tsx` (canario del contrato SPEC 04).
4. Prueba manual en navegador del flujo: crear clase → paso 1 → «Continuar» → paso 2 → «Guardar clase»
   → alerta de éxito; y un guardado fallido → alerta de error.

**No** hace falta arreglar los ~9 tests del editor ni los E2E en este momento: están desincronizados a
propósito por la regla del lote `design-fixes` («documentar sin modificar; priorizar iteración»), y su
arreglo es mecánico y posterior.

---

## F. Estrategias posibles

### Opción 1 — Merge de `feat/crear-clase-wizard-2-pasos` → `main`

- **Ventajas:** preserva la historia real de la feature; el merge-base es claro; un solo commit de
  merge; los 2 commits originales conservan su autoría y mensajes. Es el flujo que el repo ya usa
  (PR #2, PR #3).
- **Riesgos:** un merge commit «ruidoso» para 2 commits; hay que resolver 4 conflictos a mano (2 de
  código, 2 de docs).
- **Conflictos:** los 4 de §D. El de `LessonEditorPage.tsx` exige reinsertar `AssignedStudents`.
- **Impacto en historial:** un commit de merge en `main`; la rama de feature queda fusionada y
  borrable después.
- **Apropiado:** **sí.**

### Opción 2 — Rebase de la feature sobre `main` y luego merge

- **Ventajas:** historia lineal, sin commit de merge; los 2 commits quedan «encima» de `main`.
- **Riesgos:** **reescribe `148c314` y `e1b7135`** (nuevos hashes). Hay que resolver el mismo conflicto
  de `LessonEditorPage.tsx`, y encima **dos veces** (o una sola si se resuelve en el primer
  `--continue`). El `merge-tree` ya muestra que el primer commit chocaría con `main`.
- **Conflictos:** los mismos 4, resueltos durante el rebase.
- **Impacto en historial:** reescribe la rama. Si la rama estuviera publicada habría que forzar push;
  **no lo está** (no existe en el remoto), así que el riesgo de reescritura es bajo.
- **Apropiado:** válido, pero innecesario. Aporta linealidad a cambio de más puntos de conflicto y de
  perder el merge explícito. Para 2 commits, la ganancia es marginal.

### Opción 3 — Cherry-pick de los 2 commits sobre `main`

- **Ventajas:** control absoluto; se aplican solo los 2 cambios, uno a uno, con `main` como base real
  (sin merge-base antiguo). Útil si se quisiera **omitir** parte del trabajo (p. ej. la memoria).
- **Riesgos:** **duplica la historia**: los commits cherry-pickeados son *nuevos* commits, así que
  `main` y la rama dejarán de compartir esos cambios por SHA. Si luego se mergea la rama, Git podría
  generar conflictos espurios o duplicados.
- **Conflictos:** los mismos 4, resueltos dos veces (uno por commit).
- **Impacto en historial:** 2 commits nuevos en `main`, distintos de los originales; la rama queda
  «sin fusionar» desde el punto de vista de Git aunque el contenido esté.
- **Apropiado:** **no como primera opción.** Tendría sentido solo si quisieras integrar *parte* del
  trabajo (p. ej. SweetAlert2 sin el wizard), que no es el caso.

### Opción 4 — Integración manual / adaptación

- **Ventajas:** máximo control; permite adaptar de paso el editor a la estructura actual (p. ej.
  colocar `AssignedStudents` con criterio, ajustar `activity-section`).
- **Riesgos:** se pierde la trazabilidad de los 2 commits; trabajo manual propenso a errores; el diff
  es grande (749 inserciones / 203 borrados) y recrearlo a mano invita a omitir detalles sutiles
  (el `carriedStep`, el `useEffect` de reset, el `form.trigger()` del submit).
- **Conflictos:** ninguno «de Git», pero todos conceptuales, resueltos por ti.
- **Impacto en historial:** un commit propio; la feature queda como trabajo no trazado.
- **Apropiado:** **no.** La lógica del wizard tiene matices no obvios (el `carriedStep` módulo-level
  para sobrevivir al remount, el `trigger()` en `onSubmit`) que se perderían al recodificar.

---

## G. Recomendación técnica

**Recomiendo la Opción 1: merge de `feat/crear-clase-wizard-2-pasos` en `main`.**

### Por qué

1. **El repositorio ya usa ese flujo.** Las SPEC 02, 03 y 04 entraron por merge (PR #2, PR #3). Un
   merge mantiene la coherencia y la trazabilidad de la feature.
2. **La divergencia es real pero pequeña y de bajo riesgo.** 7 vs 2 commits, y solo **2 ficheros de
   código** en conflicto. `main` solo aportó **4 líneas** a `LessonEditorPage.tsx` y **1 línea + un
   bloque** a `styles.css`. El resto de la divergencia son docs y la migración de estudiantes.
3. **El conflicto crítico es de 2 líneas, no de diseño.** `AssignedStudents` debe reinsertarse tras
   `</form>`, fuera del condicional del wizard. Son ortogonales: uno reorganiza *dentro* del formulario,
   el otro vive *fuera*.
4. **El rebase (Opción 2) reescribiría commits sin ganancia real** para 2 commits, y añade puntos de
   conflicto. El cherry-pick (Opción 3) duplicaría historia. La integración manual (Opción 4) perdería
   matices de la lógica del wizard.
5. **Los 3 ficheros nuevos entran limpios**, así que el grueso del trabajo no requiere intervención.

### Secuencia sugerida (para cuando lo autorices)

```
git checkout main
git merge --no-ff feat/crear-clase-wizard-2-pasos
# Resolver, en este orden:
#  1. LessonEditorPage.tsx → reinsertar import AssignedStudents (línea 9 de main)
#                            + {initial && <AssignedStudents … />} tras </form>,
#                            FUERA del condicional de paso.
#  2. styles.css           → conservar ambos bloques; activity-section → versión de la feature.
#  3. MEMORY.md / 2026-09-25.md → quedarse con la versión de main.
#  4. package-lock.json    → partir del de main y reinstalar sweetalert2 limpio.
git commit                                  # completa el merge
cd frontend && npm install                  # materializa sweetalert2 en node_modules
npx tsc -b && npx eslint .                  # verificación mínima
```

### Advertencia importante

**No verifiqué nada ejecutando código**: este análisis es 100% estático (`git log`, `git diff`,
`git merge-tree`, `git show`). El `npm install` de `sweetalert2` **no está hecho**, así que
`node_modules` no lo contiene todavía; sin él, `notifications.ts` no resuelve y `tsc -b` fallará. Es
esperado, no un error del análisis.

### Lo que hay que decidir antes de ejecutar

- **¿Se quedan los 2 E2E y los ~9 tests del editor desincronizados** (regla del lote `design-fixes`)
  o se arreglan en la misma integración? Mi recomendación: **dejarlos desincronizados** y arreglarlos
  aparte, para poder probar a mano cuanto antes, como pediste.
- **`students.spec.ts` no está en la documentación de la feature** y también romperá. Conviene
  anotarlo en el doc de tests afectados al integrar.
