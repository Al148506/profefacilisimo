import { test, expect } from '@playwright/test';
test('register, login, restore after reload and logout against the real API', async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  const email = 'e2e-' + Date.now() + '@example.com';
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Qué bueno verte de nuevo' })).toBeVisible();
  await page.screenshot({ path: '../.tools/login-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Crea una cuenta' }).click();
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill('E2ePassword12345');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Tu cuenta está lista' })).toBeVisible();
  await page.getByRole('link', { name: 'Iniciar sesión' }).click();
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill('E2ePassword12345');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Mis clases' })).toBeVisible();
  await expect(page.getByText('Cuenta verificada con la API')).toBeVisible();
  await page.screenshot({ path: '../.tools/dashboard-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '../.tools/dashboard-mobile.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mis clases' })).toBeVisible();
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Qué bueno verte de nuevo' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Qué bueno verte de nuevo' })).toBeVisible();
});


