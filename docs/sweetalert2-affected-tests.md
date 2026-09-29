# Reporte de pruebas afectadas — Notificación SwalAlert2 al guardar

**Rama:** `feat/crear-clase-wizard-2-pasos` (cambio 2 del lote, sobre el wizard de 2 pasos)
**Estado:** pendiente de pruebas funcionales manuales del usuario
**Fecha:** 2026-09-25

Los tests existentes **no se han modificado** ni se ha ejecutado la suite, según las reglas del lote
(ver `docs/wizard-2-pasos-affected-tests.md` §0).

## 1. Qué cambió

Se añade una notificación SweetAlert2 al guardado de una clase:

| Fichero | Tipo |
| --- | --- |
| `frontend/src/notifications.ts` | **nuevo** — módulo único de alertas (`notifyLessonSaved`, `notifyLessonSaveFailed`) |
| `frontend/src/lessons/LessonEditorPage.tsx` | modificado — llama a las dos funciones desde `onSuccess`/`onError` de la mutación |
| `frontend/src/main.tsx` | modificado — importa el CSS base de SweetAlert2 |
| `frontend/src/styles.css` | modificado — tema `.pf-alert` con los tokens del proyecto |
| `frontend/package.json` | modificado — nueva dependencia `sweetalert2@^11.26.25` |

Lógica de guardado, validación, navegación y persistencia: **sin cambios**. Las dos llamadas son
complementos dentro de los callbacks que ya existían.

## 2. ⚠️ Riesgo de regresión — LEER ANTES DE PROBAR

`Swal.fire` monta su propio contenedor y **mueve el foco con un temporizador**. El test unitario:

```
LessonEditorPage.test.tsx  ·  «disables the wizard controls and clears dirty state only after success»
```

podría fallar ahora por un motivo **distinto al cambio de interfaz del wizard**:

```
const confirm = vi.spyOn(window, 'confirm');
await userEvent.click(screen.getByRole('button', { name: 'Volver a Mis clases' }));
expect(confirm).not.toHaveBeenCalled();
```

- Si la alerta sigue abierta cuando el test pulsa ese botón, el foco estaría en el botón «Aceptar» de
  SweetAlert2, no en el botón de la aplicación. Entonces el clic puede no llegar y el `confirm` que el
  test espera que **no** se dispare… **sí se dispararía**.
- Es una carrera del propio test, no un fallo del producto. Pero **no lo he podido verificar** porque
  tenía prohibido ejecutar la suite, así que lo marco como riesgo abierto, no como hecho.

**Cómo lo resuelve el test, cuando toque**: cerrar la alerta antes de seguir
(`await screen.findByRole('button', { name: 'Aceptar' })` + clic) o esperarla explícitamente. Es una
decisión tuya, y por eso no la he aplicado.

Los demás tests de `LessonEditorPage.test.tsx` que guardan con éxito (líneas ~168, 184, 201, 218, 230)
también abren la alerta, pero no interactúan después con el DOM de forma que el foco importe, así que
**deberían** seguir fallando solo por el motivo documentado del wizard (botón «Guardar» → «Guardar
clase» + falta el paso «Continuar»).

## 3. Tests afectados por este cambio concreto

| Test | Efecto esperado |
| --- | --- |
| `LessonEditorPage.test.tsx` · `disables the wizard controls…` | Riesgo de fallo por la carrera del foco descrita arriba. |
| `LessonEditorPage.test.tsx` · resto de tests que guardan | Fallan igual que antes (motivo del wizard). La alerta no cambia el diagnóstico. |
| `e2e/lessons.spec.ts` línea 69 | `await expect(page.getByRole('status')).toHaveText('Clase guardada.')`. El `<p role="status">` sigue existiendo, pero **la alerta se superpone** encima. Playwright debería resolver el `expect` igualmente (no requiere visibilidad estricta para `toHaveText`), pero conviene comprobarlo a mano. |
| `e2e/lesson-builder.spec.ts` · helper `save()` | Tras el `PUT`, la alerta queda abierta y puede **interceptar los clics siguientes** (Playwright comprueba que el elemento no esté tapado). Este es el punto más probable de fallo real. |

Nota: la alerta no se cierra sola. Cada guardado correcto deja un modal que el profesor debe aceptar,
y en E2E eso significa un clic extra entre guardado y guardado.

## 4. Verificación realizada

| Comprobación | Resultado |
| --- | --- |
| `npx tsc -b` | ✓ exit 0 |
| `npx vite build` | ✓ 201 módulos, built in 7.54 s |
| `npx eslint .` | ✓ exit 0 |
| `npm ls sweetalert2` | ✓ una sola instancia, `11.26.25` (no duplicada) |

**No ejecutado a propósito:** suite de tests, E2E y comprobaciones manuales en navegador.

## 5. Puntos que conviene probar a mano

- Guardar correctamente (crear y editar) → aparece el modal de éxito con título, mensaje, icono y botón «Aceptar».
- Que el modal salga **solo** cuando el backend confirma; no antes ni en el intento fallido.
- Forzar un error de validación (actividad sin duración) → modal de error y los mensajes inline siguen apareciendo.
- Forzar un error de red (parar la API) → el mensaje cae al genérico, sin texto vacío.
- Que no aparezca más de un modal por guardado.
- Que tras «Aceptar» el flujo siga igual: al crear, la URL es `/lessons/:id/edit` en el paso 2.
- Aspecto del modal frente al resto de la app, y a 390 px de ancho.
