# SPEC 05 — Botones con color e iconos

> **Estado:** Aprobado
> **Depende de:** SPEC 01 — Gestión de clases; SPEC 02 — Editor de actividades; SPEC 03 — Reproductor de clases; SPEC 04 — Gestión de estudiantes.
> **Fecha:** 2026-10-05
> **Objetivo:** Dar a todos los botones de la interfaz un color según el significado de su acción y un icono que la represente, mediante un componente `Button` reutilizable con variantes.

---

## 1. Por qué esta spec existe

Hoy los ~51 `<button>` y 15 `<Link className="button">` del frontend están repartidos por 13 archivos con cuatro variantes implícitas (por defecto, `secondary`, `danger`, `editor-step-link`), colores duplicados a mano (`#8c3033` frente a `--pf-danger`) y cero iconos: todas las acciones son solo texto. Esta spec unifica el sistema de botones y lo hace legible de un vistazo.

## 2. Alcance

**Incluye:**

- Dependencia nueva `lucide-react` en el frontend.
- Componente `Button` en `frontend/src/components/Button.tsx` con prop `variant` (`primary` | `secondary` | `danger` | `accent`) y prop `icon` (componente Lucide opcional).
- Variante `accent` nueva (fondo `--pf-accent`, tinta `--pf-ink`) para acciones de recuperación: Restaurar, Duplicar.
- Promoción de colores hardcodeados a tokens en `:root`: `--pf-primary-hover`, `--pf-danger-hover`, `--pf-accent-hover`; `button.danger` pasa a usar `--pf-danger` en lugar de `#8c3033`.
- Catálogo acción→icono (sección 3) aplicado a todos los botones de acción y a los enlaces con clase `button` de las páginas existentes (misma cobertura, sin repintar otros componentes).
- Espaciado icono–texto en CSS (gap del botón, `aria-hidden` en el SVG).

**Fuera de alcance (para futuras specs):**

- SweetAlert2: modales de confirmación mantienen sus colores actuales.
- Rediseño de formularios, navegación superior, badges u otros componentes que no sean botones.
- Modo oscuro o preferencias de tema persistidas por usuario.
- Botones de solo icono (sin texto): todos los botones conservan su etiqueta en español visible.

## 3. Modelo de datos

No hay datos nuevos de dominio ni de API: es un cambio 100% de presentación. Las únicas estructuras nuevas son el catálogo de variantes e iconos.

```tsx
// frontend/src/components/Button.tsx
type ButtonVariant = "primary" | "secondary" | "danger" | "accent";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant; // default: "primary"
  icon?: LucideIcon; // opcional, se renderiza antes del texto con aria-hidden
}
```

Catálogo acción → icono (Lucide):

| Acción                                                          | Icono                       |
| --------------------------------------------------------------- | --------------------------- |
| Crear clase / Crear estudiante / Agregar actividad              | `Plus`                      |
| Iniciar clase                                                   | `Play`                      |
| Editar (clase, estudiante, ficha)                               | `Pencil`                    |
| Duplicar                                                        | `Copy`                      |
| Enviar a papelera / quitar actividad o fila                     | `Trash2`                    |
| Eliminar definitivamente                                        | `Ban`                       |
| Restaurar                                                       | `RotateCcw`                 |
| Buscar                                                          | `Search`                    |
| Limpiar filtros                                                 | `FilterX`                   |
| Actualizar listado / Reintentar                                 | `RefreshCw`                 |
| Guardar                                                         | `Save`                      |
| Cancelar                                                        | `X`                         |
| Atrás / Volver / Volver a Mis clases / Volver a Mis estudiantes | `ArrowLeft`                 |
| Continuar                                                       | `ArrowRight`                |
| Subir / Bajar actividad                                         | `ChevronUp` / `ChevronDown` |
| Asignar / Desasignar                                            | `Link2` / `Unlink`          |
| Cerrar sesión                                                   | `LogOut`                    |
| Pantalla completa activar / desactivar                          | `Maximize2` / `Minimize2`   |

## 4. Plan de implementación

