# SPEC 03 — Reproductor de clases (Lesson Player)

> **Estado:** Borrador
> **Depende de:** SPEC 01 — Gestión de clases; SPEC 02 — Editor de actividades (MVP simplificado).
> **Fecha:** 2026-09-23
> **Objetivo:** Permitir impartir una clase actividad por actividad, con navegación anterior/siguiente, contador de progreso y una vista de solo lectura preparada para usarse durante una sesión real.

---

## 1. Objetivo

Cerrar el flujo del producto hasta el momento para el que existe todo lo anterior: dar la clase.

```text
Login → Mis clases → Iniciar clase → Actividad 1 → Siguiente → … → Última actividad
      → Cierre de la clase → Volver a Mis clases
```

La meta es validar con profesores reales que una clase preparada se puede impartir sin salir de la
aplicación y sin abrir el editor.

**Esta especificación no toca el backend.** `GET /api/lessons/{id}` ya devuelve la clase con sus
actividades ordenadas, su contenido, su duración por actividad y su total calculado, y ya devuelve
404 para una clase ajena, inexistente o en papelera. Todo lo que hace falta leer existe desde SPEC 01
y SPEC 02. El reproductor es una pantalla nueva de solo lectura sobre ese contrato.

Se conservan React + TypeScript + Vite, TanStack Query, React Router, los componentes y el estilo
visual existentes, y el patrón de rutas protegidas. No se añaden dependencias.

---

## 2. Alcance

**Incluye:**

- Ruta propia del reproductor, protegida, con una acción **Iniciar clase** en el listado.
- Lectura del detalle de la clase reutilizando el transporte y la caché existentes.
- Una actividad por pantalla, completa, con desplazamiento cuando el contenido no cabe.
- Contenido de solo lectura de los cuatro tipos de actividad, como texto plano.
- Navegación Anterior / Siguiente con botones y con flechas del teclado.
- Contador de progreso «Actividad N de M» y la posición reflejada en la URL.
- Pantalla de cierre al terminar la última actividad, con resumen y salida.
- Estado vacío para una clase sin actividades, con enlace al editor.
- Estados de carga, error y 404 con salida a Mis clases.
- Botón de pantalla completa y enlace discreto **Editar**.
- Estilos del reproductor, comportamiento en pantalla estrecha y accesibilidad por teclado.

**Fuera del alcance (para versiones posteriores):**

- Cualquier cambio de backend: endpoints, DTO, dominio, migraciones o base de datos.
- Persistencia del progreso: ni en la base de datos, ni en `localStorage`, ni por usuario.
- Respuestas del estudiante, corrección, puntuación o analíticas de la sesión.
- Temporizador, cronómetro, notas del profesor o marcas de actividad vista.
- Navegación pregunta a pregunta dentro de una actividad.
- Edición del contenido desde el reproductor.
- Modo concentración permanente, ventana propia, PWA u offline.
- Impresión, exportación, compartir la clase o generar un enlace público.
- Atajos de teclado configurables.
- Virtualización o paginación del contenido largo.

---

## 3. Comportamiento del reproductor

### 3.1 Entrada y ruta

- Ruta `/lessons/:id/play`, dentro del bloque de rutas protegidas: sin sesión redirige a `/login`.
- Cada clase activa del listado **Mis clases** ofrece la acción **Iniciar clase**.
- Las clases en papelera no ofrecen la acción; su detalle devuelve 404 y el reproductor lo comunica.
- El editor **no** gana ningún punto de entrada al reproductor en esta especificación.
- El reproductor no crea, modifica ni elimina nada: no envía ninguna petición de escritura.

### 3.2 Posición y URL

La URL es la única fuente de verdad de la posición:

```text
/lessons/:id/play                  → primera actividad
/lessons/:id/play?actividad=3      → tercera actividad (base 1, coincide con el contador visible)
/lessons/:id/play?actividad=fin    → pantalla de cierre
```

- `actividad` es un entero con base 1, entre 1 y el número de actividades de la clase.
- Sin parámetro se muestra la primera actividad.
- Un valor ausente, no numérico, no entero, menor que 1 o mayor que el número de actividades se
  resuelve a la primera actividad y la URL se normaliza **sin** añadir una entrada al historial.
