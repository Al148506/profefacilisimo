import { test, expect } from '@playwright/test';

test('private lesson list combines local filters and survives reload', async ({ page }) => {
  const email = 'lessons-' + Date.now() + '@example.com';
  const password = 'E2ePassword12345';
  const registration = await page.request.post('/api/auth/register', {
    headers: { Origin: 'http://localhost:5173', 'X-Requested-With': 'Profefacilisimo' },
    data: { email, password },
  });
  expect(registration.status()).toBe(201);
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  const loggedIn = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  const session = await (await loggedIn).json();
  await expect(page.getByRole('heading', { name: 'Mis clases' })).toBeVisible();
  await expect(page.getByText('Aún no tienes clases.')).toBeVisible();
  for (const [title, level] of [['Viajes cortos', 'B1'], ['Viajes largos', 'B2'], ['Cocina', 'A2']]) {
    const response = await page.request.post('/api/lessons', {
      headers: { Authorization: 'Bearer ' + session.accessToken },
      data: { title, level, topic: 'Tema de prueba', objective: 'Practicar español' },
    });
    expect(response.status()).toBe(201);
  }
  await page.reload();
  await expect(page.getByRole('listitem')).toHaveCount(3);
  await page.getByLabel('Buscar por título').fill(' viajes ');
  await page.getByLabel('Nivel', { exact: true }).selectOption('B2');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Viajes largos' })).toBeVisible();
  await expect(page).toHaveURL('http://localhost:5173/');
  await page.getByLabel('Buscar por título').fill('Inexistente');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByText('No hay clases que coincidan con estos filtros.')).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(3);
  await page.screenshot({ path: '../.tools/lessons-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Mis clases' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '../.tools/lessons-mobile.png', fullPage: true });
});

test('create and edit metadata, reload saved values and cancel discarding a draft', async ({ page }) => {
  const email = 'editor-' + Date.now() + '@example.com';
  const password = 'E2ePassword12345';
  expect((await page.request.post('/api/auth/register', {
    headers: { Origin: 'http://localhost:5173', 'X-Requested-With': 'Profefacilisimo' },
    data: { email, password },
  })).status()).toBe(201);
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByRole('link', { name: 'Crear clase', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Este campo es obligatorio.')).toHaveCount(3);
  await page.getByLabel('Título', { exact: true }).fill(' Clase nueva ');
  await page.getByLabel('Nivel', { exact: true }).selectOption('B2');
  await page.getByLabel('Tema', { exact: true }).fill('Viajes');
  await page.getByLabel('Objetivo', { exact: true }).fill('Hablar del pasado');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Editar clase' })).toBeVisible();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Clase nueva');
  await page.getByLabel('Título', { exact: true }).fill('Clase editada');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Clase guardada.');
  await page.reload();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Clase editada');
  await expect(page.getByLabel('Nivel', { exact: true })).toHaveValue('B2');
  await page.getByLabel('Título', { exact: true }).fill('Borrador no guardado');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Volver a Mis clases' }).click();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Borrador no guardado');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Volver a Mis clases' }).click();
  await page.getByRole('link', { name: 'Editar Clase editada', exact: true }).click();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Clase editada');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '../.tools/editor-mobile.png', fullPage: true });
});
