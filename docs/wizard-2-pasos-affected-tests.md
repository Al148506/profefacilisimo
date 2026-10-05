# Reporte de pruebas afectadas — Wizard de 2 pasos en «Crear clase»

**Rama:** `feat/crear-clase-wizard-2-pasos` (desde `main`, `fd69352`)
**Estado:** pruebas reparadas y en verde — ver §7
**Fecha:** 2026-09-25 · actualizado 2026-09-29

Este documento se escribió bajo una instrucción explícita: los tests existentes **no se modificaban**,
solo se enumeraban las pruebas que fallarían por el cambio de interfaz y por qué, para que el usuario
decidiera qué hacer con ellas.

Esa decisión ya se tomó y se aplicó el 2026-09-29: **se autorizó una excepción única a la regla de
«documentar sin modificar»** para poder reparar la red de seguridad antes de tocar el resto del
frontend. Las secciones 2 y 3 se conservan tal como se escribieron — son el diagnóstico original — y
la sección 7 registra lo que se hizo realmente, incluido un defecto funcional que el cierre de la
sección 2 negaba y que resultó existir.

## 1. Qué cambió en la interfaz

El editor de clases (`/lessons/new` y `/lessons/:id/edit`) pasa de una sola pantalla a un asistente
de dos pasos:

| Antes | Ahora |
| --- | --- |
| Metadatos y actividades visibles a la vez | Paso 1 solo metadatos, paso 2 solo actividades |
| Botón de envío «Guardar» | Paso 1: «Cancelar» + «Continuar» (no envía). Paso 2: «Atrás» + «Guardar clase» |
| Sin indicador de progreso | Indicador «Paso N de 2» + etiquetas de paso |
| Los campos de actividad existían siempre en el DOM | En el paso 1 no existen en el DOM (y al revés) |

Contrato del guardado, la validación, el orden, el borrado y el total **no cambian**. Sigue siendo
una única operación (`PUT`/`POST` completo) al pulsar «Guardar clase» en el paso 2.

## 2. Tests unitarios afectados — `frontend/src/lessons/LessonEditorPage.test.tsx`

Ninguno de estos cambios se había aplicado al escribir el reporte; **todos se aplicaron el
2026-09-29** (§7). Se listan por número de línea original.

| Test | Líneas | Motivo del fallo |
| --- | --- | --- |
| `validates required fields...` | 23, 24 | Pulsa «Guardar» y espera 3 mensajes. Ahora el paso 1 tiene «Continuar»; «Guardar clase» solo existe en el paso 2 y no es alcanzable con los metadatos vacíos. |
| `creates using trimmed metadata...` | 34, 38 | Tras escribir los 4 campos pulsa «Guardar» sin pasar por «Continuar», así que está en el paso 1 y el botón no existe. |
| `retains dirty fields...` | 75 | Igual: «Guardar» no está en el paso 1. |
| `disables saving controls...` | 85, 87 | Igual, más una aserción sobre el botón «Volver a Mis clases» durante el guardado. |
| `warns on controlled navigation...` | 98–102 | Funciona parcialmente: solo se toca el paso 1, pero el flujo asume el editor antiguo. |
| helper `metadata()` | 125–129 | No pasa por «Continuar». |
| helper `addActivity()` | 131–137 | Depende de `metadata()`: busca «Tipo de la nueva actividad» estando en el paso 1. |
| `saves the whole set...` | 154–184 | Necesita «Continuar» antes de agregar actividades; el botón de guardado se llama ahora «Guardar clase». |
| `blocks the whole save when one activity is invalid...` | 201–218 | Igual. |
| `keeps the activity draft and marks the activity the server rejected` | 230 | Igual. |

**Causa raíz común (una sola, no diez):** los tests recorren el editor como si fuera una pantalla
única. La corrección es añadir un clic en «Continuar» entre los metadatos y las actividades, y
cambiar la etiqueta «Guardar» por «Guardar clase». ~~No hay ningún fallo funcional detrás.~~