- Cada cambio de actividad con Anterior, Siguiente o las flechas empuja una entrada al historial.
- Consecuencia asumida: el botón **Atrás** del navegador recorre las actividades visitadas hacia
  atrás, y desde la primera actividad sale del reproductor.
- Una clase sin actividades ignora `actividad` por completo y muestra el estado vacío.
- Si la clase cambia mientras el reproductor está abierto y la actividad indicada por la URL deja de
  existir (por ejemplo, tras eliminar actividades desde otra pestaña), la posición se normaliza a la
  primera actividad siguiendo las mismas reglas de validación descritas anteriormente.
- Recargar la página reproduce exactamente la actividad que indica la URL.
- La URL no se comparte como enlace público: sigue siendo una ruta protegida.

### 3.3 Contenido de la actividad

Se muestra **una actividad por pantalla**, completa, con desplazamiento vertical cuando no cabe.
No hay subnavegación: las preguntas y los ejercicios se listan juntos, no de uno en uno.

Cabecera de contexto de la sesión:

- Título de la clase y nivel.
- «Actividad N de M».
- Título de la actividad y su duración en minutos; «Sin duración» cuando es `null` por datos heredados.
- Una duración con valor `0` se muestra como «0 min». Solo los valores `null` se representan como
  «Sin duración».

Cuerpo, en el orden persistido:

| Tipo | Se muestra |
| --- | --- |
| Speaking | Instrucciones y lista numerada de preguntas |
| Reading | Instrucciones, texto de lectura y lista numerada de preguntas |
| Writing | Instrucciones y consigna |
| VocabularyGrammar | Instrucciones, explicación y lista numerada de ejercicios |

- Las instrucciones siempre están presentes: son obligatorias desde SPEC 02.
- El orden de las actividades es el de la respuesta del servidor (`order` consecutivo desde cero).
- El texto se representa siempre como texto, en elementos de bloque; nunca como HTML ejecutable.
- No se usa `dangerouslySetInnerHTML` en ningún punto del reproductor.
- El reproductor no reinterpreta el contenido: si un tipo llega con contenido inesperado, se muestra
  lo que exista y no se inventa nada.

### 3.4 Navegación y extremos

- Botones **Anterior** y **Siguiente**, visibles en todo momento.
- **Anterior** está deshabilitado (visible, no oculto) en la primera actividad.
- **Siguiente** en la última actividad abre la pantalla de cierre.
- Flechas **Izquierda** y **Derecha** del teclado equivalen a Anterior y Siguiente.
- Las flechas no actúan cuando el foco está en un elemento de edición o captura de texto (`input`,
  `textarea` o cualquier elemento `contenteditable`), ni en la pantalla de cierre, ni en el estado
  vacío, ni en el estado de error.
- Al cambiar de actividad, el contenedor desplazable principal del reproductor vuelve al inicio. Si
  existe desplazamiento del documento además del contenedor, ambos se restablecen al inicio para
  garantizar que la nueva actividad comienza visible desde su encabezado.
- Los botones son elementos reales, alcanzables con Tab y activables con Enter o Espacio.

### 3.5 Pantalla de cierre

No es una actividad: es el final explícito de la sesión. Se alcanza con Siguiente en la última
actividad y se representa en la URL como `?actividad=fin`, para que recargar no devuelva al profesor
a la última actividad.

Muestra:

- Título de la clase.
- Número de actividades impartidas.
- Duración total de la clase; «Duración incompleta» cuando el total persistido es `null`.

Acciones:

- **Repetir la clase** → vuelve a la primera actividad y empuja una entrada al historial.
- **Volver a Mis clases** → sale del reproductor.

### 3.6 Estados

| Estado | Qué se muestra |
| --- | --- |
| Cargando | Mensaje de espera, con el mismo patrón que el resto de la aplicación |
| Error de red | Mensaje y acción de reintento, sin salir de la pantalla |
| 404 | «La clase no existe o no está disponible.» y enlace a Mis clases |
| Sin actividades | «Esta clase todavía no tiene actividades.» y enlace **Editar la clase** |
| Sin duración | La actividad se reproduce igual, con «Sin duración» en su cabecera |
| Duración incompleta | La clase se reproduce igual; el cierre muestra «Duración incompleta» |

