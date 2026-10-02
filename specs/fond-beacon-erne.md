# Análisis del frontend y plan de trabajo priorizado

> **Estado:** Aprobado

## Contexto

Se pidió una revisión a fondo del frontend de Profe Facilísimo para llevarlo a un estado **más limpio,
consistente, intuitivo y profesional sin introducir complejidad innecesaria**. Este documento es
únicamente análisis y plan.

> **Revisión 3 (alcance cerrado):** el cuerpo de auditoría (ítems con evidencia archivo:línea) se
> conserva de la revisión 2. La estructura de trabajo cambia: se eliminan las «Decisiones pendientes»
> (todas tomadas), las cinco fases se convierten en **dos rondas**, y se añaden **reglas de
> ejecución** para que el coste de verificación no supere el coste del cambio. El frontend está
> **funcionalmente completo**: el objetivo de la Ronda 1 es terminar, no refactorizar.

### Herramientas ejecutadas (estado real, no suposición)

| Comando | Resultado |
|---|---|
| `npx tsc -b` | ✅ Limpio |
| `npx eslint .` | ✅ Limpio |
| `npx vitest run` | ✅ (tras reparar los 7 tests del editor — ver P0-4, cerrado) |
| Contraste WCAG (20 pares de color de `styles.css`) | ✅ Todos los textos pasan AA. Solo falla la flecha decorativa entre pasos (1.86:1) |
| Endpoints del backend sin UI | Solo `GET /api/students/{id}/lessons` (cliente muerto `listAssignedLessons`) |
| Desajustes de DTO frontend ↔ backend | Ninguno. Los tipos espejan los DTO con exactitud |

### Diagnóstico general

El frontend es **funcionalmente completo y técnicamente sólido**: no hay CRUD pendiente, no hay
desajustes de contrato, TypeScript y ESLint están limpios, y hay decisiones deliberadamente buenas que
conviene conservar intactas (la posición del reproductor gobernada por la URL, la detección de cambios
sin guardar por huella digital, `ActivityView` leyendo JSONB de forma defensiva, `AssignedStudents`
fuera del `<form>` para que asignar no ensucie el borrador).

Los problemas restantes se concentran en **tres ejes**, ninguno de los cuales requiere arquitectura
nueva:

1. **Un defecto funcional confirmado activo** (P0-1: los mensajes de error del servidor al asignar
   nunca llegan al usuario).
2. **Asimetrías entre las dos áreas gemelas** (clases y estudiantes): feedback de guardado doble en
   una área e inline en la otra, estilo del bloque de error, navegación de vuelta, nivel por defecto.
3. **Detritos acumulados y duplicación**: código muerto duplicado (`readErrorMessage`), testid
   duplicado entre pickers, fuentes fantasma en el CSS, contador de claves mutable a nivel de módulo,
   opciones de nivel repetidas en cuatro sitios.

---

## Reglas de ejecución (aplican a todas las rondas)

1. **Regla de umbral.** Si una limpieza no aporta una mejora observable o no reduce un riesgo
   concreto, **no se ejecuta**. El beneficio marginal de cada cambio decrece: el sistema ya está
   completo y cada toque nuevo es una oportunidad de regresión.
2. **Verificación por cambio pequeño** — no por fase:
   1. `npx tsc -b`
   2. `npx eslint .`
   3. **solo** los tests directamente relacionados con el cambio
      (p. ej. `npm --prefix frontend test -- src/students/student-api.test.ts`)
   4. la comprobación manual específica del cambio
3. **`vitest run` completo solo al cerrar cada ronda.** Playwright **nunca en batería**: solo por
   archivo (`npx playwright test e2e/<spec>.ts`) para no caer en el límite 429 documentado.
4. **Presupuesto de tests.** Si un test secundario consume más tiempo que el cambio, se documenta el
   fallo en el commit y se sigue adelante; no se persigue en el momento.
5. **Ninguna cadena de texto nueva** que no esté ya en el vocabulario del proyecto; cualquier
   excepción (CTA de vacíos) exige validarla contra `specs/04-student-management-contract.md` §C4
   **antes** de escribirla.
6. **Ninguna clase CSS nueva** fuera del final de `styles.css` (convención del proyecto).
7. Cada ítem es **un commit autocontenido**: reversible sin arrastrar a los demás.

---

## P0 — Crítico

### P0-1 · Los mensajes de error del servidor al asignar nunca llegan al usuario — ✅ CERRADO

