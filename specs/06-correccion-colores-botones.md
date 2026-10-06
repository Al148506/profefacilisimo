# SPEC 06 — Corrección de colores de botones

> **Estado:** Aprobado
> **Depende de:** SPEC 05 — Botones con color e iconos
> **Fecha:** 2026-10-06
> **Objetivo:** Corregir el color de los botones "Editar" (amarillo dorado) y "Enviar a papelera" (rojo `danger`) en todas las páginas donde aparecen, ya que el SPEC 05 fue implementado sin aplicar esos colores correctamente.

---

## 1. Por qué esta spec existe

El SPEC 05 definió un sistema de variantes de botón con colores semánticos, pero tras la implementación los botones "Editar" y "Enviar a papelera" no tienen el color correcto:

- **"Editar clase"** aparece como `secondary` (borde, fondo blanco) cuando debería tener un fondo azul claro (#3B82F6) que lo distinga claramente como acción de edición.
- **"Enviar a papelera"** debería ser `danger` (rojo) según el SPEC 05, pero no se aplicó correctamente.

El resto de botones (Iniciar clase en verde oscuro, Duplicar en verde oliva) quedaron correctos y no se tocan.

---

## 2. Alcance

**Incluye:**

- Token CSS nuevo `--pf-warning` (azul claro, ej. `#3B82F6`) y `--pf-warning-hover` (`#2563eb`) en `:root` de `styles.css`.
- Variante nueva `warning` en el componente `Button.tsx` (fondo `--pf-warning`, tinta blanca u oscura con contraste WCAG AA).
- Reasignación de variante en **todos** los botones "Editar" del frontend: de `secondary` a `warning`.
- Verificación y corrección del botón "Enviar a papelera" para que use la variante `danger` en todas las páginas donde aparezca.
- Páginas afectadas: `LessonsPage.tsx`, `StudentsPage.tsx`, `StudentProfilePage.tsx`, y cualquier otra donde ambos botones estén presentes.

**Fuera de alcance:**

- Cambio de color en "Iniciar clase" (permanece `primary` verde oscuro).
- Cambio de color en "Duplicar" (permanece `accent` verde oliva).
- Cambio de color en cualquier otro botón no mencionado.
- Rediseño de modales SweetAlert2, formularios o navegación.
- Modo oscuro.

---

## 3. Modelo de datos

No hay datos nuevos de dominio ni de API. Solo cambios de presentación.

Nuevas adiciones a `Button.tsx`:

```tsx
type ButtonVariant = "primary" | "secondary" | "danger" | "accent" | "warning";
// "warning": fondo --pf-warning (amarillo dorado), texto con contraste AA
```

Nuevos tokens en `styles.css` (`:root`):

```css
--pf-warning: #3b82f6;
--pf-warning-hover: #2563eb; /* tono más oscuro al pasar el cursor */
```

Catálogo de cambios de variante:

| Acción            | Variante antes              | Variante después |
| ----------------- | --------------------------- | ---------------- |
| Editar clase      | `secondary`                 | `warning`        |
| Editar estudiante | `secondary`                 | `warning`        |
| Enviar a papelera | (sin variante o incorrecta) | `danger`         |

---

## 4. Plan de implementación

1. **Añadir tokens** `--pf-warning` y `--pf-warning-hover` a `:root` en `frontend/src/styles.css`, junto a la clase `.pf-btn--warning` con sus estados hover y focus.
2. **Ampliar `Button.tsx`** para aceptar `"warning"` en el tipo `ButtonVariant` y aplicar la clase `.pf-btn--warning` correspondiente. Verificar contraste de texto (blanco o `--pf-ink`) con herramienta o cálculo manual.
3. **Migrar botones "Editar":** cambiar `variant="secondary"` a `variant="warning"` en todos los `<Button>` cuyo texto sea "Editar clase", "Editar estudiante" o equivalente. Archivos esperados: `LessonsPage.tsx`, `StudentsPage.tsx`, `StudentProfilePage.tsx`.
4. **Verificar y corregir "Enviar a papelera":** buscar todos los usos del botón "Enviar a papelera" y confirmar que usan `variant="danger"`. Corregir los que no lo hagan. Archivos esperados: `LessonsPage.tsx`, `StudentsPage.tsx`.
5. **`tsc -b && vite build`** limpio tras cada paso.
6. **`./scripts/Test.ps1`** completo al final.

---

## 5. Criterios de aceptación

- [ ] En todas las páginas, el botón "Editar" muestra fondo azul claro(`--pf-warning`) en estado reposo y un tono más oscuro al hacer hover.
- [ ] En todas las páginas, el botón "Enviar a papelera" muestra fondo rojo (`--pf-danger`) en estado reposo y `--pf-danger-hover` al hacer hover.
- [ ] El contraste de texto sobre `--pf-warning` cumple WCAG AA (mínimo 4.5:1).
- [ ] Los botones "Iniciar clase" (verde oscuro) y "Duplicar" (verde oliva) no cambian de color.
- [ ] `tsc -b && vite build` pasa sin errores ni warnings que rompan la build.
- [ ] `./scripts/Test.ps1` pasa completo (tests unitarios, eslint, vitest).
- [ ] Inspeccionando visualmente la lista de clases, el set de botones muestra cuatro colores distintos: verde oscuro, azul claro, verde oliva, rojo.

---

## 6. Decisiones

- **Sí:** color blanco o `--pf-ink` para el texto sobre `warning`. Se define en el paso 2 tras verificar contraste; no se asume aquí.
- **No:** tocar "Iniciar clase" ni "Duplicar". El usuario confirmó que están correctos.
- **No:** abrir rediseño general de la paleta. Esta spec es una corrección quirúrgica.

---

## 7. Riesgos

| Riesgo                                                       | Mitigación                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Contraste insuficiente de texto blanco sobre amarillo dorado | Verificar ratio en el paso 2; cambiar a `--pf-ink` si no alcanza 4.5:1       |
| Botones "Editar" en páginas no listadas                      | Grep de `"Editar"` en `frontend/src/` antes de cerrar el paso 3              |
| Tests que buscan botones por clase CSS específica            | Los tests usan texto accesible, no clases; el texto "Editar clase" no cambia |