> **Corrección del 2026-09-29.** La última frase es falsa. Al ejecutar los tests E2E apareció un
> defecto funcional real del wizard: un solo clic en «Continuar» enviaba el formulario y guardaba la
> clase. Estaba en el código de producción, no en los tests. Se documenta y se corrige en §7.2.

## 3. Tests E2E afectados

### `frontend/e2e/lessons.spec.ts`

| Líneas | Motivo |
| --- | --- |
| 58 | `getByRole('button', { name: 'Guardar', exact: true })` sobre el paso 1. Ahora es «Continuar». |
| 60–63 | Rellena los metadatos después de pulsar el botón de guardar; el orden cambia. |
| 64, 68 | «Guardar» → «Guardar clase», y hace falta pasar por «Continuar». |
| 104 | Igual, en el flujo de duplicado. |

### `frontend/e2e/lesson-builder.spec.ts`

| Líneas | Motivo |
| --- | --- |
| 30 | Helper `save()`: «Guardar» → «Guardar clase». |
| 34–40 | Va directo a agregar actividades tras `goto('/lessons/:id/edit')`, sin pasar por «Continuar». |
| 42–60 | Toda la construcción de actividades ocurre en el paso 2, que ya no es el estado inicial. |
| 78–80, 94–100 | Tras `page.reload()` el asistente vuelve al paso 1, así que las búsquedas de `.activity-name` fallan. |

### `frontend/e2e/students.spec.ts`

**No está afectado y no se modificó** (4/4 en verde). El plan de trabajo lo listó por error entre los
specs desactualizados: sus clics en «Guardar» son del formulario de estudiante
(`StudentFormPage.tsx:77`, cuya etiqueta sigue siendo «Guardar»), no del editor de clases.

### `frontend/e2e/session.spec.ts`

No debería verse afectado: no usa el editor. **Confirmado el 2026-09-29: pasa sin cambios.** Cuando
falló al ejecutar varios specs seguidos, la causa fue el límite de peticiones del backend sobre
`/api/auth` (30 por minuto por IP, `backend/Api/Program.cs:62-68` aplicado al grupo en `:104`, que
incluye `/me`), no el wizard. Pasó al ejecutarlo en solitario.

### `frontend/src/lessons/ActivityForm.test.tsx`, `ActivityList.test.tsx`, `lesson-schema.test.ts`

No deberían verse afectados: prueban los componentes y el esquema por separado, y ninguno de los dos
cambió.

## 4. Verificación realizada

Solo la permitida al escribir el reporte: compilación y TypeScript.

| Comprobación | Resultado |
| --- | --- |
| `npx tsc -b` | ✓ exit 0 |
| `npx vite build` | ✓ 198 módulos, built in 8.18s |
| `npx eslint .` | ✓ exit 0 |

**No ejecutado a propósito entonces:** suite de tests, E2E y comprobaciones manuales en navegador.
Ese hueco es exactamente lo que dejó pasar el defecto de §7.2: sin ejecutar nada, un fallo funcional
del wizard quedó registrado como «no hay ningún fallo funcional detrás». La verificación completa, ya
ejecutada, está en §7.4.

## 5. Ficheros del cambio

Del wizard original:

| Fichero | Tipo |
| --- | --- |
| `frontend/src/lessons/editor-steps.ts` | nuevo — pasos y etiquetas |
| `frontend/src/lessons/StepIndicator.tsx` | nuevo — indicador de progreso |
| `frontend/src/lessons/LessonEditorPage.tsx` | modificado — wizard de 2 pasos |
| `frontend/src/styles.css` | modificado — estilos del indicador y de las acciones |

Añadidos en la reparación del 2026-09-29 (§7):

| Fichero | Tipo |
| --- | --- |
| `frontend/src/lessons/LessonEditorPage.tsx` | modificado — corrección del defecto de §7.2 (barras de acciones con `key`) |
| `frontend/src/lessons/LessonEditorPage.test.tsx` | modificado — navegación del wizard en los tests |
| `frontend/e2e/lessons.spec.ts` | modificado — «Continuar», «Guardar clase», cierre de la alerta |
| `frontend/e2e/lesson-builder.spec.ts` | modificado — «Continuar», «Guardar clase», cierre de la alerta |