- **Evidencia de cierre.** `assignmentResponse` (`student-api.ts:132`) lee ya el `ValidationProblem`
  real con el patrón de `studentResponse:90`:
  `Object.values(problem.errors as Record<string, string[]>).flat().join(' ')`. El test de la rama
  `400` en `student-api.test.ts` usa `errors` como objeto, la forma que envía el servidor.


### P0-2 · Dos clases CSS se usan pero no existen — ✅ CERRADO

- **Evidencia de cierre.** `.student-form { width: min(100%, 880px); }` definida en `styles.css:239`
  (alineada con `.student-profile`). `student-list-empty` ya no se referencia en el JSX de
  `StudentsPage.tsx` (el `<p>` quedó sin clase, la segunda opción propuesta).

### P0-3 · Los cambios sin guardar solo estaban protegidos contra un clic en el logotipo — ✅ CERRADO

- **Evidencia de cierre.** `LessonEditorPage.tsx:133-145` usa `useBlocker` de react-router (que cubre
  también el botón Atrás) más un listener de `beforeunload` para recarga/cierre de pestaña. El
  `querySelector('a.brand')` ya no existe. Se conservó el texto congelado
  `'Tienes cambios sin guardar. ¿Quieres descartarlos?'` con `window.confirm`, y el `bypassBlocker`
  para el tránsito `/lessons/new` → `/lessons/:id/edit` (línea 118).

### P0-4 · La red de seguridad del archivo más complejo estaba rota — ✅ CERRADO

- **Evidencia de cierre.** `LessonEditorPage.test.tsx`, `e2e/lessons.spec.ts` y
  `e2e/lesson-builder.spec.ts` navegan el wizard con el clic en «Continuar» y buscan «Guardar clase».
  La decisión de reparar los tests (pendiente en la v1 de este plan) se tomó en positivo.

---

## P1 — Alta prioridad

### P1-1 · La sesión solo se podía cerrar desde «Mis clases» — ✅ CERRADO

- **Evidencia de cierre.** El bloque de identidad + «Cerrar sesión» vive ahora en el `<header>` global
  de `App.tsx:25-27`, con renderizado condicional a la existencia de sesión. Las cadenas
  `'Sesión iniciada como'`, `'Cerrando…'` y `'Cerrar sesión'` se conservaron.

### P1-2 · Texto dirigido a desarrolladores en la pantalla principal — ✅ CERRADO

- **Evidencia de cierre.** La query `profile` a `/api/auth/me` y los párrafos `'Verificando tu
  cuenta…'` / `'Cuenta verificada con la API'` ya no existen en `LessonsPage.tsx`. El email sobrevive,
  movido al encabezado con P1-1.

### P1-3 · El reproductor no ofrece salida durante una actividad — ✅ CERRADO

- **Evidencia de cierre.** La barra de herramientas del reproductor incluye ya
  `<Link className="secondary" to="/">Volver a Mis clases</Link>` (`LessonPlayerPage.tsx:160`),
  reutilizando la cadena y el estilo de la pantalla de cierre. §C3 respetado: ningún testid nuevo,
  ningún botón contado por el e2e (`LessonPlayerPage.test.tsx:92,316` cubren la salida).

### P1-4 · El formulario de estudiante no tenía confirmación de salida — ✅ CERRADO

- **Evidencia de cierre.** `StudentFormPage.tsx:41-51` aplica el mismo mecanismo que P0-3: `useBlocker`
  + `beforeunload` + `window.confirm` con el texto congelado.

### P1-5 · El editor duplica el feedback de guardado exitoso — ✅ CERRADO

- **Evidencia de cierre.** Un solo canal por área: `notifyLessonSaved` sigue en el editor y el
  `<p role="status">` inline fue retirado (comentario en `LessonEditorPage.tsx:255`); en estudiantes se
  añadió `notifyStudentSaved` (`notifications.ts:37`) con la cadena exacta «Estudiante guardado.» y se
  retiró su inline (comentario en `StudentFormPage.tsx:93`). Los tests esperan el canal de alerta
  (`StudentFormPage.test.tsx:62`).

### P1-6 · Asimetrías entre clases y estudiantes — Tier A ✅ CERRADO · Tier B pendiente (Ronda 2, commit 5)

**Tier A — inconsistencias claramente visibles (Ronda 1) — cerrado:**

