import { test, expect } from '@playwright/test';

// Temporary visual check of the activity editor. Not part of the suite: it is removed after use.
test('activity editor renders, validates and adapts to a narrow screen', async ({ page }) => {
  const email = 'visual-' + Date.now() + '@example.com';
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
  const created = await page.request.post('/api/lessons', {
    headers: { Authorization: 'Bearer ' + session.accessToken },
    data: { title: 'Viajes y pasado', level: 'B1', topic: 'Viajes', objective: 'Practicar el pretérito indefinido' },
  });
  expect(created.status()).toBe(201);
  const lesson = await created.json();
  await page.goto('/lessons/' + lesson.id + '/edit');
  await expect(page.getByRole('heading', { name: 'Editar clase' })).toBeVisible();

  // Reading activity: text plus two questions.
  await page.getByLabel('Tipo de la nueva actividad').selectOption('Reading');
  await page.getByRole('button', { name: 'Agregar actividad' }).click();
  await page.getByLabel('Título de la actividad').fill('Lectura: un viaje a Sevilla');
  await page.getByLabel('Instrucciones', { exact: true }).fill('Lee el texto y responde a las preguntas.');
  await page.getByLabel('Texto de lectura').fill('El verano pasado viajé a Sevilla con mi hermana. Visitamos la Giralda y comimos tapas en el barrio de Triana.');
  await page.getByLabel('Pregunta 1').fill('¿Con quién viajó?');
  await page.getByRole('button', { name: 'Añadir pregunta' }).click();
  await page.getByLabel('Pregunta 2').fill('¿Qué visitaron?');
  await page.getByLabel('Duración (minutos)').fill('15');

  // Second activity: vocabulary and grammar, still without a duration.
  await page.getByLabel('Tipo de la nueva actividad').selectOption('VocabularyGrammar');
  await page.getByRole('button', { name: 'Agregar actividad' }).click();
  await page.getByLabel('Título de la actividad').fill('Pretérito indefinido');
  await page.getByLabel('Instrucciones', { exact: true }).fill('Completa los ejercicios.');
  await page.getByLabel('Explicación').fill('El pretérito indefinido expresa acciones terminadas: viajé, comí, visitamos.');
  await page.getByLabel('Ejercicio 1').fill('Ayer (ir) ___ al cine.');
  await expect(page.getByText('Duración incompleta')).toBeVisible();

  // Saving with an incomplete duration refuses the whole lesson and marks the activity.
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Indica la duración en minutos.')).toBeVisible();
  await page.getByLabel('Duración (minutos)').fill('10');
  await expect(page.getByText('25 min')).toBeVisible();
  await page.getByRole('button', { name: 'Subir Pretérito indefinido' }).click();
  await page.getByRole('button', { name: 'Subir Pretérito indefinido' }).click();
  await page.screenshot({ path: '../.tools/activity-editor-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '../.tools/activity-editor-mobile.png', fullPage: true });
});