- Una clase sin actividades no muestra contador, botones de navegación ni pantalla de cierre.
- El estado vacío ofrece la salida natural: ir al editor a agregar la primera actividad.

### 3.7 Vista preparada para la clase

- **Botón de pantalla completa** que entra y sale del modo.
- Pasa a pantalla completa el contenedor del reproductor, no el documento: la cabecera y el pie de la
  aplicación desaparecen solo mientras el modo está activo.
- El botón refleja el estado real de la pantalla completa (escuchar `fullscreenchange`), de modo que
  salir con `Esc` deja la interfaz coherente.
- Si la API de pantalla completa no está disponible, el botón no se ofrece y el reproductor funciona
  igual.
- Entrar o salir de pantalla completa no cambia de actividad ni pierde la posición.
- **Enlace «Editar»** discreto en la cabecera del reproductor, hacia `/lessons/:id/edit`. Sale del
  modo clase; no hay edición dentro del reproductor.
- Se conservan los componentes y el estilo visual de la aplicación: no se crea otro sistema de diseño.
- En pantalla estrecha la cabecera, el contenido y los controles se apilan y siguen utilizables, sin
  desbordamiento horizontal a 390 px.

---

## 4. Modelo de datos

**No hay datos nuevos.** No se añaden columnas, tablas, entidades, migraciones ni restricciones.

- `Lesson.EstimatedDuration` se lee tal cual: minutos, `0` para una clase sin actividades y `null`
  cuando alguna actividad heredada carece de duración.
- `Activity.EstimatedDuration` se lee tal cual y puede ser `null`.
- `Activity.Content` (JSONB) se lee como texto plano, con la columna `Type` como discriminador
  autoritativo, igual que en el editor.
- El progreso de la sesión no se persiste en ninguna forma.

---

## 5. API necesaria

**Ningún endpoint nuevo ni modificado.** No hay endpoints de progreso, de sesión ni de lectura
alternativa.

| Método y ruta | Uso en el reproductor |
| --- | --- |
| `GET /api/lessons/{id}` | Lectura única de la clase: metadatos, actividades ordenadas, duración por actividad y total |

- Se reutilizan `getLesson` y la clave de detalle de TanStack Query ya existentes en
  `frontend/src/lessons/lesson-api.ts`.
- Reutilizar la misma clave mantiene coherentes la caché del listado, la del editor y la del
  reproductor: editar y luego impartir no muestra datos viejos.
- Los errores 401 y 404 ya están traducidos a mensajes por el transporte existente.

---

## 6. Pantallas frontend

| Ruta | Pantalla | Cambio |
| --- | --- | --- |
| `/` | Mis clases | Añade la acción **Iniciar clase** en cada clase activa |
| `/lessons/:id/play` | Reproductor de clases | Nueva |
| `/lessons/new`, `/lessons/:id/edit` | Editor | Sin cambios |
| `/lessons/trash` | Papelera | Sin cambios; sin acción de reproducir |

- El reproductor vive dentro del mismo marco de la aplicación: misma cabecera, mismo pie, mismos
  estilos y mismos patrones de estado.
- La acción **Iniciar clase** no aparece en la papelera ni en una clase sin actividades.
- La ruta del reproductor sigue siendo válida para una clase sin actividades y muestra el estado
  vacío correspondiente.
- No existe ninguna acción visible adicional en la interfaz para acceder al reproductor de una clase
  sin actividades.

---

## 7. Archivos a crear o modificar

**Modificar:**

- `frontend/src/App.tsx` — ruta protegida `/lessons/:id/play`.
- `frontend/src/lessons/LessonsPage.tsx` — acción **Iniciar clase** en cada clase activa.
- `frontend/src/lessons/LessonsPage.test.tsx` — cobertura de la acción nueva.
- `frontend/src/styles.css` — estilos del reproductor, de la pantalla de cierre y de los estados.
- `README.md` — enlace a la guía del reproductor.

**Crear:**

- `frontend/src/lessons/LessonPlayerPage.tsx` — pantalla del reproductor: carga, contexto,
  navegación, cierre y estados.