| Aspecto | Evidencia de cierre |
|---|---|
| Bloque de error de carga | `<div role="alert" className="error">` en el editor (`LessonEditorPage.tsx:290`), igual que la ficha |
| Botón de salida del error | `<Link className="button secondary" to="/">Volver a Mis clases</Link>` en ambos (`LessonEditorPage.tsx:291`) |
| Volver desde el listado | enlace «Mis clases» en `StudentsPage.tsx:41` (cadena existente, sin CTA nuevo) |

**Tier B — diferidos a Ronda 2 (menor riesgo, no afectan al uso diario hoy):**

| Aspecto | Decisión | Notas |
|---|---|---|
| Nivel por defecto (`'A2'` en clases vs `'B1'` en `emptyStudentValues()`) | **Unificar en `'A2'`** — decisión de producto tomada en v3 | Toca `student-schema.ts` y sus tests; se hace junto con P3-6 (`LEVELS`) en un solo commit |
| Vacíos de lista sin CTA en `LessonsPage` | Añadir CTA reutilizando cadenas del vocabulario existente | ⚠️ Verificar contra el contrato §C4 **antes** de escribir ninguna cadena; si exige texto nuevo, se descarta |
| Etiqueta de envío «Guardar» vs «Guardar clase» | **No se unifica** | «Guardar» está congelada por `specs/04-student-management-contract.md` y la buscan los e2e tal cual |

- **Complejidad.** Tier A: baja. Tier B: baja-media (el nivel por defecto altera tests).
- **Dependencias / riesgos.** Los tres puntos del Tier A son de riesgo mínimo individual. Los cambios
  del Tier B se hacen **después** de los del Tier A y cada uno comprueba `student-schema.test.ts` /
  `student-api.test.ts` en el mismo commit.

---

## P2 — Media prioridad

### P2-1 · `readErrorMessage` duplicado idéntico en dos archivos, con una rama muerta — **ABIERTO**

- **Problema.** La función está copiada **letra a letra** en `AssignedStudents.tsx:14-25` y
  `AssignedLessons.tsx:10-21`. Su rama `if (error instanceof Response)` es **código muerto**:
  `student-api.ts` solo lanza `Error` y `StudentSaveError`, nunca una `Response`.
- **Cambio propuesto.** Extraer a un módulo compartido (`src/students/student-errors.ts`, siguiendo el
  kebab-case con prefijo de área) y **borrar la rama `Response`**.
- **Complejidad.** Baja. Hacer junto con P2-2 (mismos dos archivos).

### P2-2 · `AssignedStudents` y `AssignedLessons` son gemelos casi idénticos — **ABIERTO (divergencias accidentales)**

- **Problema.** **Los dos usan `data-testid="student-picker"`** (`AssignedStudents.tsx:116`,
  `AssignedLessons.tsx:102`) sobre pickers distintos — cualquier selector e2e es ambiguo (riesgo real,
  no estética); los niveles de encabezado difieren; `assignFailure` se pinta dentro del picker en uno y
  arriba en el otro; solo uno tiene estado de carga.
- **Cambio propuesto.** **No proponer un componente genérico.** El proyecto lo prohíbe expresamente
  (*«No se crea una biblioteca de componentes ni otro sistema de diseño»*,
  `specs/01-gestion-de-clases.md:215`). Solo **alinear las divergencias accidentales**: un testid
  distinto por picker, el mismo nivel de encabezado, la misma posición para el error.
- **Riesgos.** Cambiar un `data-testid` rompe los e2e que lo usan: actualizarlos en el mismo commit.

### P2-3 · Código muerto: `listAssignedLessons` y su endpoint — **FUERA DEFINITIVO (decidido)**

- `listAssignedLessons` (`student-api.ts:167`) sigue solo consumido por su test. **Se conserva**: es
  candidato natural para la Fase 6 (reutilización de contenido). El backend no se toca.

### P2-4 · Fuentes fantasma en el CSS — **ABIERTO**

- **Problema.** `styles.css:2` declara `'DM Sans'` y `:14,38,81,101` declaran `Manrope`. **No hay
  ningún `@font-face` ni ningún enlace de fuente** en `src` ni en `index.html` (verificado por grep).
  Las dos familias no se cargan nunca y todo se renderiza con la fuente del sistema. Además contradice
  la regla documentada: *«Frontend usa CSS propio y fuentes del sistema, sin dependencias visuales ni
  fuentes externas»* (`docs/phase-1.md:149`).
