# Reporte de estado de ramas locales — Profefacilisimo

Fecha: 2026-09-29 · Solo lectura. **No se eliminó ni modificó ninguna rama.**

## Rama base

- **Rama actual:** `main` en `df8a5a6` (`Merge pull request #3 from Al148506/spec-04-student-management--contract`)
- **A conservar siempre:** `main` ✅
- **Repositorio:** `https://github.com/Al148506/profefacilisimo.git`
- **Ramas remotas existentes:** `origin/main` (única) + `origin/HEAD` + la referencia obsoleta
  `origin/codex/spec-01-gestion-de-clases`
- **Worktrees:** uno solo — `D:/Freelance/Profefacilisimo  df8a5a6 [main]`

## Tabla resumen

| Rama | Worktree | ¿Merged en main? | Commits exclusivos | Remota | Recomendación |
| ---- | -------- | ---------------- | ------------------ | ------ | ------------- |
| `main` | Sí | — (es la base) | 0 | `origin/main` | **Conservar** |
| `design-fixes` | No | **Sí** (ancestro) | 0 | No | **Eliminar con seguridad** |
| `feat/boton-editar-clase` | No | **Sí** (ancestro) | 0 | No | **Eliminar con seguridad** |
| `spec-02-editor-de-actividades-mvp` | No | **Sí** (ancestro) | 0 | No | **Eliminar con seguridad** |
| `spec-03-reproductor-de-clases` | No | **Sí** (ancestro) | 0 | No (upstream *gone*) | **Eliminar con seguridad** |
| `spec-03-reproductor-de-clases--activity-view` | No | **Sí** (ancestro) | 0 | No | **Eliminar con seguridad** |
| `spec-03-reproductor-de-clases--contract` | No | **Sí** (ancestro) | 0 | No | **Eliminar con seguridad** |
| `spec-03-reproductor-de-clases--entry-styles` | No | **Sí** (ancestro) | 0 | No | **Eliminar con seguridad** |
| `spec-03-reproductor-de-clases--player` | No | **Sí** (ancestro) | 0 | No | **Eliminar con seguridad** |
| `spec-04-student-management` | No | **Sí** (ancestro) | 0 | No | **Eliminar con seguridad** |
| `spec-04-student-management--backend` | No | **Sí** (ancestro) | 0 | No | **Eliminar con seguridad** |
| `spec-04-student-management--contract` | No | **Sí** (ancestro, PR #3) | 0 | `origin/spec-04-student-management--contract` | **Eliminar con seguridad** |
| `feat/crear-clase-wizard-2-pasos` | No | **No** | **2** | No | **Revisar antes de eliminar** ⚠️ |

**Resumen:** 11 ramas eliminables con seguridad, 1 a revisar (`feat/crear-clase-wizard-2-pasos`),
`main` a conservar.

## Detalle por rama

### `design-fixes` — Eliminar con seguridad

- **Worktree:** no.
- **Merged en main:** sí, es ancestro directo (`fd69352`, el merge del PR #2).
- **Commits exclusivos:** 0.
- **Remota:** no existe.
- **Temporal de spec/feature terminada:** sí. Fue la rama del lote de correcciones de diseño
  (wizard de 2 pasos, SweetAlert2, botón secundario «Editar clase»).
- **Nota:** sus tres cambios llegaron a `main` por otras rutas (`5200c57` para el botón secundario y
  el trabajo posterior de SPEC 04). Su punta es exactamente el commit de merge del PR #2, así que no
  aporta nada propio.

### `feat/boton-editar-clase` — Eliminar con seguridad

- **Worktree:** no.
- **Merged en main:** sí, ancestro (`b3c9f41`).
- **Commits exclusivos:** 0.
- **Remota:** no existe.
- **Temporal de feature terminada:** sí. El botón secundario «Editar clase» está en `main` (`5200c57`).
- **Nota:** apunta a `b3c9f41`, el mismo commit que otras dos ramas (§ abajo). Rama ya absorbida.

### `spec-02-editor-de-actividades-mvp` — Eliminar con seguridad

- **Worktree:** no.
- **Merged en main:** sí, ancestro (`0026a60`).
- **Commits exclusivos:** 0.
- **Remota:** no existe.
- **Temporal de spec terminada:** sí. SPEC 02 (editor de actividades) se fusionó con
  `89b30c8 Merge branch 'spec-02-editor-de-actividades-mvp'`.

### `spec-03-reproductor-de-clases` — Eliminar con seguridad

- **Worktree:** no.
- **Merged en main:** sí, ancestro (`2b157ae`).
- **Commits exclusivos:** 0.
- **Remota:** **no existe ya**, pero conserva una referencia de seguimiento obsoleta: aparece como
  `[origin/spec-03-reproductor-de-clases: gone]`. Es un remanente, no una copia de respaldo.
- **Temporal de spec terminada:** sí. SPEC 03 se fusionó con
  `fd69352 Merge pull request #2 from Al148506/spec-03-reproductor-de-clases`.

### `spec-03-reproductor-de-clases--activity-view` — Eliminar con seguridad

- **Worktree:** no. **Merged en main:** sí, ancestro (`54bd9c3`). **Commits exclusivos:** 0.
- **Remota:** no. **Temporal:** sí, flujo B de SPEC 03, absorbido por el merge `e1954f4`.

### `spec-03-reproductor-de-clases--contract` — Eliminar con seguridad

- **Worktree:** no. **Merged en main:** sí, ancestro (`d28e6cf`). **Commits exclusivos:** 0.
- **Remota:** no. **Temporal:** sí, fase de contrato de SPEC 03.

### `spec-03-reproductor-de-clases--entry-styles` — Eliminar con seguridad

- **Worktree:** no. **Merged en main:** sí, ancestro (`5b5c505`). **Commits exclusivos:** 0.
- **Remota:** no. **Temporal:** sí, flujo de estilos de entrada de SPEC 03 (`5b5c505` es un merge de
  `--player` dentro de `--entry-styles`).

### `spec-03-reproductor-de-clases--player` — Eliminar con seguridad

- **Worktree:** no. **Merged en main:** sí, ancestro (`894e22b`). **Commits exclusivos:** 0.
- **Remota:** no. **Temporal:** sí, flujo del reproductor. `LessonPlayerPage.tsx` está en `main`.

### `spec-04-student-management` — Eliminar con seguridad

- **Worktree:** no. **Merged en main:** sí, ancestro (`b3c9f41`). **Commits exclusivos:** 0.
- **Remota:** no. **Temporal:** sí, rama de integración de SPEC 04.

### `spec-04-student-management--backend` — Eliminar con seguridad

- **Worktree:** no. **Merged en main:** sí, ancestro (`b3c9f41`). **Commits exclusivos:** 0.
- **Remota:** no. **Temporal:** sí, flujo A de SPEC 04.

### `spec-04-student-management--contract` — Eliminar con seguridad

- **Worktree:** no. **Merged en main:** sí, ancestro (`18f46d2`), integrada con el PR #3.
- **Commits exclusivos:** 0 (solo 1 commit por detrás de `main`, que es el propio merge).
- **Remota:** **sí**, `origin/spec-04-student-management--contract` sigue existiendo.
- **Temporal de spec terminada:** sí.
- **Recomendación de higiene:** al eliminar la rama local, valorar borrar también la remota, ya que su
  contenido está íntegramente en `origin/main`. *(No se ha hecho nada al respecto.)*

### ⚠️ `feat/crear-clase-wizard-2-pasos` — Revisar antes de eliminar

- **Worktree:** no.
- **Merged en main:** **NO**. Es la única rama con commits exclusivos.
- **Commits exclusivos: 2**

  | Commit | Fecha | Asunto |
  | ------ | ----- | ------ |
  | `148c314` | 2026-09-25 16:59 | `feat: implement two-step wizard for lesson creation and editing` |
  | `e1b7135` | 2026-09-25 17:10 | `feat: add SweetAlert2 notifications for lesson save actions` |

- **Remota:** **NO existe**. No está respaldada en ningún sitio. Si se elimina esta rama sin más,
  **los dos commits quedan irrecuperables** (solo sobrevivirían en el reflog local durante un tiempo,
  pero no hay copia remota).
- **Trabajo que contiene** (verificado fichero a fichero contra `main`, no solo por el mensaje):
  - `frontend/src/lessons/StepIndicator.tsx` — **no existe en `main`**
  - `frontend/src/lessons/editor-steps.ts` — **no existe en `main`**
  - `frontend/src/notifications.ts` — **no existe en `main`**
  - `docs/wizard-2-pasos-affected-tests.md` — **no existe en `main`**
  - `docs/sweetalert2-affected-tests.md` — **no existe en `main`**
  - `frontend/src/main.tsx`, `frontend/src/styles.css`, `frontend/src/lessons/LessonEditorPage.tsx`
    con modificaciones propias
  - `sweetalert2` añadido a `frontend/package.json` (ausente en `main`)
  - Además: cambios en la memoria del proyecto y reformateo de `package-lock.json`

  Es decir, contiene **el wizard de 2 pasos del editor de clases y las notificaciones SweetAlert2**,
  con su documentación de tests afectados. Nada de esto está en `main`.
- **Por qué parece temporal:** el nombre sigue el patrón `feat/*` del lote `design-fixes`, cuyo resto
  de cambios sí se integró. Pero esta rama concreta **quedó fuera** de la integración.
- **Nota importante sobre la memoria del proyecto:** `MEMORY.md` describe este wizard y SweetAlert2
  como «Cambios entregados en el lote», lo que da la impresión de que están en `main`. La verificación
  demuestra lo contrario: el contenido existe **solo** en esta rama. Conviene corregir esa impresión
  antes de tomar cualquier decisión.

## Observaciones transversales

1. **Puntas duplicadas.** Cuatro ramas comparten commit con otras:
   `b3c9f41` → `feat/boton-editar-clase`, `spec-04-student-management`, `spec-04-student-management--backend`.
   Todas apuntan a la misma instantánea, así que eliminarlas no pierde nada por separado.
2. **Upstream obsoleto.** `spec-03-reproductor-de-clases` muestra `[origin/...: gone]`: la rama remota
   fue borrada en algún momento y solo queda la referencia de seguimiento local.
3. **El remoto está casi limpio.** En `origin` solo quedan `main` y
   `origin/spec-04-student-management--contract` (más la obsoleta `origin/codex/spec-01-gestion-de-clases`
   y `origin/HEAD`).
4. **Ninguna rama está asociada a un worktree** salvo `main`. Según la regla indicada, ninguna requiere
   por ese motivo quedar como «Revisar antes de eliminar».
5. **No se ha borrado nada.** Este reporte es solo diagnóstico.

## Antes de ejecutar cualquier limpieza

Si más adelante se decide limpiar, el orden recomendado sería:

1. Decidir primero qué hacer con `feat/crear-clase-wizard-2-pasos`: conservarla, o publicarla en el
   remoto para no perder el wizard y SweetAlert2.
2. Verificar una vez más el estado con `git status` (el entorno crea commits automáticamente y el
   trabajo sin commitear no aparece en `git log`).
3. Eliminar con `git branch -d` (nunca `-D`) las ramas marcadas como seguras: al ser ancestros de
   `main`, `-d` las acepta sin forzar y avisa si algo no estuviera realmente fusionado.
4. Valorar borrar `origin/spec-04-student-management--contract` en el remoto, por separado y con
   confirmación explícita.
