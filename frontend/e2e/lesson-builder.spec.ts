import { test, expect } from '@playwright/test';

// SPEC 02, etapa 10: login → abrir una clase → crear actividades → editar → eliminar → reordenar →
// guardar → recargar. Cada guardado comprueba además lo que el servidor persistió.
test('builds the activity set, saves it as a whole and reproduces it after reload', async ({ page }) => {
  const email = 'builder-' + Date.now() + '@example.com';
  const password = 'E2ePassword12345';
  expect((await page.request.post('/api/auth/register', {
    headers: { Origin: 'http://localhost:5173', 'X-Requested-With': 'Profefacilisimo' },
    data: { email, password },
  })).status()).toBe(201);
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  const loggedIn = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'));
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  const session = await (await loggedIn).json();
  const auth = { Authorization: 'Bearer ' + session.accessToken };

  const created = await page.request.post('/api/lessons', {
    headers: auth,
    data: { title: 'Viajes y pasado', level: 'B1', topic: 'Viajes', objective: 'Practicar el pretérito indefinido' },
  });
  expect(created.status()).toBe(201);
  const lesson = await created.json();
  const stored = async () => (await page.request.get('/api/lessons/' + lesson.id, { headers: auth })).json();
  const save = async () => {
    const answered = page.waitForResponse((response) =>
      response.url().includes('/api/lessons/' + lesson.id) && response.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    expect((await answered).status()).toBe(200);
  };

  await page.goto('/lessons/' + lesson.id + '/edit');
  await expect(page.getByRole('heading', { name: 'Editar clase' })).toBeVisible();
  await expect(page.getByText('Duración total:')).toContainText('0 min');

  // Una lectura de 15 minutos con dos preguntas.
  await page.getByLabel('Tipo de la nueva actividad').selectOption('Reading');
  await page.getByRole('button', { name: 'Agregar actividad' }).click();
  await page.getByLabel('Título de la actividad').fill('Lectura: un viaje a Sevilla');
  await page.getByLabel('Instrucciones', { exact: true }).fill('Lee el texto y responde a las preguntas.');
  await page.getByLabel('Texto de lectura').fill('El verano pasado viajé a Sevilla con mi hermana.');
  await page.getByLabel('Pregunta 1', { exact: true }).fill('¿Con quién viajó?');
  await page.getByRole('button', { name: 'Añadir pregunta' }).click();
  await page.getByLabel('Pregunta 2', { exact: true }).fill('¿Qué visitaron?');
  await page.getByLabel('Duración (minutos)').fill('15');

  // Una actividad de vocabulario todavía sin duración: la clase se muestra incompleta.
  await page.getByLabel('Tipo de la nueva actividad').selectOption('VocabularyGrammar');
  await page.getByRole('button', { name: 'Agregar actividad' }).click();
  await page.getByLabel('Título de la actividad').fill('Pretérito indefinido');
  await page.getByLabel('Instrucciones', { exact: true }).fill('Completa los ejercicios.');
  await page.getByLabel('Explicación').fill('El pretérito indefinido expresa acciones terminadas.');
  await page.getByLabel('Ejercicio 1', { exact: true }).fill('Ayer (ir) ___ al cine.');
  await expect(page.getByText('Duración incompleta')).toBeVisible();

  // Guardar con una duración pendiente no envía nada y marca la actividad en la lista.
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Indica la duración en minutos.').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pretérito indefinido/ })).toHaveAccessibleDescription('Indica la duración en minutos.');

  // Al corregirla, el mensaje desaparece y el total se recalcula en pantalla.
  await page.getByLabel('Duración (minutos)').fill('10');
  await expect(page.getByText('Duración total:')).toContainText('25 min');
  await expect(page.getByText('Indica la duración en minutos.')).toHaveCount(0);
  await save();

  // El servidor guardó el conjunto completo, en orden, con el total recalculado.
  let lesson2 = await stored();
  expect(lesson2.estimatedDuration).toBe(25);
  expect(lesson2.activities.map((activity: { order: number; type: string; estimatedDuration: number }) =>
    [activity.order, activity.type, activity.estimatedDuration]))
    .toEqual([[0, 'Reading', 15], [1, 'VocabularyGrammar', 10]]);

  // Recargar reproduce exactamente lo guardado.
  await page.reload();
  await expect(page.locator('.activity-name')).toHaveText(['Lectura: un viaje a Sevilla', 'Pretérito indefinido']);
  await expect(page.locator('.activity-duration')).toHaveText(['15 min', '10 min']);
  await expect(page.getByText('Duración total:')).toContainText('25 min');

  // Reordenar persiste el nuevo orden y no cambia el total.
  await page.getByRole('button', { name: 'Subir Pretérito indefinido' }).click();
  await expect(page.getByRole('button', { name: 'Subir Pretérito indefinido' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Bajar Lectura: un viaje a Sevilla' })).toBeDisabled();
  await save();
  lesson2 = await stored();
  expect(lesson2.activities.map((activity: { title: string }) => activity.title))
    .toEqual(['Pretérito indefinido', 'Lectura: un viaje a Sevilla']);
  expect(lesson2.estimatedDuration).toBe(25);

  // Quitar una actividad recalcula el total.
  await page.getByRole('button', { name: 'Quitar Lectura: un viaje a Sevilla', exact: true }).click();
  await save();
  lesson2 = await stored();
  expect(lesson2.activities).toHaveLength(1);
  expect(lesson2.estimatedDuration).toBe(10);

  // Un conjunto vacío es una petición válida: elimina todas las actividades y deja total 0.
  await page.getByRole('button', { name: 'Quitar Pretérito indefinido', exact: true }).click();
  await save();
  lesson2 = await stored();
  expect(lesson2.activities).toHaveLength(0);
  expect(lesson2.estimatedDuration).toBe(0);
  await page.reload();
  await expect(page.getByText('Duración total:')).toContainText('0 min');

  // Pantalla estrecha: el editor sigue siendo utilizable y no desborda.
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel('Tipo de la nueva actividad').selectOption('Writing');
  await page.getByRole('button', { name: 'Agregar actividad' }).click();
  await page.getByLabel('Título de la actividad').fill('Redacción');
  await page.getByLabel('Instrucciones', { exact: true }).fill('Escribe un párrafo.');
  await page.getByLabel('Consigna').fill('Cuenta tu último viaje.');
  await page.getByLabel('Duración (minutos)').fill('20');
  // The total and the single activity both read "20 min", so each one is asserted on its own node.
  await expect(page.getByText('Duración total:')).toContainText('20 min');
  await expect(page.locator('.activity-duration')).toHaveText(['20 min']);
  await page.screenshot({ path: '../.tools/activity-editor-mobile.png', fullPage: true });
});