- **Cambio propuesto.** Eliminar `'DM Sans'` y `Manrope` de las cinco declaraciones y dejar `system-ui`.
  El cambio visual es cero, pero el CSS deja de mentir. **Alternativa descartada:** cargar las fuentes
  de verdad — violaría la regla citada.
- **Hacer junto con P2-5:** ambas tocan las mismas líneas de `styles.css`.

### P2-5 · Variables de color inexistentes: hexadecimales repetidos en línea — **ABIERTO**

- **Problema.** `styles.css` no define **ninguna** custom property. Los mismos colores se repiten a
  mano, lo que hace que un ajuste de marca exija buscar y reemplazar en 238 líneas.
- **Cambio propuesto.** Introducir `--pf-*` en `:root` para los colores recurrentes y sustituir las
  apariciones. **No es un sistema de diseño nuevo**: son alias de los valores que ya existen, sin
  cambios visuales.
- **Complejidad.** Media. **Riesgo.** Bajo, pero toca muchas líneas: commit aislado y re-auditar
  después los 20 pares de contraste (no deben bajar de AA).

### P2-6 · Dos sistemas de diálogo conviviendo — **DECIDIDO: se mantiene SweetAlert2**

- **Decisión (v2, reconfirmada en v3).** SweetAlert2 **se conserva** como canal de feedback de guardado
  (éxito y error) — véase el alcance ajustado de P1-5. **Los 6 `window.confirm` restantes NO se
  migran**: los specs congelan explícitamente su comportamiento (texto
  `'Tienes cambios sin guardar. ¿Quieres descartarlos?'` con `confirm` nativo). La dependencia sigue en
  `package.json`.
- **Restos.** Lo único que podría rozar el contrato de cadenas en todo el plan son los CTA de vacíos de
  P1-6 Tier B — verificado antes de escribir, regla 5.

### P2-7 · El paso del wizard vive en una variable de módulo, no en la URL — **FUERA DEFINITIVO (decidido v3)**

- `carriedStep` (`LessonEditorPage.tsx:29`) sigue siendo un singleton mutable. Funciona; solo rompe la
  recarga en paso 2. Es el cambio más invasivo del plan y **no entra**: el coste (tocar el archivo más
  complejo, re-verificar el flujo de creación completo) supera con creces el beneficio (conservar el
  paso al recargar). Si algún día se hace: patrón hermano de `player-position.ts`
  (`?paso=info|actividades`).

### P2-8 · `draftFromSaved` lanza dentro de un inicializador de estado → pantalla en blanco — **ENTRA (Ronda 2)**

- **Problema.** `lesson-schema.ts:126` hace `default: throw new Error('Tipo de actividad desconocido: …')`,
  invocado dentro de un `useState` initializer. Un tipo no reconocido produce un crash de render y
  **no hay ningún error boundary en la aplicación**: pantalla en blanco sin explicación. Riesgo
  concreto (Fase 5-7 pueden emitir tipos nuevos) — pasa la regla de umbral.
- **Cambio propuesto.** Añadir un error boundary mínimo a nivel de ruta que pinte el bloque de error ya
  existente (`role="alert"` + «Volver a Mis clases»). **Conservar el `throw`** como señal de bug.
  Nota: `ActivityView.tsx` ya degrada correctamente ante tipos desconocidos — es el modelo a seguir.
- **Complejidad.** Baja-media.

### P2-9 · Contador de claves mutable a nivel de módulo — **ABIERTO (cancelable)**

- **Problema.** `let sequence = 0; function nextKey() { … }` (`lesson-schema.ts:72-76`). Estado global
  que nunca se reinicia: contamina entre tests y hace que las claves dependan del orden de ejecución.
- **Cambio propuesto.** Generar con `crypto.randomUUID()`, o derivar de `id` cuando existe. Comprobar
  que ningún test afirme sobre `'activity-1'` literal.
- **Nota v3.** Es el único ítem de Ronda 2 marcado como **cancelable**: no tiene síntoma visible para el
  usuario hoy. **Si los tests actuales son estables y orden-independientes, no se hace** (regla 1).

---

## P3 — Pulido (Ronda 2, parte baja)

### P3-1 · La flecha decorativa entre pasos es prácticamente invisible
`.editor-step + .editor-step::before { content:'→' }` con `#b6c0b4` sobre `#fffefb` = **1.86:1**.
Subirla a un tono que llegue a ~3:1 no cambia nada más. **Complejidad:** mínima.