1. `npm install lucide-react` (frontend) y commit del `package.json` + lockfile.
2. Añadir tokens nuevos de hover en `:root` de `frontend/src/styles.css`, cambiar `button.danger` a `--pf-danger`, y crear las clases `.pf-btn--primary|secondary|danger|accent` con el icono espaciado (`gap`, `aria-hidden` heredado). Sistema funcional: los estilos antiguos conviven.
3. Crear `components/Button.tsx` con `variant` + `icon`, renderizando las clases del paso 2.
4. Migrar `App.tsx` (auth, cerrar sesión) y `RouteErrorBoundary.tsx`. Manual: login y logout siguen funcionando, `tsc -b` limpio.
5. Migrar `lessons/`: `LessonsPage.tsx` (incluye acciones de papelera con `accent`/`danger`), `LessonEditorPage.tsx`, `ActivityList.tsx`, `ActivityForm.tsx`, `StepIndicator.tsx`.
6. Migrar `lessons/LessonPlayerPage.tsx` (Play en enlaces de acción, fullscreen con icono según estado, conservar overrides compactos).
7. Migrar `students/`: `StudentsPage.tsx`, `StudentProfilePage.tsx`, `StudentFormPage.tsx`, `StudentsTrashPage.tsx`, `AssignedStudents.tsx`, `AssignedLessons.tsx`.
8. Limpiar reglas CSS huérfanas de `button`/`.button` que hayan quedado sin uso tras la migración (sin tocar `.pf-alert` ni SweetAlert2).

## 5. Criterios de aceptación

- [ ] `npm --prefix frontend run test` pasa sin modificar las aserciones de los tests existentes (el nombre accesible de cada botón sigue conteniendo su texto en español).
- [ ] `npx eslint` y `tsc -b && vite build` pasan.
- [ ] `./scripts/Test.ps1` pasa completo.
- [ ] Todo botón de acción muestra icono Lucide + etiqueta de texto visible; ningún botón queda solo-icono.
- [ ] `Eliminar definitivamente` (clases y estudiantes) usa la variante `danger` basada en `--pf-danger`; no queda `#8c3033` en `styles.css`.
- [ ] `Restaurar` y `Duplicar` usan la variante `accent`.
- [ ] Los SVG de iconos llevan `aria-hidden` (no aparecen como ruido en los snapshots de accesibilidad).

## 6. Decisiones

- **Sí:** `lucide-react`. Tree-shakeable, SVG inline, control de color/grosor con CSS; hoy no hay ninguna librería de iconos.
- **No:** SVG propios a mano (mantenimiento) ni emojis (render inconsistente, sin control visual).
- **Sí:** componente `Button` compartido. Elimina la duplicación de las variantes implícitas y hace el icono una decisión por acción, no por página.
- **No:** retoque CSS in-place. Dejaría los 66 usos sin un punto de evolución.
- **Sí:** variantes semánticas (`primary`/`secondary`/`danger`/`accent`) con la paleta verde existente. El color refuerza el significado de la acción.
- **No:** modo oscuro ni tema persistido. Merece spec propia si llega.
- **Sí:** icono + texto siempre. Conserva los nombres accesibles que usan vitest y Playwright sin tocar tests.
- **No:** tocar SweetAlert2 ni el resto de componentes. Fuera del foco de esta spec.

## 7. Riesgos

| Riesgo                                                                    | Mitigación                                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Tests existentes buscan botones por nombre accesible y un icono lo altera | Iconos con `aria-hidden` y texto visible siempre; verificación en el paso de aceptación 1 |
| Contraste insuficiente de `accent` (#97b54d oliva claro)                  | Tinta `--pf-ink` oscura sobre accent; revisión visual en el paso 2                        |
| Los enlaces `<Link className="button">` no pasan por `Button`             | Se mantienen con las clases de variante; el catálogo los cubre igual                      |

## Lo que **no** va en esta spec

- Rediseño de modales SweetAlert2, formularios, navegación o badges.
- Modo oscuro / tema por usuario.
- Botones de solo icono con tooltip.

Cada uno, si llega, va en su propia spec.