- `frontend/src/lessons/ActivityView.tsx` — presentación de solo lectura de una actividad por tipo.
- `frontend/src/lessons/player-position.ts` — lectura, validación y normalización del parámetro
  `actividad`; funciones puras, sin React.
- `frontend/src/lessons/player-position.test.ts`.
- `frontend/src/lessons/ActivityView.test.tsx` — los cuatro tipos y el texto plano.
- `frontend/src/lessons/LessonPlayerPage.test.tsx`.
- `frontend/e2e/lesson-player.spec.ts` — recorrido permanente en navegador real.
- `docs/lesson-player.md` — guía de uso y límites, en el formato de `docs/activity-editor.md`.

**Sin cambios previstos:** todo `backend/`, `frontend/src/lessons/lesson-api.ts`,
`frontend/src/lessons/lesson-schema.ts`, `frontend/src/lessons/LessonEditorPage.tsx`,
`frontend/src/auth.ts`.

No se añaden dependencias. No se incorpora ninguna biblioteca de pantalla completa, de atajos de
teclado ni de presentación por diapositivas.

---

## 8. Plan de implementación

Diez etapas. Cada una deja el proyecto compilando, se puede probar por separado y acerca directamente
al flujo de dar clase.

| Etapa | Entrega | Verificación |
| --- | --- | --- |
| 1 | Módulo puro de posición: lectura de `actividad`, base 1, `fin` y normalización a la primera actividad | `player-position.test.ts`: sin parámetro, valor válido, `fin`, cero, negativo, no numérico, decimal y fuera de rango |
| 2 | Ruta protegida `/lessons/:id/play` y carga del detalle con estados de carga, error y 404 | `LessonPlayerPage.test.tsx`: 404 con salida a Mis clases, error con reintento, sin escrituras |
| 3 | Cabecera de contexto: título, nivel, «Actividad N de M», título y duración de la actividad | Pruebas de los tres textos, incluido «Sin duración» |
| 4 | `ActivityView` de solo lectura para los cuatro tipos, con instrucciones y texto plano | `ActivityView.test.tsx`: campos por tipo, HTML mostrado como texto, sin `dangerouslySetInnerHTML` |
| 5 | Navegación Anterior / Siguiente con extremos, flechas del teclado y vuelta al principio del documento | Pruebas de extremos, flechas, foco en campos de texto y reinicio del desplazamiento |
| 6 | Sincronización con la URL: empujar entradas al cambiar de actividad y restaurar la posición al recargar | Pruebas de historial y de recarga; el contador coincide con la URL |
| 7 | Estado vacío de una clase sin actividades, con enlace al editor | Prueba del estado vacío y de la ausencia de controles de navegación |
| 8 | Pantalla de cierre con resumen y acciones, incluida **Repetir la clase** | Pruebas del resumen, de «Duración incompleta» y de la vuelta a la primera actividad |
| 9 | Botón de pantalla completa, enlace **Editar** y accesibilidad | Prueba de estado real del botón, de que no se pierde la actividad y del enlace al editor |
| 10 | Acción **Iniciar clase** en Mis clases, pantalla estrecha, E2E y documentación | `LessonsPage.test.tsx`, E2E `lesson-player.spec.ts` y `docs/lesson-player.md` |

- Cada etapa incorpora las pruebas focalizadas de la regla o el componente que conecta.
- No se escribe ningún test contra el backend, porque no hay cambios de backend que probar.
- El E2E se amplía durante la integración de la interfaz, no al final.

---

## 9. Criterios de aceptación

**Entrada y acceso**

- [ ] Desde Mis clases se abre `/lessons/:id/play` de una clase propia con la acción **Iniciar clase**.
- [ ] La papelera no ofrece esa acción.
- [ ] Sin sesión, la ruta del reproductor redirige a `/login`.
- [ ] Una clase ajena, inexistente o en papelera muestra el 404 con salida a Mis clases.
- [ ] El reproductor no envía ninguna petición de escritura.

**Contenido**