### P3-2 · El 404 no se parece al resto de la aplicación
`App.tsx:87`: el enlace va **sin** `.button`, y falta el `eyebrow` del resto de pantallas.
**Complejidad:** mínima.

### P3-3 · Todas las rutas en una sola línea — **FUERA DEFINITIVO (decidido)**
`App.tsx:86`. Ruido de diffs sin beneficio funcional.

### P3-4 · Ocho bloques `@media (max-width:600px)` dispersos — **FUERA DEFINITIVO**
Consolidar choca con la convención de «añadir CSS solo al final» y arriesga la cascada.

### P3-5 · Etiquetas de tipo de actividad en dos idiomas — **FUERA DEFINITIVO**
Probablemente intencionado (jerga de enseñanza de idiomas) y congeladas por contrato.

### P3-6 · Opciones de nivel repetidas en cuatro sitios — **ENTRA (Ronda 2)**
`A2/B1/B2` hardcodeado en `LessonsPage.tsx`, `LessonEditorPage.tsx`, `StudentsPage.tsx` y
`StudentFormPage.tsx`. Extraer una constante `LEVELS` compartida. **Nota:** no es un sistema de diseño,
es una constante de dominio. Se hace **junto con el nivel por defecto de P1-6 Tier B** en un solo
commit (misma área).

### P3-7 · `index.html` incompleto
Faltan meta description, favicon y `theme-color`. El favicon es lo único con efecto visible.
**Complejidad:** mínima.

### P3-8 · `button:disabled { cursor: wait }` sobre botones permanentemente deshabilitados
`styles.css:24`. `cursor: not-allowed` sería más honesto. **Complejidad:** mínima.

### P3-9 · Doble área de desplazamiento en el reproductor — **FUERA DEFINITIVO**
`.lesson-player-body { max-height:60vh; overflow-y:auto }`. No se toca sin probarlo en una clase real:
puede ser deliberado para mantener los controles visibles.

---

## Decisiones tomadas (consolidado v3)

1. **P0-4 — tests en rojo.** Reparados. Cerrado.
2. **P2-6 — diálogos.** Se mantiene SweetAlert2 como canal de éxito en ambas áreas; los 6
   `window.confirm` quedan como están (congelados por spec).
3. **Estructural.** Entran **P2-8** y **P3-6**. Fuera **P2-7**, **P2-3**, **P3-3**.
4. **Nivel por defecto.** **Unificar en `'A2'`** (decisión de producto, v3). Se ejecuta en Ronda 2
   junto con `LEVELS`.
5. **P1-6 en Ronda 1.** Solo el Tier A (inconsistencias claramente visibles). Tier B (nivel por defecto,
   CTA de vacíos) difiere a Ronda 2.
6. **Ritmo de verificación.** Por cambio: `tsc -b` + `eslint` + tests afectados + manual. `vitest run`
   completo solo al cerrar cada ronda. Playwright siempre por archivo.

---

## Lo que NO se propone cambiar

Explícitamente, porque funciona o porque está congelado por contrato:

- **`ActivityView.tsx`** — lectura defensiva de JSONB, sin `dangerouslySetInnerHTML`, renderiza nada
  ante tipos desconocidos. Es el mejor archivo del proyecto.
- **`player-position.ts`** y todo el gobierno de la posición por URL en el reproductor.
- **El tracking de borrador sucio** por huella digital (`baseline` / `draftFingerprint`) y
  `revalidate()` limpiando mensajes mientras el profesor escribe.
- **El guardián `useBlocker` + `beforeunload` + `bypassBlocker`** (P0-3/P1-4): no se migra a modales ni
  se le cambia el texto.
- **`serverErrors()`** mapeando claves `activities[N].campo` del servidor sobre el borrador, y la
  auto-selección de la primera actividad con error.
- **`AssignedStudents` fuera del `<form>`** para que asignar no ensucie el borrador. Decisión sutil y
  correcta.
- **`isTextEntry()`** suprimiendo las flechas dentro de `input`/`textarea`, `aria-hidden` en
  separadores, `aria-pressed` en pantalla completa: todo según spec.
- **Todos los contrastes de texto** — los 20 pares auditados pasan AA. No hay nada que arreglar
  (salvo la flecha decorativa, P3-1).