## 6. Puntos que conviene probar a mano

- Que el paso 1 no avance con «Título», «Tema» u «Objetivo» vacíos y muestre los mensajes inline.
- Que «Atrás» conserve metadatos y actividades, en ambos sentidos y varias veces.
- Que la recarga de la página vuelva al paso 1 sin perder lo guardado.
- Que crear una clase nueva deje al profesor en el paso 2 tras guardar, sin volver al paso 1.
- Que el guardado siga enviando una sola petición con los metadatos y todas las actividades.
- Que el total y el estado «Duración incompleta» sigan calculándose igual.
- Que no haya desbordamiento horizontal a 390 px en ninguno de los dos pasos.

Tras la reparación (§7) casi todos quedaron cubiertos por los specs E2E: los mensajes inline del paso 1,
la vuelta al paso 1 tras recargar, el aterrizaje en el paso 2 al crear, el guardado como una sola
petición, el total y «Duración incompleta», y la ausencia de desbordamiento a 390 px. **Sigue sin
cobertura automática** el ir y volver varias veces entre los dos pasos conservando el borrador.

## 7. Reparación del 2026-09-29

### 7.1 La excepción a la regla de «documentar sin modificar»

La regla del proyecto decía: no crear ni actualizar tests y, si uno existente falla por un cambio de
interfaz, documentarlo sin modificarlo. Este documento es el producto de esa regla y se escribió
correctamente bajo ella.

El 2026-09-29 se decidió conceder **una excepción única** y reparar los tests como primera fase del
trabajo sobre el frontend. El motivo no es estilístico: todo lo demás del plan toca el editor de
clases, que es el archivo más complejo del frontend, y hacerlo con la suite en rojo significa
refactorizar sin poder distinguir una regresión de un fallo preexistente. La excepción queda acotada a
**reparar tests rotos por un cambio de interfaz**. No autoriza a escribir tests nuevos ni a modificar
un test para que un defecto real deje de verse — de hecho fue al ejecutarlos cuando apareció el de
§7.2, que este documento negaba.

Se aplicó a `LessonEditorPage.test.tsx` (navegación del wizard: clic en «Continuar», etiqueta «Guardar
clase»), `e2e/lessons.spec.ts` y `e2e/lesson-builder.spec.ts`. `e2e/students.spec.ts` y
`e2e/session.spec.ts` no necesitaban nada (§3).

### 7.2 Defecto funcional encontrado y corregido: «Continuar» guardaba la clase

**Síntoma.** `lesson-builder.spec.ts` fallaba de forma determinista en su línea 44 (numeración anterior
al arreglo): el clic en «Agregar actividad» no encontraba el botón. La captura del fallo mostraba el
diálogo «Clase guardada correctamente» abierto, el editor en «Paso 2 de 2» y la lista de actividades
vacía. La clase se había guardado sola al entrar en el paso 2.

**Mecanismo.** Tres hechos que por separado son inocentes:

1. `goToActivities()` es `async` — `if (await form.trigger()) setStep('activities')`. El `await` cede
   un microtask **durante** el despacho del clic.
2. En ese microtask React re-renderiza. Las dos ramas del ternario de `.editor-actions` renderizaban un
   `<button>` desnudo **en la misma posición entre hermanos**, así que React **reutiliza el mismo nodo
   DOM** y se limita a reescribir sus atributos: `type="button"` → `type="submit"`.
3. Al terminar el manejador, el navegador ejecuta el *activation behaviour* del nodo clicado, que ya es
   de envío: envía el formulario con ese botón como `submitter`.

«Atrás» no lo provocaba porque `goToInfo()` es síncrono: React vuelca el render antes del *activation
behaviour* y el nodo vuelve a ser `type="button"`.

**Evidencia.** Un spec temporal instrumentado (`e2e/zz-probe.spec.ts`, eliminado tras el diagnóstico)
con escuchadores en fase de captura produjo:

```
CLICK on=BUTTON type=button text=Continuar trusted=true
SUBMIT from=BUTTON:Guardar clase
PUT /api/lessons/<id>
```

