# SPEC 10 — Navegación principal con Sidebar

> **Estado:** Aprobado
> **Depende de:** SPEC 01 — Gestión de clases; SPEC 04 — Student Management
> **Fecha:** 2026-10-21
> **Objetivo:** Incorporar un `AppLayout` con Sidebar compartida (Clases, Estudiantes y sus dos papeleras) que absorbe la marca y la sesión del header actual, sin cambiar rutas, páginas ni contratos de API. 

---

## 1. Por qué esta spec existe

La navegación de secciones está repartida hoy en cada página: el `<header>` de `App.tsx` solo lleva la marca y la sesión, mientras los enlaces «Papelera / Estudiantes / Mis clases» viven en los `<nav>` de `LessonsPage` y `StudentsPage`. La aplicación va a crecer (Documentos, Configuración) y esa estructura obliga a cada página nueva a reinventar sus accesos. Un shell compartido lo resuelve sin tocar la lógica de negocio.

---

## 2. Alcance

**Incluye:**

- `frontend/src/components/Sidebar.tsx` y `frontend/src/components/AppLayout.tsx` (layout route con `<Outlet />`), ambos nuevos.
- Cuatro destinos en la Sidebar, planos y con divisor visual antes de las papeleras: **Clases** (`/`), **Estudiantes** (`/students`), ─── **Papelera de clases** (`/lessons/trash`), **Papelera de estudiantes** (`/students/trash`). Se reutilizan las páginas existentes; no se crea ninguna.
- Detección de sección activa con `useLocation()` incluyendo subrutas: `/lessons/new`, `/lessons/:id/edit`, `/lessons/:id/play` → «Clases»; `/students/new`, `/students/:id`, `/students/:id/edit` → «Estudiantes». Las papeleras ganan a su sección cuando la ruta coincide exactamente.
- Modo expandido (~256px) y compacto (~72px) en escritorio con transición discreta; el estado se persiste en `localStorage` con la clave `pf.sidebar-collapsed`. Botón de toggle con nombre accesible y `aria-expanded`.
- Móvil (`<768px`): cajón lateral fuera de flujo con botón «Abrir menú», botón de cierre dentro, cierre por overlay y **cierre tras seleccionar un enlace**.
- La Sidebar absorbe: la marca `pf. Profe Facilísimo` (encabezado), el correo de sesión y «Cerrar sesión» de `SessionBar` (pie, con su alerta de error). El `<header>` de `App.tsx` desaparece; la frase «Menos preparación. Más conversación.» pasa al `<footer>`.
- Rutas protegidas (`/`, `/lessons/**`, `/students/**`) envueltas en `AppLayout`. `/login` y `/register` quedan fuera, sin Sidebar. El reproductor de clases (`/lessons/:id/play`) usa el layout con «Clases» activa.
- Eliminar de los `<nav>` de `LessonsPage` y `StudentsPage` los enlaces de cambio de sección (Papelera, Estudiantes, Mis clases). Conservar los enlaces de flujo: «Crear clase», «Crear estudiante» y los «Volver a …» de las papeleras.
- Adaptar los tests afectados (vitest y Playwright) y añadir `Sidebar.test.tsx` / `AppLayout.test.tsx`.
- Estilos en el `styles.css` existente reutilizando las variables CSS del tema y los iconos de `lucide-react`. Sin dependencias nuevas.

**Fuera de alcance (para futuras specs):**

- Las secciones Documentos y Configuración: la estructura `NAV_ITEMS` queda preparada para añadirlas, pero **no se muestran enlaces deshabilitados ni inexistentes**.
- Una papelera unificada o general: cada papelera conserva su alcance actual (clases por un lado, estudiantes por otro).
- Rediseño de listados, formularios o flujos. El editor de clases (pasos y asignación de estudiantes) no se modifica. La experiencia del reproductor no se toca.
- Autenticación, perfiles, dashboard ni ninguna lógica de negocio nueva. Nada de backend.
- Cambios de URLs, reorganización de rutas o un sistema de routing distinto de react-router.

---

## 3. Modelo de datos