- [ ] Se ve una sola actividad a la vez, completa, con desplazamiento cuando el contenido no cabe.
- [ ] Se muestran las instrucciones y el contenido propio del tipo en los cuatro tipos.
- [ ] Las preguntas y los ejercicios se listan juntos y numerados, sin subnavegación.
- [ ] El orden mostrado es el orden persistido de las actividades.
- [ ] El texto HTML introducido se muestra como texto y nunca se ejecuta.
- [ ] La cabecera muestra título de la clase, nivel, «Actividad N de M», título y duración de la
      actividad; «Sin duración» cuando la actividad heredada no tiene duración.
- [ ] Una clase con duraciones incompletas se reproduce igual.

**Navegación y progreso**

- [ ] Anterior y Siguiente cambian de actividad; Anterior está deshabilitado en la primera.
- [ ] Las flechas izquierda y derecha equivalen a los botones y no actúan con el foco en un elemento
      de edición o captura de texto (`input`, `textarea` o `contenteditable`).
- [ ] Al cambiar de actividad el contenedor desplazable del reproductor vuelve al inicio, y también
      el documento cuando existe desplazamiento propio.
- [ ] El contador «Actividad N de M» coincide siempre con la actividad mostrada.
- [ ] La URL refleja la actividad actual y recargar reproduce esa misma actividad.
- [ ] Abrir directamente `/lessons/:id/play?actividad=N` muestra la actividad N indicada cuando el
      valor es válido.
- [ ] Abrir directamente `/lessons/:id/play?actividad=fin` muestra la pantalla de cierre.
- [ ] El botón Atrás del navegador recorre las actividades visitadas.
- [ ] Un `actividad` ausente, no numérico, decimal, cero, negativo o mayor que el número de
      actividades muestra la primera actividad y normaliza la URL sin añadir historial.
- [ ] Una clase sin actividades muestra el estado vacío con enlace al editor y sin controles de
      navegación.

**Cierre y vista de clase**

- [ ] Siguiente en la última actividad abre la pantalla de cierre.
- [ ] El cierre muestra título, número de actividades y duración total; «Duración incompleta» cuando
      el total es `null`.
- [ ] **Repetir la clase** vuelve a la primera actividad.
- [ ] **Volver a Mis clases** sale del reproductor.
- [ ] Recargar en el cierre mantiene el cierre y no vuelve a la última actividad.
- [ ] El botón de pantalla completa entra y sale del modo, refleja el estado real y no pierde la
      actividad actual.
- [ ] El enlace **Editar** lleva al editor de esa clase.
- [ ] A 390 px no hay desbordamiento horizontal y los controles siguen utilizables.
- [ ] Anterior y Siguiente son alcanzables con Tab y activables con Enter o Espacio.

**Alcance**

- [ ] No se añade ningún endpoint, DTO, columna, migración ni cambio de dominio.
- [ ] No se persiste el progreso en la base de datos ni en `localStorage`.
- [ ] No hay temporizador, notas, respuestas del estudiante ni marcas de actividad vista.
- [ ] No hay edición dentro del reproductor.
- [ ] No hay modo concentración permanente ni pantalla completa automática.
- [ ] El editor y la papelera siguen funcionando igual.
- [ ] `npx tsc -b`, `npx eslint .` y las suites existentes siguen en verde.

**Comprobaciones ejecutables al implementar**

- `npx tsc -b` y `npx eslint .` desde `frontend/`.
- `npx vitest run` con las suites nuevas de posición, actividad y pantalla.
- `npx playwright test` con el recorrido del reproductor.
- `dotnet build Profefacilisimo.slnx --no-restore` para confirmar que el backend no se ha movido.

No se han ejecutado estas comprobaciones durante la redacción.

---

## 10. Decisiones tomadas y descartadas

**Confirmadas por el usuario:**

- Entrada desde Mis clases con la acción **Iniciar clase** y ruta propia `/lessons/:id/play`.
- El editor no gana un punto de entrada al reproductor.
- De la vista optimizada, solo el botón de pantalla completa.
- Se conserva el marco actual de la aplicación; la actividad ocupa el resto.
- Una clase sin actividades muestra un estado vacío con enlace al editor.
- Una clase con duración incompleta se reproduce igual.
- Solo lectura: sin edición dentro del reproductor, con un enlace **Editar** que sale del modo clase.
- La actividad completa en una sola vista, con desplazamiento, sin subnavegación.
- Anterior / Siguiente con flechas del teclado; Anterior deshabilitado en la primera y Siguiente en la
  última abre la pantalla de cierre.
