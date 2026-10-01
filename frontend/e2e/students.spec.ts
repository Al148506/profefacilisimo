import { test, expect } from '@playwright/test';

/**
 * Registers a fresh teacher through the API and signs in through the UI, like the lesson specs.
 * Returns the Bearer header: the app authenticates with `Authorization: Bearer <accessToken>` and
 * the token only exists in the login response, so the API helpers below cannot work from cookies.
 */
async function signIn(page: import('@playwright/test').Page): Promise<{ Authorization: string }> {
  const email = 'students-' + Date.now() + '@example.com';
  const password = 'Profesor2026abcd';
  const registration = await page.request.post('/api/auth/register', {
    headers: { Origin: 'http://localhost:5173', 'X-Requested-With': 'Profefacilisimo' },
    data: { email, password },
  });
  expect(registration.status()).toBe(201);
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  const loggedIn = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'));
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  const session = await (await loggedIn).json();
  await expect(page.getByRole('heading', { name: 'Mis clases' })).toBeVisible();
  return { Authorization: 'Bearer ' + session.accessToken };
}

/**
 * Creates a lesson through the API so the assignment flows have something to assign to. The
 * authenticated request needs the Bearer header, which only signIn can obtain. The page is
 * reloaded afterwards because the lessons listing is already cached in memory from the sign-in
 * redirect, and the profile picker would otherwise reuse that empty cache. Waiting for the listing
 * to be visible again keeps the next step from racing the session bootstrap that the reload starts.
 */
async function createLesson(
  page: import('@playwright/test').Page,
  auth: { Authorization: string },
  title: string,
): Promise<string> {
  const response = await page.request.post('/api/lessons', {
    headers: { ...auth, Origin: 'http://localhost:5173', 'X-Requested-With': 'Profefacilisimo' },
    data: { title, level: 'B1', topic: 'Tema', objective: 'Objetivo', activities: [] },
  });
  expect(response.status()).toBe(201);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mis clases' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar ' + title, exact: true })).toBeVisible();
  return (await response.json()).id as string;
}

test('create a student, see it listed and open its profile', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Estudiantes' }).click();
  await expect(page.getByRole('heading', { name: 'Mis estudiantes' })).toBeVisible();

  await page.getByRole('link', { name: 'Crear estudiante' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  // The required fields stop the write before it leaves the browser.
  await expect(page.getByText('Este campo es obligatorio.')).toBeVisible();

  const name = 'Alba ' + Date.now();
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByLabel('Nivel', { exact: true }).selectOption('B2');
  await page.getByLabel('Correo').fill('alba@example.com');
  await page.getByLabel('Intereses').fill('Ajedrez y cine');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Estudiante guardado')).toBeVisible();
  await page.getByRole('button', { name: 'Aceptar' }).click();

  // Saving a new student opens its profile.
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText('alba@example.com')).toBeVisible();
  await expect(page.getByText('Ajedrez y cine')).toBeVisible();

  // An absent optional is spelled out instead of showing a blank field.
  await expect(page.getByText('Sin indicar').first()).toBeVisible();

  await page.getByRole('link', { name: 'Volver a Mis estudiantes' }).first().click();
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(page.getByText('0 clases asignadas')).toBeVisible();
});

test('assign from the profile and from the lesson editor, then unassign from both sides', async ({ page }) => {
  const auth = await signIn(page);
  const lessonTitle = 'Clase asignable ' + Date.now();
  await createLesson(page, auth, lessonTitle);

  await page.getByRole('link', { name: 'Estudiantes' }).click();
  await page.getByRole('link', { name: 'Crear estudiante' }).click();
  const name = 'Bruno ' + Date.now();
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: 'Aceptar' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // From the profile: the picker offers the active lesson and assigning keeps us on the profile.
  await page.getByLabel('Asignar clase').selectOption({ label: lessonTitle + ' · B1' });
  await expect(page.getByRole('heading', { name: lessonTitle })).toBeVisible();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // From the editor: the same pair is already assigned, so it is not offered again.
  await page.goto('/');
  await page.getByRole('link', { name: 'Editar ' + lessonTitle }).click();
  const section = page.getByTestId('assigned-students');
  await expect(section).toBeVisible();
  await expect(section.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(section.getByRole('option', { name: name + ' · B1' })).toHaveCount(0);

  // Unassigning from the lesson side never turns the section into a draft change.
  await section.getByRole('button', { name: 'Quitar asignación de ' + name }).click();
  await expect(section.getByText('Esta clase todavía no tiene estudiantes asignados.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Quitar asignación de ' + name })).toHaveCount(0);

  // Back on the profile the lesson is gone, and the student still exists.
  await page.goto('/students');
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByText('Este estudiante todavía no tiene clases asignadas.')).toBeVisible();
  await expect(page.getByRole('heading', { name })).toBeVisible();
});