No hay datos nuevos de backend ni contratos que cambien. Estructuras del frontend:

```ts
// frontend/src/components/Sidebar.tsx
export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon; // lucide-react, dependencia ya instalada
  active: (pathname: string) => boolean; // exactas para papeleras, prefijo para secciones
};

const NAV_ITEMS: readonly NavItem[] = [
  /* 4 entradas; el divisor es visual, no un dato */
];
```

Convenciones:

- Persistencia del colapso: `localStorage['pf.sidebar-collapsed']` con `'true'` / `'false'`; ausente = expandida. El cajón móvil **no** se persiste (siempre abre cerrado).
- La sección activa se expresa solo con `aria-current` en el `Link` y una clase `is-active`; el layout no conoce estado de negocio alguno.
- El pie de la Sidebar reutiliza `SessionBar` (o su lógica equivalente) con el mutar de `logout` y el `client.clear()` existentes.

---

## 4. Plan de implementación

0. **Prerequisito (fuera del alcance de esta spec):** dejar verde el trabajo sin commitear del tercer paso del editor (`feature/lesson-editor-students-step`, 4 tests vitest en rojo del flujo «volver al listado tras guardar»). Sin esto no se puede distinguir una regresión de la Sidebar de una ajena.
1. Crear `Sidebar.tsx`: marca, `NAV_ITEMS` con `Link` + icono + etiqueta, divisor, pie de sesión (correo + «Cerrar sesión» absorbiendo `SessionBar`), toggle expandido/compacto con persistencia. Comprobación: `tsc -b` y render provisional en la raíz.
2. Crear `AppLayout.tsx`: grid CSS `[sidebar | main]` en escritorio; cajón con botón de apertura, overlay y cierre por navegación en móvil. `<Outlet />` dentro de `main`, conservando `<RouteErrorBoundary key={location.pathname}>`. Comprobación: la app compila y muestra la navegación.
3. Reconfigurar `App.tsx`: dentro de `ProtectedRoute`, añadir la ruta de layout `<Route element={<AppLayout />}>` que envuelve todas las rutas protegidas existentes; eliminar el `<header>`; mover el tagline al `<footer>`. Comprobación manual: URLs directas siguen funcionando y `/login` no muestra Sidebar.
4. Estilos en `styles.css`: anchos expandido/compacto, transiciones discretas, estados activo/hover con las variables actuales, breakpoint 768px, sin desbordes a 390px.
5. Quitar los enlaces duplicados de `LessonsPage.tsx` y `StudentsPage.tsx` y actualizar sus tests de página.
6. Añadir `Sidebar.test.tsx` / `AppLayout.test.tsx`: detección de activo por subruta, toggle con persistencia, cierre del cajón tras navegar, nombres accesibles. Adaptar `e2e/lessons.spec.ts`, `e2e/students.spec.ts` y `e2e/session.spec.ts` donde se pulsaban los enlaces eliminados.
7. Gate completa: `npm --prefix frontend run lint`, `npm --prefix frontend run build`, vitest completo y los specs e2e tocados vía `./scripts/Test-E2E.ps1`.

---

## 5. Criterios de aceptación