- **El vocabulario de clases CSS, `data-testid` y cadenas de texto congelados**
  (`specs/04-student-management-contract.md:217-253` §C4, `:259`;
  `specs/03-reproductor-de-clases-parallel.md:88` §C3).
- **La etiqueta «Guardar» del formulario de estudiante** — congelada por contrato y buscada tal cual
  por `e2e/students.spec.ts`.
- **El modelo de un solo actor** (el profesor; los estudiantes son datos, no usuarios,
  `docs/student-management.md:34`).
- **No se propone i18n.** No existe estrategia documentada y no se ha pedido.
- **No se propone biblioteca de componentes ni sistema de diseño** — prohibido por
  `specs/01-gestion-de-clases.md:215`.
- **No se propone funcionalidad nueva.** No hay CRUD pendiente ni endpoint sin UI (salvo el cliente
  muerto de P2-3, que se conserva adrede).

---

## Plan de ejecución: dos rondas

### Ronda 1 — Correcciones que afectan al usuario

Objetivo: cerrar todo lo que un profesor puede notar. **Al terminar esta ronda el frontend se
declarará terminado** si la comprobación manual completa pasa.

| Orden | Ítem | Qué se hace |
|---|---|---|
| 1 | **P0-1** | Parser del 400 en `assignmentResponse` → patrón `Object.values(problem.errors)` de `studentResponse:90`. Auditar y corregir en el mismo commit cualquier test que asuma `errors` como array. Un commit |
| 2 | **P1-3** | Enlace «Volver a Mis clases» en la barra del reproductor (cadena y estilo existentes, §C3 respetado) |
| 3 | **P1-5** | Un solo canal de éxito por área: quitar inline del editor; `notifyStudentSaved` con la cadena existente |
| 4 | **P1-6 Tier A** | `className="error"` en el bloque de error del editor · `<Link className="button secondary">` en ambos · enlace «Mis clases» en `StudentsPage` |

**Verificación de cada ítem:** regla 2 de *Reglas de ejecución* (tsc → eslint → tests afectados →
manual específico).

**Cierre de ronda:** `vitest run` completo (una sola vez) · Playwright por archivo
(`lessons`, `lesson-builder`, `students`, `player`) · **comprobación manual de regresión en las cinco
pantallas** alumnas del plan (listado de clases, editor, reproductor, listado de estudiantes,
formulario/perfil) incluyendo: asignar un estudiante en papelera → motivo real visible; salir del
reproductor a mitad de clase; guardar clase y estudiante → un solo diálogo cada uno; 390px sin
desbordamiento horizontal.

### Ronda 2 — Limpieza técnica (solo si la Ronda 1 cerró verde)

Cada ítem autocontenido y cancelable de forma independiente según la regla de umbral.

| Orden | Ítem | Umbral |
|---|---|---|
| 5 | **P2-1 + P2-2** | hacer: la ambigüedad del testid duplicado es un riesgo de e2e real, no estética. E2e actualizados en el mismo commit |
| 6 | **P2-8** | hacer: error boundary de ruta; evita pantalla en blanco con datos de Fase 5-7 |
| 7 | **P2-4 + P2-5** | un commit CSS único: eliminar fuentes fantasma + custom properties `--pf-*` sin cambio visual; re-auditar los 20 pares de contraste |
| 8 | **P3-6 + nivel A2 (P1-6 Tier B)** | un commit: constante `LEVELS` compartida y `emptyStudentValues()` a `'A2'` con sus tests; CTA de vacíos de `LessonsPage` **solo** si no requiere cadena nueva |
| 9 | **P2-9** | **cancelable**: solo si se detecta contaminación real entre tests; `crypto.randomUUID()` en `nextKey` |
| 10 | **P3-1, P3-2, P3-7, P3-8** | pulido mínimo, sin orden entre ellos |

**Cierre de ronda:** `vitest run` completo + Playwright por archivo + re-auditoría de contraste +
manual 1440px/390px confirmando que nada cambió salvo lo explícito (flecha, cursor, 404, pestaña).

### Fuera definitivamente

P2-7 (wizard en URL) · P2-3 (`listAssignedLessons` se conserva) · P3-3 (formato de rutas) · P3-4
(consolidar media queries) · P3-5 (etiquetas bilingües) · P3-9 (scroll del reproductor).

---

## Veredicto de alcance