`trusted=true` descarta que fuera un artefacto del test: el clic lo generó CDP igual que lo generaría
un ratón real. La correlación entre el reloj de la traza y el de la red —desplazamiento exacto de
**35,406 s**, calculado con dos anclajes independientes (`POST /api/auth/register` y
`POST /api/lessons`)— sitúa ese `PUT` dentro del clic en «Continuar» (04.397 → 04.4958) y 100 ms
**antes** del clic en «Agregar actividad» (04.550). Con un solo anclaje el desplazamiento salía mal y
la conclusión era la contraria: hace falta más de uno.

**Alcance para el profesor.** En `/lessons/:id/edit` guardaba en silencio en cada cambio de paso y
abría el modal de éxito. En `/lessons/new` se deduce del mismo mecanismo que disparaba el `POST`, o sea
que la clase se creaba al pulsar «Continuar» en lugar de al pulsar «Guardar clase» (no se observó
directamente: el spec que lo habría mostrado ya estaba corregido). En ningún caso se perdía
información —el guardado era completo y legítimo— pero ocurría cuando no se había pedido.

**Corrección.** `frontend/src/lessons/LessonEditorPage.tsx`: las dos ramas de `.editor-actions` llevan
ahora `key` (`<Fragment key="info">` / `<Fragment key="activities">`), de modo que React desmonta y
remonta en vez de reutilizar el nodo. `goToActivities()` sigue siendo `async` y la validación del paso 1
con `form.trigger()` no cambia. El `key` va acompañado de un comentario que explica el porqué, porque
sin él la siguiente persona que «simplifique» el `Fragment` a `<>` reintroducirá el defecto.

**Lección.** Cualquiera de las dos mitades del cambio habría bastado: o el `key`, o hacer síncrono
`goToActivities()`. Se eligió el `key` porque no depende de que el manejador siga siendo síncrono.

### 7.3 Segundo ajuste de los specs: SweetAlert2 oculta la app de las consultas por rol

No lo anticipó el reporte original y conviene dejarlo escrito. `notifyLessonSaved()` monta un diálogo
en `document.body`, y SweetAlert2 marca con `aria-hidden="true"` **todos los demás hijos de `<body>`**.
`getByRole` de Playwright usa `includeHidden: false` por defecto, así que mientras la alerta siga
abierta **ninguna consulta por rol encuentra nada en la aplicación** (`getByText` y `selectOption` sí
funcionan: la visibilidad CSS no cambia). Por eso los dos specs cierran la alerta con «Aceptar» antes
de afirmar sobre roles.

Relevante para lo que viene: si una fase posterior retira el modal de guardado exitoso, estos cierres
de «Aceptar» dejan de ser necesarios y deben quitarse a la vez.

### 7.4 Verificación ejecutada

| Comprobación | Resultado |
| --- | --- |
| `npx tsc -b` | ✓ exit 0 |
| `npx eslint .` | ✓ exit 0 |
| `npx vitest run` | ✓ 20 archivos / 169 tests |
| `npx playwright test e2e/lesson-builder.spec.ts` | ✓ 1 passed (10.6 s) |
| `npx playwright test e2e/lessons.spec.ts` | ✓ 2 passed (12.3 s) |
| `npx playwright test e2e/students.spec.ts` | ✓ 4 passed (13.5 s) |
| `npx playwright test e2e/session.spec.ts` | ✓ 1 passed (5.3 s) |

Playwright se ejecutó **archivo por archivo** a propósito: varios specs seguidos agotan el límite de
`/api/auth` (30 peticiones por minuto por IP, `backend/Api/Program.cs:62-68` aplicado al grupo en
`:104`) y hacen fallar `session.spec.ts` por una causa ajena al código. Ocurrió durante la verificación
y se confirmó volviendo a ejecutarlo en solitario.

Entorno usado: Postgres desechable `pf_e2e_manual` con las migraciones aplicadas y la API en segundo
plano en el puerto 5081. **Pendiente de limpiar** cuando se cierre el trabajo.