test('trash a student, restore it, keep its assignments, and delete it definitively', async ({ page }) => {
  const auth = await signIn(page);
  const lessonTitle = 'Clase viva ' + Date.now();
  await createLesson(page, auth, lessonTitle);

  await page.getByRole('link', { name: 'Estudiantes' }).click();
  await page.getByRole('link', { name: 'Crear estudiante' }).click();
  const name = 'Carla ' + Date.now();
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: 'Aceptar' }).click();
  await page.getByLabel('Asignar clase').selectOption({ label: lessonTitle + ' · B1' });
  await expect(page.getByRole('heading', { name: lessonTitle })).toBeVisible();

  // Send to the trash: it asks for confirmation and never deletes a lesson.
  page.on('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Enviar a papelera' }).click();
  await expect(page.getByRole('heading', { name: 'Mis estudiantes' })).toBeVisible();
  await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);

  // A trashed student keeps its assignments and shows the mark without the unassign action.
  await page.goto('/');
  await page.getByRole('link', { name: 'Editar ' + lessonTitle }).click();
  const section = page.getByTestId('assigned-students');
  await expect(section.getByTestId('trash-mark')).toHaveText('En papelera');
  await expect(section.getByRole('button', { name: 'Quitar asignación de ' + name })).toHaveCount(0);

  // A trashed lesson is likewise marked on the profile and cannot be unassigned until restored.
  await page.getByRole('button', { name: 'Volver a Mis clases' }).click();
  await page.getByRole('link', { name: 'Estudiantes' }).click();
  await page.getByRole('link', { name: 'Papelera' }).click();
  await expect(page.getByRole('heading', { name: 'Papelera de estudiantes' })).toBeVisible();
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restaurar ' + name }).click();
  // Restoring refetches the trash and removes the row, so wait for it to settle before leaving.
  await expect(page.getByText('La papelera está vacía.')).toBeVisible();

  // Restoring brings the assignment back without duplicating it.
  await page.getByRole('link', { name: 'Volver a Mis estudiantes' }).click();
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name: lessonTitle })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quitar asignación de ' + lessonTitle })).toBeVisible();

  // Delete definitively removes the student and its assignments, and leaves the lesson alone.
  await page.getByRole('button', { name: 'Enviar a papelera' }).click();
  await page.getByRole('link', { name: 'Papelera' }).click();
  await page.getByRole('button', { name: 'Eliminar definitivamente ' + name }).click();
  await expect(page.getByText('La papelera está vacía.')).toBeVisible();
  await page.getByRole('link', { name: 'Volver a Mis estudiantes' }).click();
  await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);

  await page.goto('/');
  await page.getByRole('link', { name: 'Editar ' + lessonTitle }).click();
  await expect(page.getByTestId('assigned-students').getByText('Esta clase todavía no tiene estudiantes asignados.')).toBeVisible();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue(lessonTitle);
});

test('filter the listing by name and level, and clear the filters', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Estudiantes' }).click();
  for (const [name, level] of [['Filtro Uno', 'A2'], ['Filtro Dos', 'B2']]) {
    await page.getByRole('link', { name: 'Crear estudiante' }).click();
    await page.getByLabel('Nombre', { exact: true }).fill(name);
    await page.getByLabel('Nivel', { exact: true }).selectOption(level);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('button', { name: 'Aceptar' }).click();
    await page.getByRole('link', { name: 'Volver a Mis estudiantes' }).first().click();
  }
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await page.getByLabel('Buscar por nombre o intereses').fill(' Dos ');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Filtro Dos', exact: true })).toBeVisible();

  await page.getByLabel('Nivel', { exact: true }).selectOption('A2');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByText('No hay estudiantes que coincidan con estos filtros.')).toBeVisible();

  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(2);
});