El frontend está **funcionalmente completo**. A partir de este punto el coste de cada limpieza
adicional supera su beneficio marginal: el riesgo de regresión crece mientras el usuario ya no nota
defectos fuera de los listados en P0-1 y el Tier A de P1-6. La meta del plan es estrecha:

1. Cerrar el único defecto funcional restante (P0-1).
2. Cerrar las fricciones de uso que un profesor sí nota (P1-3, P1-5, P1-6 Tier A).
3. Hacerlo con el menor número de ejecuciones de tests posible (reglas de ejecución).

**Ronda 1 + cierre en verde = frontend terminado.** La Ronda 2 es opcional por diseño y se evalúa
contra el umbral ítem a ítem, no como bloque.

---

## Plan de ejecución detallado — Ronda 2 (v4)

> **Revisión 4:** la Ronda 1 se verificó **completa contra el código** (P0-1 en
> `student-api.ts:132`, P1-3 en `LessonPlayerPage.tsx:160`, P1-5 en `notifications.ts:37` con los
> inline retirados según los comentarios de `LessonEditorPage.tsx:255` y `StudentFormPage.tsx:93`,
> y P1-6 Tier A en `LessonEditorPage.tsx:290-291` y `StudentsPage.tsx:41`), pero el cuerpo de este
> documento aún los marca ABIERTO: el paso 0 corrige esos estados. Este apartado documenta el plan
> de ejecución de la Ronda 2 con las decisiones cerradas y la evidencia de seguridad verificada.

### Decisiones tomadas (v4)

1. **P2-2 testid.** Se aprueba enmendar `specs/04-student-management-contract.md` §C4 (tabla de
   `data-testid` congelados, línea 252): el picker de la ficha pasa a `lesson-picker`; el del
   editor conserva `student-picker`. El mismo commit que cambia el código enmienda el contrato.
2. **P2-9.** **CANCELADO**: ningún test ni e2e depende del contador de `nextKey()` (el
   `'activity-1'` de `LessonEditorPage.test.tsx:60` es un draft construido a mano, no una
   aserción de la salida). Sin contaminación detectada, no pasa la regla de umbral.
3. **CTA de vacíos de `LessonsPage`.** Se añade en el commit de P3-6 reutilizando la cadena
   «Crear clase» ya existente (`LessonsPage.tsx:50`): sin cadena nueva, cumple la regla 5.
4. **Encabezados por ítem (P2-2).** El `<h3>` de `AssignedLessons.tsx:86` se degrada a
   `<p className="assigned-lesson-title">` — la clase ya existe (`styles.css:225`) y así ninguna
   de las dos listas queda con encabezado por ítem.

### Evidencia de seguridad verificada (grep sobre el código, no suposición)

- Ningún test ni e2e usa `data-testid="student-picker"` fuera de los dos componentes; el e2e de
  estudiantes localiza el selector por etiqueta (`getByLabel('Asignar clase')`,
  `e2e/students.spec.ts:95`).
- Ningún test ni e2e depende del nivel por defecto `'B1'`: todos seleccionan nivel explícito
  (`e2e/students.spec.ts:61,183,193`, `e2e/lessons.spec.ts:29,62`). Solo `student-schema.test.ts:19`
  lo afirma, y se corrige en el mismo commit.
- No existe `react-error-boundary` en `package.json`: el boundary de P2-8 se escribe a mano
  (clase React mínima), **sin dependencia nueva**.
- No existe `frontend/public/`: P3-7 lo crea junto con `favicon.svg`.
- Inventario de colores de `styles.css` con ≥3 apariciones (**12**, candidatos a `--pf-*`):
  `#173b37` (13), `#dfe5d8` (12), `#3c5a4e` (9), `#97b54d` (8), `#234e41` (8), `#286354` (8),
  `#f1f5e6` (5), `#c5d1c5` (5), `#f7f8f2` (3), `#62736b` (3), `#a52d31` (3), `#607448` (3).
  Los de 1-2 apariciones (hovers, sombra `#234e4108`, `#fffefb`, `#173d32`) quedan en línea —
  regla de umbral.
- `#62736b` sobre `#fffefb` da ~4,9:1: reutilizarlo como color de la flecha decorativa (P3-1)
  evita inventar un tono nuevo.

### Secuencia de commits

Cada commit es autocontenido y reversible de forma independiente (regla 7). Verificación por
cambio (regla 2): `npx tsc -b` → `npx eslint .` → tests directamente relacionados → comprobación
manual específica.

