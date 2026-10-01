import Swal from 'sweetalert2';
import type { SweetAlertOptions } from 'sweetalert2';

/**
 * The project's alerts. SweetAlert2 ships its own markup, so the theme is applied once here, with
 * the same variables `styles.css` uses, instead of per call site. Keeping every alert in this module
 * is what stops the app from growing two different ways of telling the teacher the same thing.
 *
 * Only one alert can be on screen: `Swal.fire` reuses the same container, so a second call replaces
 * the first instead of stacking on top of it.
 */
const TOKENS = {
  confirm: '#234e41',
} as const;

/** Applies the project's palette and button token to every alert. The rest of the theme lives in
 *  `styles.css` under `.pf-alert`, next to the variables it mirrors. */
function themed(options: SweetAlertOptions): Promise<unknown> {
  return Swal.fire({
    confirmButtonColor: TOKENS.confirm,
    customClass: { popup: 'pf-alert' },
    ...options,
  });
}

/** The class was created or updated and the server confirmed it. */
export function notifyLessonSaved(): Promise<unknown> {
  return themed({
    icon: 'success',
    title: 'Clase guardada correctamente',
    text: 'Los cambios se han guardado exitosamente.',
    confirmButtonText: 'Aceptar',
  });
}

/** The student was created or updated and the server confirmed it. */
export function notifyStudentSaved(): Promise<unknown> {
  return themed({
    icon: 'success',
    title: 'Estudiante guardado',
    text: 'Los cambios se han guardado exitosamente.',
    confirmButtonText: 'Aceptar',
  });
}

/**
 * The save was rejected. The API message wins when there is one; the fallback covers a network
 * failure, where there is no server message at all.
 *
 * Nothing is discarded here: the editor keeps the draft and its own inline messages, so this alert
 * is purely informative.
 */
export function notifyLessonSaveFailed(message?: string): Promise<unknown> {
  return themed({
    icon: 'error',
    title: 'No fue posible guardar la clase',
    text: message?.trim() || 'No pudimos conectar. Comprueba tu conexión y vuelve a intentarlo.',
    confirmButtonText: 'Aceptar',
  });
}
