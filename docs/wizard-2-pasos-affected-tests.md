# Reporte de pruebas afectadas — Wizard de 2 pasos en «Crear clase»

**Rama:** `feat/crear-clase-wizard-2-pasos` (desde `main`, `fd69352`)
**Estado:** pendiente de pruebas funcionales manuales del usuario
**Fecha:** 2026-09-25

Este documento existe por una instrucción explícita: los tests existentes **no se han modificado**
ni se ha ejecutado la suite. Aquí se enumeran las pruebas que fallarán por el cambio de interfaz y
por qué, para que el usuario decida qué hacer con ellas.

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

Ninguno de estos cambios se ha aplicado. Se listan por número de línea original.

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
cambiar la etiqueta «Guardar» por «Guardar clase». No hay ningún fallo funcional detrás.

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

### `frontend/e2e/session.spec.ts`

No debería verse afectado: no usa el editor.

### `frontend/src/lessons/ActivityForm.test.tsx`, `ActivityList.test.tsx`, `lesson-schema.test.ts`

No deberían verse afectados: prueban los componentes y el esquema por separado, y ninguno de los dos
cambió.

## 4. Verificación realizada

Solo la permitida: compilación y TypeScript.

| Comprobación | Resultado |
| --- | --- |
| `npx tsc -b` | ✓ exit 0 |
| `npx vite build` | ✓ 198 módulos, built in 8.18s |
| `npx eslint .` | ✓ exit 0 |

**No ejecutado a propósito:** suite de tests, E2E y comprobaciones manuales en navegador.

## 5. Ficheros del cambio

| Fichero | Tipo |
| --- | --- |
| `frontend/src/lessons/editor-steps.ts` | nuevo — pasos y etiquetas |
| `frontend/src/lessons/StepIndicator.tsx` | nuevo — indicador de progreso |
| `frontend/src/lessons/LessonEditorPage.tsx` | modificado — wizard de 2 pasos |
| `frontend/src/styles.css` | modificado — estilos del indicador y de las acciones |

## 6. Puntos que conviene probar a mano

- Que el paso 1 no avance con «Título», «Tema» u «Objetivo» vacíos y muestre los mensajes inline.
- Que «Atrás» conserve metadatos y actividades, en ambos sentidos y varias veces.
- Que la recarga de la página vuelva al paso 1 sin perder lo guardado.
- Que crear una clase nueva deje al profesor en el paso 2 tras guardar, sin volver al paso 1.
- Que el guardado siga enviando una sola petición con los metadatos y todas las actividades.
- Que el total y el estado «Duración incompleta» sigan calculándose igual.
- Que no haya desbordamiento horizontal a 390 px en ninguno de los dos pasos.