- [ ] Tras iniciar sesión, la Sidebar es visible en todas las rutas protegidas con los cuatro enlaces: Clases, Estudiantes, Papelera de clases, Papelera de estudiantes.
- [ ] `/login` y `/register` se renderizan sin Sidebar y el flujo de sesión no cambia.
- [ ] Cada enlace navega a su página existente sin recargar la aplicación (navegación client-side con React Router).
- [ ] En `/lessons/xxx/edit` el enlace activo es «Clases»; en `/students/xxx`, «Estudiantes»; en `/lessons/trash`, «Papelera de clases»; en `/students/trash`, «Papelera de estudiantes».
- [ ] Abrir directamente cualquier URL existente (`/`, `/lessons/trash`, `/students`, `/students/trash`, `/lessons/new`, `/lessons/:id/edit`, `/lessons/:id/play`, `/students/new`, `/students/:id`, `/students/:id/edit`) funciona sin cambiar ninguna ruta.
- [ ] Colapsar la Sidebar en escritorio y recargar la página mantiene el estado colapsado (`pf.sidebar-collapsed`).
- [ ] A 390px de ancho: la Sidebar está oculta, el botón «Abrir menú» la muestra, elegir un enlace navega y cierra el menú, y `document.documentElement.scrollWidth <= window.innerWidth`.
- [ ] Todos los enlaces y botones de la Sidebar son alcanzables con el teclado; el toggle y el botón de menú tienen nombre accesible y `aria-expanded`; el enlace activo lleva `aria-current`.
- [ ] El wizard de crear/editar clase (pasos, actividades, asignación de estudiantes) sigue funcionando y conserva sus datos al navegar entre pasos.
- [ ] `LessonsPage` y `StudentsPage` ya no contienen enlaces a otras secciones; conservan «Crear clase», «Crear estudiante» y los «Volver a …» de los flujos de papelera.
- [ ] `npm --prefix frontend run lint`, `npm --prefix frontend run build` (tsc + vite) y vitest pasan sin errores; los specs e2e afectados pasan. Backend: sin cambios, `dotnet test` sin alteraciones conocidas.

---

## 6. Decisiones

- **Sí:** cuatro enlaces planos con divisor visual. **No:** submenú desplegable de papeleras ni títulos de grupo: solo hay cuatro destinos; no se sobre-abstrae.
- **Sí:** dos entradas de papelera (clases y estudiantes). **No:** papelera unificada o contextual: las dos papeleras existen; no se inventa una general.
- **Sí:** la Sidebar absorbe marca y sesión y el `<header>` desaparece; el tagline «Menos preparación. Más conversación.» pasa al `<footer>`. **No:** mantener header + Sidebar: duplicaría la marca.
- **Sí:** estructura `NAV_ITEMS` extensible para Documentos/Configuración. **No:** enlaces placeholder deshabilitados: no se muestran páginas inexistentes.
- **Sí:** persistencia del colapso en `localStorage`. **No:** persistir el cajón móvil: siempre abre cerrado.
- **Sí:** el reproductor de clases recibe el layout (sección «Clases» activa). **No:** modo foco sin navegación: requeriría un segundo shell sin beneficio demostrable.
- **Sí:** eliminar los enlaces de sección dentro de las páginas. **No:** conservarlos duplicados.
- **No:** cambiar URLs, introducir dependencias, usar otro router o tocar contratos de API.

---

## 7. Riesgos

| Riesgo                                                                                                | Mitigación                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Los e2e existentes pulsan enlaces que se eliminan («Estudiantes», «Papelera» desde las páginas)       | Se adaptan en el paso 6 apuntando a los enlaces de la Sidebar; el viewport e2e por defecto es escritorio, donde la Sidebar siempre es visible.   |
| El trabajo sin commitear del editor (4 tests rojos) contamina la verificación                         | Paso 0 como prerequisito: la Sidebar se implementa sobre vitest en verde.                                                                        |
| `useBlocker` del editor puede pedir confirmación al navegar desde el menú móvil con un borrador sucio | Comportamiento ya existente y correcto: el cajón se cierra al pulsar el enlace y la confirmación solo aparece si hay cambios reales sin guardar. |
| Desbordes u overflow en pantallas de 390px con las páginas existentes                                 | El grid usa `main` con ancho mínimo y `overflow-wrap`; se verifica con el chequeo de `scrollWidth` ya presente en los e2e.                       |
| `RouteErrorBoundary` cambia de sitio (dentro del layout)                                              | Conserva su `key={location.pathname}` dentro de `main`; el reinicio por ruta se mantiene.                                                        |

---

## Qué **no** entra en esta spec

- Documentos y Configuración como secciones funcionales o visibles.
- Papelera unificada o general de entidades.
- Cambios al editor de clases, al reproductor, a los formularios o a cualquier contrato de API.
- Cualquier cambio de backend, rutas nuevas o dependencias nuevas.

Cada una de esas, si llega, va en su propia spec.