| # | Ítem | Contenido del commit |
|---|---|---|
| 0 | Documentación | Actualizar los estados del cuerpo de este documento: P0-1, P1-3, P1-5 y P1-6 Tier A pasan a ✅ CERRADO con evidencia archivo:línea (ver nota de revisión 4 arriba). Sin código |
| 1 | P2-1 | Crear `src/students/student-errors.ts` exportando `readErrorMessage` **síncrona** (sin la rama muerta `Response` queda `error instanceof Error ? error.message : fallback`); importarla en `AssignedStudents.tsx` y `AssignedLessons.tsx`, borrar las copias locales y simplificar los `onError: async` a síncronos. Fallbacks literales intactos. Tests: `AssignedStudents.test.tsx`, `AssignedLessons.test.tsx` |
| 2 | P2-2 | (a) `AssignedLessons.tsx:102` → `data-testid="lesson-picker"`; enmendar specs/04 §C4 con la nueva fila. (b) Unificar `assignFailure` dentro del picker en ambos (mover el bloque de `AssignedLessons.tsx:74-75` al picker). (c) Degradar el `<h3>` de `AssignedLessons.tsx:86` a `<p>` (decisión v4.4). Tests: ambos componentes |
| 3 | P2-8 | `src/RouteErrorBoundary.tsx`: clase React mínima (`static getDerivedStateFromError` + `componentDidCatch` con log). Fallback = bloque estándar `role="alert"` + `className="error"` + `<Link className="button secondary">Volver a Mis clases</Link>` (cero cadenas nuevas). Envolver `<Routes>` en `App.tsx:83`. El `throw` de `draftFromSaved` (`lesson-schema.ts:126`) **se conserva** como señal de bug. Incluye test nuevo: montar un componente que lance y afirmar el bloque y el enlace |
| 4 | P2-4 + P2-5 | Un commit CSS único: eliminar `'DM Sans'` (`styles.css:2,37`) y `Manrope` (`:14,38,81,101`) dejando `system-ui`; definir en `:root` las 12 custom properties `--pf-*` del inventario y sustituir apariciones. **Cero cambio visual**; re-auditar los 20 pares de contraste en el mismo commit |
| 5 | P3-6 + nivel A2 + CTA | `src/levels.ts`: `export const LEVELS = ['A2', 'B1', 'B2'] as const;` (módulo raíz, como `notifications.ts`). Sustituir los triplets `<option>` de `LessonsPage.tsx:60`, `LessonEditorPage.tsx:226`, `StudentsPage.tsx:53` y `StudentFormPage.tsx:71` por `LEVELS.map(...)`. `emptyStudentValues()` a `'A2'` (`student-schema.ts:54`) y corregir `student-schema.test.ts:19`. Añadir el CTA de vacíos bajo «Aún no tienes clases.» (`LessonsPage.tsx:81`) con la cadena «Crear clase» existente (decisión v4.3). Tests: `student-schema.test.ts`, `LessonsPage.test.tsx`, `StudentFormPage.test.tsx`, `StudentsPage.test.tsx` |
| 6 | P3-1 | Flecha decorativa `#b6c0b4` → `#62736b` (`styles.css:89`), vía la `--pf-*` del commit 4. ~4,9:1, cumple 3:1 |
| 7 | P3-2 | `App.tsx:87`: `<Link className="button" ...>` en el 404. El eyebrow **queda fuera**: exigiría una cadena nueva y ninguna existente encaja con un 404 (regla 5) |
| 8 | P3-7 | Crear `frontend/public/` + `favicon.svg` (glifo minimal con colores de marca); en `index.html`: `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`, `<meta name="description">` (única cadena nueva del plan, metadato aprobado por el propio P3-7) y `<meta name="theme-color" content="#f5f6ef">` |
| 9 | P3-8 | `styles.css:24`: `cursor: wait` → `cursor: not-allowed` |

Los commits 6-9 no tienen orden entre sí; todos posteriores al 5.

### Cierre de la ronda (una sola vez)

1. `npm --prefix frontend run test` (vitest completo).
2. Playwright **por archivo, uno a uno**: `lessons`, `lesson-builder`, `students`, `player`.
3. Re-auditoría de los 20 pares de contraste + la flecha nueva.
4. Manual 1440px/390px confirmando que nada cambió salvo lo explícito: flecha, cursor, 404,
   pestaña/favicon.