- Indicador de progreso reducido a «Actividad N de M»: sin barra y sin puntos de salto.
- La posición vive en la URL y sobrevive a una recarga.
- El botón Atrás del navegador recorre las actividades visitadas.
- Contexto visible: título de la clase, nivel, y título y duración de la actividad actual.
- Cierre con resumen, **Volver a Mis clases** y **Repetir la clase**.

**Derivadas del cruce de las respuestas anteriores (para revisión explícita):**

- `actividad` usa base 1, para coincidir con el contador visible, y `fin` representa la pantalla de
  cierre. Sin `fin`, el cierre no sobreviviría a una recarga y la URL dejaría de ser la fuente de
  verdad que se pidió.
- La normalización de un `actividad` inválido reemplaza la URL sin añadir historial, porque corregir
  un valor no es una acción del profesor.
- Las flechas son Izquierda y Derecha y se ignoran con el foco en un campo de texto.
- La pantalla completa se aplica al contenedor del reproductor, no al documento, porque se decidió
  conservar el marco de la aplicación.
- Una actividad heredada sin duración muestra «Sin duración», en la línea del «Duración incompleta»
  que SPEC 02 ya usa para la clase.
- El enlace **Editar** vive en la cabecera del reproductor y no en la pantalla de cierre, porque la
  pantalla de cierre se definió sin él.

**Descartadas:**

- Navegar pregunta a pregunta dentro de una actividad: añadía un segundo nivel de navegación y más
  estados para el mismo resultado.
- Barra de progreso y puntos de salto: se prefirió el contador solo.
- Persistencia del progreso en la base de datos: habría exigido columna, migración y escritura en la
  API para una comodidad que la URL ya cubre.
- Temporizador por actividad: muestra un dato que ya está en pantalla como duración y añade estado de
  tiempo que nadie pidió.
- Modo concentración permanente y pantalla completa automática: el marco de la aplicación se
  conserva.
- Edición rápida en línea desde el reproductor: reabre el guardado conjunto de SPEC 02 en mitad de una
  clase.
- Reutilizar el editor como reproductor: mezclaba dos estados incompatibles en una misma pantalla.

---

## 11. Riesgos

| Riesgo | Tratamiento |
| --- | --- |
| Contenido largo que obliga a desplazarse | Se acepta el desplazamiento; la virtualización queda pospuesta |
| `actividad` manipulado a mano o desactualizado tras editar la clase | Normalización silenciosa a la primera actividad |
| El historial se llena de entradas al recorrer la clase | Es el comportamiento elegido; la salida explícita es **Volver a Mis clases** |
| Confusión entre el botón Atrás y la salida del reproductor | La pantalla de cierre ofrece la salida sin ambigüedad |
| Pantalla completa no disponible o cancelada por el navegador | El botón refleja el estado real y el reproductor funciona igual sin ella |
| Duración heredada nula | Se muestra «Sin duración» y no impide dar la clase |
| Regresión en Mis clases al añadir la acción nueva | La suite de `LessonsPage` cubre la acción y la papelera |
| Divergencia entre la caché del editor y la del reproductor | Ambos usan la misma clave de detalle de TanStack Query |
| Dos ejecuciones de Playwright en paralelo sobre el mismo puerto | El E2E se serializa, como en SPEC 02 |
| Listeners globales de teclado duplicados o sin limpiar correctamente | Registrar y liberar los listeners junto al ciclo de vida del componente |

---

## 12. Qué NO se hará en esta especificación

- No se toca el backend: ni endpoints, ni DTO, ni dominio, ni migraciones, ni base de datos.
- No hay respuestas del estudiante, corrección automática, puntuación ni analíticas de la sesión.
- No hay temporizador, cronómetro, notas del profesor ni marcas de progreso persistidas.
- No hay navegación pregunta a pregunta.
- No hay edición del contenido desde el reproductor.
- No hay impresión, exportación, compartir la clase ni enlace público.
- No hay modo presentación con ventana propia, PWA ni offline.
- No hay atajos de teclado configurables.
- No se cambian autenticación, framework, arquitectura ni dependencias.

Cada uno de esos puntos, si llega, va en su propia especificación.
